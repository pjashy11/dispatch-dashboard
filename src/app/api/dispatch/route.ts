import { NextResponse } from "next/server";
import { fetchTicketsChunked } from "@/lib/welltrax";
import type { DispatchLoad } from "@/lib/types";

function extractDate(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.date || "";
}

function computeProgress(status: string, puDynamic: any, doDynamic: any): number {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETE") return 100;
  if (s === "OPEN") return 0;

  // Check milestones in order
  const hasPuArrival = !!puDynamic?.arrivalDateTime?.date;
  const hasPuDeparture = !!puDynamic?.departureDateTime?.date;
  const hasDoArrival = !!doDynamic?.arrivalDateTime?.date;
  const hasDoDeparture = !!doDynamic?.departureDateTime?.date;

  if (hasDoDeparture) return 95;
  if (hasDoArrival) return 80;
  if (hasPuDeparture) return 55;
  if (hasPuArrival) return 35;

  // ASSIGNED or ONGOING with no milestones yet
  if (s === "ONGOING") return 15;
  return 0; // ASSIGNED
}

function mapToDispatchLoad(item: any): DispatchLoad {
  const load = item.load || {};
  const pu = load.pickUpList?.[0] || {};
  const doItem = load.dropOffList?.[0] || {};
  const driver = item.driverAssigned || {};

  // Extract milestone data from dynamicLoad
  const dynamicLoad = item.dynamicLoad || {};
  const puDynamic = dynamicLoad.pickUpList?.[0] || {};
  const doDynamic = dynamicLoad.dropOffList?.[0] || {};
  const pickupArrivalDate = extractDate(puDynamic.arrivalDateTime);
  const progress = computeProgress(load.status, puDynamic, doDynamic);

  // Convert dispatcherLoadAssignedDateTime to sortable format "YYYY/MM/DD HH:MM"
  const dispAssigned = item.dispatcherLoadAssignedDateTime;
  let dispatchedAt = "";
  if (dispAssigned?.date && dispAssigned?.time) {
    const [m, d, y] = dispAssigned.date.split("/");
    dispatchedAt = `${y}/${m}/${d} ${dispAssigned.time}`;
  }

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

  const terminal =
    pu.terminalList?.[0]?.contact?.fullName ||
    pu.terminalList?.[0]?.name ||
    "";

  const pickupName = pu.contact?.fullName || "";
  const pickupOperator = pu.operator?.contact?.fullName || "";
  const dropoffName = doItem.contact?.fullName || "";

  const pickupAccountName =
    load.pickUpAccount?.contact?.fullName ||
    load.pickUpAccount?.fullName ||
    "";
  const dropoffAccountName =
    load.dropOffAccount?.contact?.fullName ||
    load.dropOffAccount?.fullName ||
    "";

  const tankName =
    pu.tanksList?.[0]?.tankNumber ||
    pu.tanksList?.[0]?.number ||
    "";

  const puGeo = pu.contact?.geocode;
  const doGeo = doItem.contact?.geocode;

  return {
    id: load.id,
    bolNumber: load.billOfLadingNumber || "",
    confirmationNo:
      Array.isArray(load.confirmationNos) && load.confirmationNos.length > 0
        ? load.confirmationNos[0]
        : "",
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
    pickupArrivalDate,
    progress,
    dispatchedAt,
    driverName: driver.contact?.fullName || "",
    commodity: load.commodityName || "",
    isUrgent: load.isUrgent === true,
    loadInstructions: load.loadInstructions || "",
    aging,
    pickupLat: (puGeo?.valid !== false && typeof puGeo?.latitude === "number") ? puGeo.latitude : null,
    pickupLng: (puGeo?.valid !== false && typeof puGeo?.longitude === "number") ? puGeo.longitude : null,
    dropoffLat: (doGeo?.valid !== false && typeof doGeo?.latitude === "number") ? doGeo.latitude : null,
    dropoffLng: (doGeo?.valid !== false && typeof doGeo?.longitude === "number") ? doGeo.longitude : null,
    // Dispatch-specific fields
    driverId: driver.id || null,
    driverHostId: driver.hostID || "",
    driverPhone: driver.contact?.phone1 ? String(driver.contact.phone1) : "",
    driverCarrier: driver.contractor?.contact?.fullName || driver.driverGroupList?.[0]?.name || "",
    sequenceNumber: puDynamic.sequenceNumber ?? null,
    shiftDate: extractDate(item.driverShiftDate),
  };
}

/* ── Server-side load cache (stale-while-revalidate) ──────────── */
interface LoadCache {
  loads: DispatchLoad[];
  timestamp: number;
  refreshing: boolean;
}

export const loadCacheByTerminal = new Map<string, LoadCache>();
const CACHE_FRESH = 2 * 60 * 1000;   // 2 min — serve instantly, no refresh
const CACHE_STALE = 10 * 60 * 1000;  // 10 min — serve instantly, refresh in background
// Beyond 10 min — wait for fresh data

async function fetchAllLoads(): Promise<DispatchLoad[]> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setDate(todayStart.getDate() - 1);
  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
  const ongoingStart = new Date(now);
  ongoingStart.setDate(ongoingStart.getDate() - 14);

  const [activeItems, openItems] = await Promise.all([
    fetchTicketsChunked(ongoingStart, tomorrowEnd, {
      statusList: ["ASSIGNED", "ONGOING", "COMPLETE"],
      dateType: "LOAD_CREATION",
    }),
    fetchTicketsChunked(todayStart, tomorrowEnd, {
      statusList: ["OPEN"],
      dateType: "REQUESTED_PICKUP",
    }),
  ]);

  const allItems = [...activeItems, ...openItems];
  const loads = allItems.map(mapToDispatchLoad);

  // Deduplicate by id
  const seen = new Set<number>();
  return loads.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}

function filterByTerminal(loads: DispatchLoad[], terminalsParam: string): DispatchLoad[] {
  const terminalList = terminalsParam.split(",").map((t) => t.toLowerCase().trim());
  return loads.filter((l) =>
    terminalList.some((t) => l.terminal.toLowerCase().includes(t))
  );
}

/** Background-refresh a cache entry without blocking the response. */
function refreshInBackground(cacheKey: string) {
  const existing = loadCacheByTerminal.get(cacheKey);
  if (existing?.refreshing) return; // already refreshing
  if (existing) existing.refreshing = true;

  fetchAllLoads()
    .then((loads) => {
      loadCacheByTerminal.set(cacheKey, { loads, timestamp: Date.now(), refreshing: false });
    })
    .catch((err) => {
      console.error("[Dispatch] Background refresh failed:", err.message);
      if (existing) existing.refreshing = false;
    });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminalsParam = searchParams.get("terminals");
  const forceRefresh = searchParams.get("refresh") === "1";
  const cacheKey = "__all__"; // cache all loads, filter per-request

  const cached = loadCacheByTerminal.get(cacheKey);
  const age = cached ? Date.now() - cached.timestamp : Infinity;

  // Serve from cache if fresh enough
  if (!forceRefresh && cached && age < CACHE_STALE) {
    // If past fresh window, trigger background refresh
    if (age > CACHE_FRESH) {
      refreshInBackground(cacheKey);
    }
    const loads = terminalsParam ? filterByTerminal(cached.loads, terminalsParam) : cached.loads;
    return NextResponse.json({ loads, cached: true, ageSeconds: Math.round(age / 1000) });
  }

  // Cache is stale or empty — fetch fresh data
  try {
    const loads = await fetchAllLoads();
    loadCacheByTerminal.set(cacheKey, { loads, timestamp: Date.now(), refreshing: false });

    const filtered = terminalsParam ? filterByTerminal(loads, terminalsParam) : loads;
    return NextResponse.json({ loads: filtered });
  } catch (error: any) {
    // If fetch fails but we have stale data, serve it
    if (cached) {
      const loads = terminalsParam ? filterByTerminal(cached.loads, terminalsParam) : cached.loads;
      return NextResponse.json({ loads, cached: true, stale: true, ageSeconds: Math.round(age / 1000) });
    }
    console.error("[Dispatch] Fetch error:", error.message);
    return NextResponse.json(
      { error: error.message, loads: [] },
      { status: 500 }
    );
  }
}
