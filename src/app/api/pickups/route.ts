import { NextResponse } from "next/server";
import { fetchSetupInfo } from "@/lib/welltrax";


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

async function fetchPickupsForAccount(
  accountName: string
): Promise<CachedAccount> {
  // Paginate through all results for this account
  const allPickups: CachedPickup[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const result = await fetchSetupInfo([
      {
        target: "PICK_UP",
        searchCriteria: {
          accountName,
          isActive: "true",
          commodityName: "CRUDE",
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

  // Sort pickups A-Z by name
  allPickups.sort((a, b) => a.name.localeCompare(b.name));

  const terminalSet = new Set(allPickups.flatMap((p) => p.terminals));
  console.log(
    `[Pickups] Fetched ${allPickups.length} active pickups for "${accountName}" | terminals: ${[...terminalSet].join(", ")}`
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

    // Filter by terminal if provided (case-insensitive partial match)
    if (terminalFilter) {
      const tf = terminalFilter.toLowerCase();
      const filtered = {
        ...account,
        pickups: account.pickups.filter(
          (p) => p.terminals.length === 0 || p.terminals.some((t) => t.toLowerCase().includes(tf) || tf.includes(t.toLowerCase()))
        ),
      };
      console.log(`[Pickups] Terminal filter "${terminalFilter}": ${account.pickups.length} → ${filtered.pickups.length} pickups`);
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
