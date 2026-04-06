"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Load } from "@/lib/types";

interface RouteMapProps {
  load: Load;
}

interface Coords {
  lat: number;
  lng: number;
}

interface DirectionsData {
  distance: string;
  duration: string;
  overviewPolyline: string;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Client-side caches — persist across re-renders and load selections
const coordsCache: Record<string, { pickup: Coords | null; dropoff: Coords | null }> = {};
const directionsCache: Record<string, DirectionsData> = {};

function coordsCacheKey(pickupName: string, dropoffName: string) {
  return `${pickupName}||${dropoffName}`;
}

function directionsCacheKey(p: Coords, d: Coords) {
  return `${p.lat},${p.lng}->${d.lat},${d.lng}`;
}

// Decode Google's encoded polyline format
function decodePolyline(encoded: string): Coords[] {
  const points: Coords[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Inner component that draws route polyline + markers */
function RouteRenderer({
  pickupCoords,
  dropoffCoords,
  pickupName,
  dropoffName,
  directions,
}: {
  pickupCoords: Coords;
  dropoffCoords: Coords;
  pickupName: string;
  dropoffName: string;
  directions: DirectionsData | null;
}) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");

  useEffect(() => {
    if (!map || !markerLib) return;

    const pickupMarker = new markerLib.AdvancedMarkerElement({
      map,
      position: pickupCoords,
      title: `Pickup: ${pickupName}`,
    });

    const dropoffMarker = new markerLib.AdvancedMarkerElement({
      map,
      position: dropoffCoords,
      title: `Drop Off: ${dropoffName}`,
    });

    let polyline: google.maps.Polyline | null = null;
    if (directions?.overviewPolyline) {
      const path = decodePolyline(directions.overviewPolyline);
      polyline = new google.maps.Polyline({
        path,
        strokeColor: "#3b82f6",
        strokeWeight: 4,
        strokeOpacity: 0.85,
        map,
      });

      const bounds = new google.maps.LatLngBounds();
      for (const p of path) bounds.extend(p);
      map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
    } else {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(pickupCoords);
      bounds.extend(dropoffCoords);
      map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
    }

    return () => {
      pickupMarker.map = null;
      dropoffMarker.map = null;
      polyline?.setMap(null);
    };
  }, [map, markerLib, pickupCoords, dropoffCoords, pickupName, dropoffName, directions]);

  return null;
}

export default function RouteMap({ load }: RouteMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords | null>(null);
  const [directions, setDirections] = useState<DirectionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when load changes
  useEffect(() => {
    setExpanded(false);
    setPickupCoords(null);
    setDropoffCoords(null);
    setDirections(null);
    setError(null);
  }, [load.id]);

  const handleShowRoute = async () => {
    if (!load.pickupName || !load.dropoffName) return;
    setExpanded(true);
    setLoading(true);
    setError(null);

    try {
      // Step 1: Coordinates (check cache first)
      const cKey = coordsCacheKey(load.pickupName, load.dropoffName);
      let coords = coordsCache[cKey];

      if (!coords) {
        const params = new URLSearchParams({
          pickup: load.pickupName,
          dropoff: load.dropoffName,
        });
        const res = await fetch(`/api/coordinates?${params}`);
        const data = await res.json();
        coords = {
          pickup: data.pickup || null,
          dropoff: data.dropoff || null,
        };
        coordsCache[cKey] = coords;
      }

      setPickupCoords(coords.pickup);
      setDropoffCoords(coords.dropoff);

      if (!coords.pickup || !coords.dropoff) {
        setError("Coordinates not found for pickup or dropoff");
        setLoading(false);
        return;
      }

      // Step 2: Directions (check cache first)
      const dKey = directionsCacheKey(coords.pickup, coords.dropoff);
      let dirs = directionsCache[dKey];

      if (!dirs) {
        const params = new URLSearchParams({
          originLat: String(coords.pickup.lat),
          originLng: String(coords.pickup.lng),
          destLat: String(coords.dropoff.lat),
          destLng: String(coords.dropoff.lng),
        });
        const res = await fetch(`/api/directions?${params}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }
        dirs = data;
        directionsCache[dKey] = data;
      }

      setDirections(dirs!);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!load.pickupName || !load.dropoffName) return null;
  if (!API_KEY) return null;

  const hasCoords = pickupCoords != null && dropoffCoords != null;
  const center = hasCoords
    ? { lat: (pickupCoords.lat + dropoffCoords.lat) / 2, lng: (pickupCoords.lng + dropoffCoords.lng) / 2 }
    : { lat: 31.97, lng: -102.08 };

  if (!expanded) {
    return (
      <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <button
          onClick={handleShowRoute}
          className="px-3 py-1.5 text-sm rounded transition-colors"
          style={{
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-input-border)",
            color: "var(--color-text-primary)",
          }}
        >
          Show Route
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between">
        <div
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Route
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Hide
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading route...
        </div>
      )}

      {error && !loading && <div className="text-sm text-red-400">{error}</div>}

      {directions && !error && (
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Distance: </span>
            <span className="font-semibold" style={{ color: "rgb(74,222,128)" }}>
              {directions.distance}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>Duration: </span>
            <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {directions.duration}
            </span>
          </div>
        </div>
      )}

      {hasCoords && (
        <APIProvider apiKey={API_KEY}>
          <div
            className="rounded-lg overflow-hidden"
            style={{ height: "250px", border: "1px solid var(--color-border)" }}
          >
            <Map
              defaultCenter={center}
              defaultZoom={7}
              mapId="route-map"
              gestureHandling="cooperative"
              disableDefaultUI={false}
              zoomControl={true}
              streetViewControl={false}
              mapTypeControl={true}
              fullscreenControl={false}
            >
              <RouteRenderer
                pickupCoords={pickupCoords}
                dropoffCoords={dropoffCoords}
                pickupName={load.pickupName}
                dropoffName={load.dropoffName}
                directions={directions}
              />
            </Map>
          </div>
        </APIProvider>
      )}
    </div>
  );
}
