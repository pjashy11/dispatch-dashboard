import { NextResponse } from "next/server";
import { fetchSetupInfo } from "@/lib/welltrax";

interface CachedPickupAccount {
  id: number;
  name: string;
  terminals: string[];
}

let accountCache: CachedPickupAccount[] = [];
let cacheBuiltAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchAllPickupAccounts(): Promise<CachedPickupAccount[]> {
  const allAccounts: CachedPickupAccount[] = [];
  let offset = 0;
  const pageSize = 5000;
  let totalRetListItems = 0;

  while (true) {
    const result = await fetchSetupInfo([
      {
        target: "PICK_UP",
        searchCriteria: {
          isActive: "true",
          commodityName: "CRUDE",
          offset: String(offset),
          limit: String(pageSize),
          sortBy: "name",
          sortOrder: "ASC",
        },
      },
    ]);

    if (!result.ok) {
      console.warn(`[PickupAccounts] Fetch failed at offset ${offset}:`, result.status);
      break;
    }
    const retList = result.data?.result?.[0]?.retList ?? [];
    if (retList.length === 0) break;
    totalRetListItems += retList.length;

    for (const account of retList) {
      const acctName =
        account.contact?.fullName || account.fullName || account.name || "";
      const acctId = account.id;
      if (!acctName) continue;

      const terminalSet = new Set<string>();
      for (const pu of account.pickUpList || []) {
        for (const t of pu.terminalList || []) {
          const tName = t.contact?.fullName || t.name || "";
          if (tName) terminalSet.add(tName);
        }
      }

      allAccounts.push({
        id: acctId,
        name: acctName,
        terminals: Array.from(terminalSet),
      });
    }

    if (retList.length < pageSize) break;
    offset += pageSize;
  }

  allAccounts.sort((a, b) => a.name.localeCompare(b.name));
  console.log(
    `[PickupAccounts] Fetched ${allAccounts.length} active CRUDE pickup accounts (${totalRetListItems} total retList items)`
  );

  return allAccounts;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminalFilter = searchParams.get("terminal");

  try {
    const isCacheValid = Date.now() - cacheBuiltAt < CACHE_TTL;

    if (!isCacheValid || accountCache.length === 0) {
      accountCache = await fetchAllPickupAccounts();
      cacheBuiltAt = Date.now();
    }

    let accounts = accountCache;

    if (terminalFilter) {
      accounts = accounts.filter(
        (a) => a.terminals.length === 0 || a.terminals.includes(terminalFilter)
      );
    }

    return NextResponse.json({ accounts, cached: isCacheValid });
  } catch (error: any) {
    console.error("[PickupAccounts] Fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "clear") {
      accountCache = [];
      cacheBuiltAt = 0;
      return NextResponse.json({ success: true, message: "Pickup account cache cleared." });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
