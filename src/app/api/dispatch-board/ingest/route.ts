import { NextRequest, NextResponse } from "next/server";
import {
  getCachedBoard,
  setCachedBoard,
  getAllCachedBoards,
} from "@/lib/boardCache";

// Re-export for the dispatch-board route to use
export { getCachedBoard };

/**
 * POST /api/dispatch-board/ingest
 *
 * Receives dispatch board data from the Chrome extension.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { terminalId, date, commodityId, data, timestamp } = body;

    if (!data || (!data.SCHEDULE_DRIVERS_WORKING && !data.SCHEDULE_DRIVERS_NOT_WORKING)) {
      return NextResponse.json({ error: "No driver data" }, { status: 400 });
    }

    // Extract terminal name from the first working driver's terminals array
    const workingDrivers = data.SCHEDULE_DRIVERS_WORKING || [];
    let terminalName = "";
    for (const wd of workingDrivers) {
      const terminals = wd.driver?.terminals || [];
      if (terminals.length > 0) {
        terminalName = terminals[0].contact?.fullName || terminals[0].name || "";
        break;
      }
    }

    setCachedBoard(String(terminalId), String(date), String(commodityId), {
      data,
      timestamp: timestamp || Date.now(),
      terminalId: String(terminalId),
      terminalName,
      date: String(date),
      commodityId: String(commodityId),
    });

    const working = data.SCHEDULE_DRIVERS_WORKING?.length || 0;
    const notWorking = data.SCHEDULE_DRIVERS_NOT_WORKING?.length || 0;

    console.log(
      `[Ingest] Received dispatch board: terminal=${terminalId} (${terminalName}) date=${date} ` +
      `commodity=${commodityId} working=${working} notWorking=${notWorking}`
    );

    return NextResponse.json({
      ok: true,
      cached: `${terminalId}:${date}:${commodityId}`,
      workingDrivers: working,
      notWorkingDrivers: notWorking,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/dispatch-board/ingest
 *
 * Returns the status of cached dispatch board data.
 * Pass ?sample=1 to include a sample driver entry for debugging structure.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wantSample = searchParams.get("sample") === "1";

  const boards = getAllCachedBoards();
  // Build terminal name → ID mapping from cached data
  const terminalMap: Record<string, string> = {};
  for (const b of boards) {
    if (b.terminalName && b.terminalId) {
      terminalMap[b.terminalName] = b.terminalId;
    }
  }

  const result: any = {
    cached: boards.map((b) => ({
      terminalId: b.terminalId,
      terminalName: b.terminalName,
      date: b.date,
      commodityId: b.commodityId,
      workingDrivers: b.data.SCHEDULE_DRIVERS_WORKING?.length || 0,
      notWorkingDrivers: b.data.SCHEDULE_DRIVERS_NOT_WORKING?.length || 0,
      ageSeconds: Math.round((Date.now() - b.timestamp) / 1000),
    })),
    terminalMap,
  };

  if (wantSample && boards.length > 0) {
    const first = boards[0].data;
    const workingDrivers = first.SCHEDULE_DRIVERS_WORKING || [];
    const notWorkingDrivers = first.SCHEDULE_DRIVERS_NOT_WORKING || [];
    result.sampleWorking = workingDrivers[0] || null;
    result.sampleNotWorking = notWorkingDrivers[0] || null;
    result.workingKeys = workingDrivers[0] ? Object.keys(workingDrivers[0]) : [];
    result.notWorkingKeys = notWorkingDrivers[0] ? Object.keys(notWorkingDrivers[0]) : [];
  }

  return NextResponse.json(result);
}
