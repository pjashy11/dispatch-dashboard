import { NextResponse } from "next/server";
import { fetchSetupInfo } from "@/lib/welltrax";

const CRUDE_COMMODITY_ID = 1;

interface CachedPickup {
  id: number;
  name: string;
  operator: string;
  terminals: string[];
  tanks: { id: number; tankNumber: string; capacity: number }[];
  defaultDropoffs: { id: number; name: string; accountName: string; accountId: number | null }[];
  latitude: number | null;
  longitude: number | null;
}

interface CachedAccount {
  name: string;
  pickups: CachedPickup[];
}

// In-memory cache: accountName → CachedAccount
const pickupCache: Map<string, CachedAccount> = new Map();
let cacheBuiltAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Resolve dropoff names to their account names via DROP_OFF setupinfo lookup.
// The DROP_OFF target returns dropoffs nested under their accounts,
// which DO have account names (unlike the default dropoff objects on pickups).
async function resolveDropoffAccounts(
  dropoffNames: string[]
): Promise<Map<string, { accountName: string; accountId: number }[]>> {
  const resultMap = new Map<string, { accountName: string; accountId: number }[]>();
  if (dropoffNames.length === 0) return resultMap;

  for (const dropName of dropoffNames) {
    try {
      const result = await fetchSetupInfo([
        {
          target: "DROP_OFF",
          searchCriteria: {
            dropOffName: dropName,
            offset: "0",
            limit: "20",
            sortBy: "name",
            sortOrder: "ASC",
          },
        },
      ]);

      if (result.ok) {
        const retList = result.data?.result?.[0]?.retList ?? [];
        const accounts: { accountName: string; accountId: number }[] = [];
        // retList items are accounts, each with dropOffList
        for (const acct of retList) {
          const acctName = acct.contact?.fullName || acct.fullName || acct.name || "";
          const acctId = acct.id;
          for (const drop of acct.dropOffList || []) {
            const dName = drop.contact?.fullName || drop.fullName || drop.name || "";
            if (dName.toUpperCase() === dropName.toUpperCase() && acctName) {
              accounts.push({ accountName: acctName, accountId: acctId });
            }
          }
        }
        if (accounts.length > 0) {
          resultMap.set(dropName, accounts);
        }
      }
    } catch (err) {
      console.warn(`[Pickups] Failed to resolve dropoff "${dropName}":`, err);
    }
  }

  return resultMap;
}

async function fetchPickupsForAccount(
  accountName: string
): Promise<CachedAccount> {
  // Paginate through all results for this account
  const allPickups: CachedPickup[] = [];
  let offset = 0;
  const pageSize = 500;

  // Collect dropoff names that need account name resolution
  const unresolvedDropoffNames = new Set<string>();

  while (true) {
    const result = await fetchSetupInfo([
      {
        target: "PICK_UP",
        searchCriteria: {
          accountName,
          offset: String(offset),
          limit: String(pageSize),
          sortBy: "name",
          sortOrder: "ASC",
        },
      },
    ]);

    if (!result.ok) break;
    const retList = result.data?.result?.[0]?.retList ?? [];
    if (retList.length === 0) break;

    for (const account of retList) {
      for (const pu of account.pickUpList || []) {
        if (!pu.isActive) continue;
        // Filter to CRUDE commodity only
        if (pu.commodityId !== CRUDE_COMMODITY_ID) continue;
        // Extract terminal names from terminalList
        const puTerminals: string[] = (pu.terminalList || [])
          .map((t: any) => t.contact?.fullName || t.name || "")
          .filter(Boolean);

        const defaultDropoffs: CachedPickup["defaultDropoffs"] = [];
        for (const d of pu.defaultDropOffList || []) {
          const dropName = d.contact?.fullName || d.fullName || d.name || "";
          const acctName =
            d.account?.contact?.fullName ||
            d.account?.fullName ||
            d.account?.name ||
            d.accountName ||
            "";
          const acctId = d.account?.id || d.accountId || null;

          // Track dropoff names that need account resolution
          if (!acctName && dropName) {
            unresolvedDropoffNames.add(dropName);
          }

          defaultDropoffs.push({
            id: d.id,
            name: dropName,
            accountName: acctName,
            accountId: acctId,
          });
        }

        allPickups.push({
          id: pu.id,
          name: pu.contact?.fullName || pu.name || "",
          operator: pu.operator?.contact?.fullName || "",
          terminals: puTerminals,
          latitude: (pu.contact?.geocode?.valid !== false && typeof pu.contact?.geocode?.latitude === "number") ? pu.contact.geocode.latitude : null,
          longitude: (pu.contact?.geocode?.valid !== false && typeof pu.contact?.geocode?.longitude === "number") ? pu.contact.geocode.longitude : null,
          tanks: (pu.tanksList || [])
            .filter((t: any) => t.tankIsActive)
            .map((t: any) => ({
              id: t.id,
              tankNumber: t.tankNumber,
              capacity: t.capacity,
            }))
            .sort((a: any, b: any) => a.tankNumber.localeCompare(b.tankNumber)),
          defaultDropoffs,
        });
      }
    }

    if (retList.length < pageSize) break;
    offset += pageSize;
  }

  // Resolve dropoff names to account names via DROP_OFF lookup
  if (unresolvedDropoffNames.size > 0) {
    console.log(
      `[Pickups] Resolving ${unresolvedDropoffNames.size} dropoff account names for "${accountName}"...`
    );
    const dropoffAccountMap = await resolveDropoffAccounts(
      Array.from(unresolvedDropoffNames)
    );

    // Patch resolved account names back into the pickups
    // A dropoff can belong to multiple accounts — we need to expand:
    // if a default dropoff "GENEVA" resolves to [SHELL, GULFMARK],
    // we replace the single entry with one entry per account
    for (const pickup of allPickups) {
      const expanded: CachedPickup["defaultDropoffs"] = [];
      for (const drop of pickup.defaultDropoffs) {
        if (!drop.accountName && drop.name && dropoffAccountMap.has(drop.name)) {
          // Replace with one entry per resolved account
          for (const resolved of dropoffAccountMap.get(drop.name)!) {
            expanded.push({
              id: drop.id,
              name: drop.name,
              accountName: resolved.accountName,
              accountId: resolved.accountId,
            });
          }
        } else {
          expanded.push(drop);
        }
      }
      pickup.defaultDropoffs = expanded;
    }
  }

  // Sort pickups A-Z by name
  allPickups.sort((a, b) => a.name.localeCompare(b.name));

  console.log(
    `[Pickups] Fetched ${allPickups.length} active pickups for "${accountName}"`
  );

  return { name: accountName, pickups: allPickups };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountName = searchParams.get("account");
  const terminalFilter = searchParams.get("terminal");

  if (!accountName) {
    return NextResponse.json(
      { error: "account parameter required" },
      { status: 400 }
    );
  }

  try {
    // Check cache
    const isCacheValid = Date.now() - cacheBuiltAt < CACHE_TTL;
    let account: CachedAccount;
    let cached = true;

    if (isCacheValid && pickupCache.has(accountName)) {
      account = pickupCache.get(accountName)!;
    } else {
      account = await fetchPickupsForAccount(accountName);
      pickupCache.set(accountName, account);
      if (!isCacheValid) cacheBuiltAt = Date.now();
      cached = false;
    }

    // Filter by terminal if provided
    if (terminalFilter) {
      const filtered = {
        ...account,
        pickups: account.pickups.filter(
          (p) => p.terminals.length === 0 || p.terminals.includes(terminalFilter)
        ),
      };
      return NextResponse.json({ account: filtered, cached });
    }

    return NextResponse.json({ account, cached });
  } catch (error: any) {
    console.error("[Pickups] Fetch error:", error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST to invalidate cache
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "refresh") {
      pickupCache.clear();
      cacheBuiltAt = 0;

      const accounts: string[] = body.accounts || [];
      let refreshed = 0;

      for (const accountName of accounts) {
        const account = await fetchPickupsForAccount(accountName);
        pickupCache.set(accountName, account);
        refreshed++;
      }

      cacheBuiltAt = Date.now();
      return NextResponse.json({
        success: true,
        refreshed,
        message: `Cache cleared. ${refreshed} accounts re-fetched.`,
      });
    }

    if (body.action === "clear") {
      pickupCache.clear();
      cacheBuiltAt = 0;
      return NextResponse.json({ success: true, message: "Cache cleared." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Pickups] Cache error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
