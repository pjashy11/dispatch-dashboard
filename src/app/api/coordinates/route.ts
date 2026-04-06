import { NextResponse } from "next/server";
import { fetchSetupInfo } from "@/lib/welltrax";

// Server-side coordinate cache: name → { lat, lng } or null
const pickupCoordCache = new Map<string, { lat: number; lng: number } | null>();
const dropoffCoordCache = new Map<string, { lat: number; lng: number } | null>();

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
      if (pickupCoordCache.has(key)) {
        result.pickup = pickupCoordCache.get(key) || undefined;
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
        pickupCoordCache.set(key, found);
        if (found) result.pickup = found;
      }
    }

    // Lookup dropoff coordinates (cache first)
    if (dropoffName) {
      const key = dropoffName.toUpperCase();
      if (dropoffCoordCache.has(key)) {
        result.dropoff = dropoffCoordCache.get(key) || undefined;
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
        dropoffCoordCache.set(key, found);
        if (found) result.dropoff = found;
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Coordinates] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
