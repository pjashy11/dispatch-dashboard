import { NextResponse } from "next/server";
import { fetchTicketsChunked } from "@/lib/welltrax";
import type { Load } from "@/lib/types";

function extractDate(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.date || "";
}

function mapToLoad(item: any): Load {
  const load = item.load || {};
  const pu = load.pickUpList?.[0] || {};
  const doItem = load.dropOffList?.[0] || {};

  let aging = 0;
  const assignedDate = extractDate(load.assignedPickUpDate);
  if (assignedDate) {
    const [m, d, y] = assignedDate.split("/").map(Number);
    if (m && d && y) {
      const assigned = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      aging = Math.floor((today.getTime() - assigned.getTime()) / 86400000);
    }
  }

  const terminal = pu.terminalList?.[0]?.contact?.fullName || pu.terminalList?.[0]?.name || "";
  const pickupName = pu.contact?.fullName || "";
  const pickupOperator = pu.operator?.contact?.fullName || "";
  const dropoffName = doItem.contact?.fullName || "";
  const pickupAccountName = load.pickUpAccount?.contact?.fullName || load.pickUpAccount?.fullName || "";
  const dropoffAccountName = load.dropOffAccount?.contact?.fullName || load.dropOffAccount?.fullName || "";
  const tankName = pu.tanksList?.[0]?.tankNumber || pu.tanksList?.[0]?.number || "";

  const puGeo = pu.contact?.geocode;
  const doGeo = doItem.contact?.geocode;

  return {
    id: load.id,
    bolNumber: load.billOfLadingNumber || "",
    confirmationNo: Array.isArray(load.confirmationNos) && load.confirmationNos.length > 0 ? load.confirmationNos[0] : "",
    status: load.status || "",
    pickupAccountName: typeof pickupAccountName === "string" ? pickupAccountName : "",
    pickupName,
    pickupOperator,
    tankName,
    dropoffAccountName: typeof dropoffAccountName === "string" ? dropoffAccountName : "",
    dropoffName,
    terminal,
    loadedMiles: load.loadedMiles ?? null,
    requestedPickupDate: extractDate(load.requestedPickUpDate),
    assignedPickupDate: extractDate(load.assignedPickUpDate),
    driverName: item.driverAssigned?.contact?.fullName || "",
    commodity: load.commodityName || "",
    isUrgent: load.isUrgent === true,
    loadInstructions: load.loadInstructions || "",
    aging,
    pickupLat: puGeo?.valid !== false && typeof puGeo?.latitude === "number" ? puGeo.latitude : null,
    pickupLng: puGeo?.valid !== false && typeof puGeo?.longitude === "number" ? puGeo.longitude : null,
    dropoffLat: doGeo?.valid !== false && typeof doGeo?.latitude === "number" ? doGeo.latitude : null,
    dropoffLng: doGeo?.valid !== false && typeof doGeo?.longitude === "number" ? doGeo.longitude : null,
  };
}

interface LoadCacheEntry {
  loads: Load[];
  timestamp: number;
  refreshing: boolean;
}

const loadCache = new Map<string, LoadCacheEntry>();
const CACHE_FRESH_MS = 60 * 1000;
const CACHE_STALE_MS = 5 * 60 * 1000;

function dedupeLoads(loads: Load[]) {
  const seen = new Set<number>();
  return loads.filter((load) => {
    if (seen.has(load.id)) return false;
    seen.add(load.id);
    return true;
  });
}

function filterByTerminal(loads: Load[], terminalsParam: string | null) {
  if (!terminalsParam) return loads;

  const terminalList = terminalsParam.split(",").map((terminal) => terminal.toLowerCase().trim());
  return loads.filter((load) =>
    terminalList.some((terminal) => load.terminal.toLowerCase().includes(terminal))
  );
}

async function fetchOpenLoads() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 14);
  const end = new Date(now);
  end.setDate(end.getDate() + 2);

  const items = await fetchTicketsChunked(start, end, {
    statusList: ["OPEN"],
    dateType: "LOAD_CREATION",
  });

  return dedupeLoads(items.map(mapToLoad));
}

function refreshInBackground(cacheKey: string) {
  const existing = loadCache.get(cacheKey);
  if (existing?.refreshing) return;
  if (existing) {
    existing.refreshing = true;
  }

  fetchOpenLoads()
    .then((loads) => {
      loadCache.set(cacheKey, {
        loads,
        timestamp: Date.now(),
        refreshing: false,
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Loads] Background refresh failed:", message);
      if (existing) {
        existing.refreshing = false;
      }
    });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminalsParam = searchParams.get("terminals");
  const forceRefresh = searchParams.get("refresh") === "1";
  const cacheKey = "__open__";

  const cached = loadCache.get(cacheKey);
  const ageMs = cached ? Date.now() - cached.timestamp : Infinity;

  if (!forceRefresh && cached && ageMs < CACHE_STALE_MS) {
    if (ageMs > CACHE_FRESH_MS) {
      refreshInBackground(cacheKey);
    }

    return NextResponse.json({
      loads: filterByTerminal(cached.loads, terminalsParam),
      cached: true,
      ageSeconds: Math.round(ageMs / 1000),
    });
  }

  try {
    const loads = await fetchOpenLoads();
    loadCache.set(cacheKey, {
      loads,
      timestamp: Date.now(),
      refreshing: false,
    });

    return NextResponse.json({ loads: filterByTerminal(loads, terminalsParam) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch open loads";
    if (cached) {
      return NextResponse.json({
        loads: filterByTerminal(cached.loads, terminalsParam),
        cached: true,
        stale: true,
        ageSeconds: Math.round(ageMs / 1000),
      });
    }

    console.error("[Loads] Fetch error:", message);
    return NextResponse.json({ error: message, loads: [] }, { status: 500 });
  }
}
