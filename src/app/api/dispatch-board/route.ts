import { NextRequest, NextResponse } from "next/server";
import { portalFetch, getPortalSession } from "@/lib/welltrax";
import { getCachedBoard } from "@/lib/boardCache";

/**
 * Fetch dispatch board schedule data.
 *
 * First checks the in-memory cache (populated by the Chrome extension).
 * Falls back to direct portal API call if a portal session exists.
 *
 * GET /api/dispatch-board?terminalId=2&date=2026-04-05&commodityId=1
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const terminalId = searchParams.get("terminalId") || "2";
  const date =
    searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const commodityId = searchParams.get("commodityId") || "1";

  // 1. Check the extension-ingested cache first
  const cached = getCachedBoard(terminalId, date, commodityId);
  if (cached) {
    return NextResponse.json({
      success: true,
      source: "extension",
      ageSeconds: Math.round((Date.now() - cached.timestamp) / 1000),
      workingDrivers: cached.data.SCHEDULE_DRIVERS_WORKING?.length ?? 0,
      notWorkingDrivers: cached.data.SCHEDULE_DRIVERS_NOT_WORKING?.length ?? 0,
      data: cached.data,
    });
  }

  // 2. Fall back to direct portal API call
  const session = getPortalSession();
  if (!session) {
    return NextResponse.json(
      {
        error:
          "No dispatch board data available. Open the Welltrax dispatch board to sync data via the browser extension.",
        needsExtension: true,
      },
      { status: 404 }
    );
  }

  const limitSize = searchParams.get("limitSize") || "50";
  const path = `schedule/dispatchBoard/filter/${terminalId}/${date}/${commodityId}?limitSize=${limitSize}&showSupplementals=false`;

  try {
    const res = await portalFetch(path);
    const text = await res.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}

    const hasDriverData =
      !!data?.SCHEDULE_DRIVERS_WORKING ||
      !!data?.SCHEDULE_DRIVERS_NOT_WORKING;

    if (!hasDriverData) {
      return NextResponse.json({
        success: false,
        source: "portal",
        status: res.status,
        preview: text.slice(0, 500),
      });
    }

    return NextResponse.json({
      success: true,
      source: "portal",
      status: res.status,
      workingDrivers: data.SCHEDULE_DRIVERS_WORKING?.length ?? 0,
      notWorkingDrivers: data.SCHEDULE_DRIVERS_NOT_WORKING?.length ?? 0,
      data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
