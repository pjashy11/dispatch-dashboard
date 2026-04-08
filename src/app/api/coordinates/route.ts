import { NextResponse } from "next/server";
import { fetchSetupInfo } from "@/lib/welltrax";

// Server-side coordinate cache: name → { lat, lng, cachedAt } or null
const COORD_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const pickupCoordCache = new Map<string, { lat: number; lng: number; cachedAt: number } | null>();
const dropoffCoordCache = new Map<string, { lat: number; lng: number; cachedAt: number } | null>();

function getCachedCoord(cache: Map<string, { lat: number; lng: number; cachedAt: number } | null>, key: string) {
  const entry = cache.get(key);
  if (entry === null) return null; // cached "not found"
  if (entry && Date.now() - entry.cachedAt < COORD_CACHE_TTL) return entry;
  if (entry) cache.delete(key); // expired
  return undefined; // not cached
}

/** Extract coordinates from a pickup or dropoff entity. */
function extractCoords(entity: any): { lat: number; lng: number } | null {
  // Primary location: contact.geocode.latitude/longitude
  const geocode = entity?.contact?.geocode;
  if (geocode && typeof geocode.latitude === "number" && typeof geocode.longitude === "number" && geocode.valid !== false) {
    return { lat: geocode.latitude, lng: geocode.longitude };
  }
  // Fallback: entryPointGeocode
  const entry = entity?.entryPointGeocode;
  if (entry && typeof entry.latitude === "number" && typeof entry.longitude === "number") {
    return { lat: entry.latitude, lng: entry.longitude };
  }
  return null;
}

/**
 * Lookup coordinates for a pickup and/or dropoff by name.
 * Uses WAPI_TMS11 setupinfo — coordinates are at contact.geocode.latitude/longitude.
 * Results are cached in memory.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pickupName = searchParams.get("pickup");
  const dropoffName = searchParams.get("dropoff");

  const result: Record<string, any> = {};

  try {
    // Lookup pickup coordinates (cache first)
    if (pickupName) {
      const key = pickupName.toUpperCase();
      const cached = getCachedCoord(pickupCoordCache, key);
      if (cached !== undefined) {
        if (cached) result.pickup = { lat: cached.lat, lng: cached.lng };
      } else {
        const res = await fetchSetupInfo([
          {
            target: "PICK_UP",
            searchCriteria: {
              pickUpName: pickupName,
              offset: "0",
              limit: "5",
              sortBy: "name",
              sortOrder: "ASC",
            },
          },
        ]);

        let found: { lat: number; lng: number } | null = null;
        if (res.ok) {
          const retList = res.data?.result?.[0]?.retList ?? [];
          for (const acct of retList) {
            for (const pu of acct.pickUpList || []) {
              const name = (pu.contact?.fullName || pu.name || "").toUpperCase();
              if (name === key) {
                found = extractCoords(pu);
                break;
              }
            }
            if (found) break;
          }
        }
        pickupCoordCache.set(key, found ? { ...found, cachedAt: Date.now() } : null);
        if (found) result.pickup = found;
      }
    }

    // Lookup dropoff coordinates (cache first)
    if (dropoffName) {
      const key = dropoffName.toUpperCase();
      const cached = getCachedCoord(dropoffCoordCache, key);
      if (cached !== undefined) {
        if (cached) result.dropoff = { lat: cached.lat, lng: cached.lng };
      } else {
        const res = await fetchSetupInfo([
          {
            target: "DROP_OFF",
            searchCriteria: {
              dropOffName: dropoffName,
              offset: "0",
              limit: "5",
              sortBy: "name",
              sortOrder: "ASC",
            },
          },
        ]);

        let found: { lat: number; lng: number } | null = null;
        if (res.ok) {
          const retList = res.data?.result?.[0]?.retList ?? [];
          for (const acct of retList) {
            for (const d of acct.dropOffList || []) {
              const name = (d.contact?.fullName || d.fullName || d.name || "").toUpperCase();
              if (name === key) {
                found = extractCoords(d);
                break;
              }
            }
            if (found) break;
          }
        }
        dropoffCoordCache.set(key, found ? { ...found, cachedAt: Date.now() } : null);
        if (found) result.dropoff = found;
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Coordinates] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
