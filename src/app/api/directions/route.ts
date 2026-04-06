import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const originLat = searchParams.get("originLat");
  const originLng = searchParams.get("originLng");
  const destLat = searchParams.get("destLat");
  const destLng = searchParams.get("destLng");

  if (!originLat || !originLng || !destLat || !destLng) {
    return NextResponse.json(
      { error: "originLat, originLng, destLat, destLng are all required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps API key not configured" },
      { status: 500 }
    );
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${apiKey}`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();

    if (data.status !== "OK") {
      return NextResponse.json({
        error: data.error_message || `Directions API returned: ${data.status}`,
        status: data.status,
      });
    }

    const leg = data.routes?.[0]?.legs?.[0];
    if (!leg) {
      return NextResponse.json({ error: "No route found" });
    }

    return NextResponse.json({
      distance: leg.distance.text,
      distanceMeters: leg.distance.value,
      duration: leg.duration.text,
      durationSeconds: leg.duration.value,
      overviewPolyline: data.routes[0].overview_polyline?.points || "",
      startLocation: leg.start_location,
      endLocation: leg.end_location,
    });
  } catch (error: any) {
    console.error("[Directions] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to fetch directions" },
      { status: 500 }
    );
  }
}
