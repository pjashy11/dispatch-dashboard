import { NextResponse } from "next/server";
import { fetchSetupInfo } from "@/lib/welltrax";

const CRUDE_COMMODITY_ID = 1;

interface CachedDropoff {
  id: number;
  name: string;
  terminals: string[];
  latitude: number | null;
  longitude: number | null;
}

interface CachedDropoffAccount {
  id: number;
  name: string;
  dropoffs: CachedDropoff[];
}

// In-memory cache: all dropoff accounts with their dropoffs
let dropoffCache: CachedDropoffAccount[] = [];
let cacheBuiltAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchAllDropoffAccounts(): Promise<CachedDropoffAccount[]> {
  const allAccounts: CachedDropoffAccount[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const result = await fetchSetupInfo([
      {
        target: "DROP_OFF",
        searchCriteria: {
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
      const acctName = account.contact?.fullName || account.fullName || account.name || "";
      const acctId = account.id;
      if (!acctName) continue;

      const dropoffs: CachedDropoff[] = [];
      for (const d of account.dropOffList || []) {
        if (!d.isActive) continue;
        // Filter to CRUDE commodity only
        if (d.commodityId !== CRUDE_COMMODITY_ID) continue;

        const terminals: string[] = (d.terminalList || [])
          .map((t: any) => t.contact?.fullName || t.name || "")
          .filter(Boolean);

        dropoffs.push({
          id: d.id,
          name: d.contact?.fullName || d.fullName || d.name || "",
          terminals,
          latitude: (d.contact?.geocode?.valid !== false && typeof d.contact?.geocode?.latitude === "number") ? d.contact.geocode.latitude : null,
          longitude: (d.contact?.geocode?.valid !== false && typeof d.contact?.geocode?.longitude === "number") ? d.contact.geocode.longitude : null,
        });
      }

      if (dropoffs.length > 0) {
        dropoffs.sort((a, b) => a.name.localeCompare(b.name));
        allAccounts.push({ id: acctId, name: acctName, dropoffs });
      }
    }

    if (retList.length < pageSize) break;
    offset += pageSize;
  }

  allAccounts.sort((a, b) => a.name.localeCompare(b.name));

  return allAccounts;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminalFilter = searchParams.get("terminal");

  try {
    const isCacheValid = Date.now() - cacheBuiltAt < CACHE_TTL;

    if (!isCacheValid || dropoffCache.length === 0) {
      dropoffCache = await fetchAllDropoffAccounts();
      cacheBuiltAt = Date.now();
    }

    let accounts = dropoffCache;

    // Filter by terminal if provided
    if (terminalFilter) {
      accounts = accounts
        .map((acct) => ({
          ...acct,
          dropoffs: acct.dropoffs.filter(
            (d) => d.terminals.length === 0 || d.terminals.includes(terminalFilter)
          ),
        }))
        .filter((acct) => acct.dropoffs.length > 0);
    }

    return NextResponse.json({ accounts, cached: isCacheValid });
  } catch (error: any) {
    console.error("[Dropoffs] Fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST to invalidate cache
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "clear") {
      dropoffCache = [];
      cacheBuiltAt = 0;
      return NextResponse.json({ success: true, message: "Dropoff cache cleared." });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
