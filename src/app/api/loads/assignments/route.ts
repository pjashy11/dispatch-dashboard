import { NextResponse } from "next/server";
import { loadAssignments } from "@/lib/welltrax";
import { loadCacheByTerminal as dispatchCache } from "@/app/api/dispatch/route";
import { loadCache as openLoadsCache } from "@/app/api/loads/route";

const VALID_ACTIONS = ["add", "drop", "reassign", "rearrange", "cancel"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, loadId, billOfLadingNumber, confirmationNumber,
            driverId, driverHostId, driverFirstName, driverLastName,
            shiftDate, terminalId, terminalHostId, terminalName,
            sequenceNumber } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!loadId && !billOfLadingNumber && !confirmationNumber) {
      return NextResponse.json(
        { error: "A load identifier (loadId, billOfLadingNumber, or confirmationNumber) is required" },
        { status: 400 }
      );
    }

    // Build payload with only provided fields
    const payload: Record<string, unknown> = { action };
    if (loadId) payload.loadId = loadId;
    if (billOfLadingNumber) payload.billOfLadingNumber = billOfLadingNumber;
    if (confirmationNumber) payload.confirmationNumber = confirmationNumber;
    if (driverId) payload.driverId = driverId;
    if (driverHostId) payload.driverHostId = driverHostId;
    if (driverFirstName) payload.driverFirstName = driverFirstName;
    if (driverLastName) payload.driverLastName = driverLastName;
    if (shiftDate) payload.shiftDate = shiftDate;
    if (terminalId) payload.terminalId = terminalId;
    if (terminalHostId) payload.terminalHostId = terminalHostId;
    if (terminalName) payload.terminalName = terminalName;
    if (sequenceNumber != null) payload.sequenceNumber = sequenceNumber;

    const result = await loadAssignments([payload]);

    if (!result.ok) {
      console.error("[LoadAssignments] Failed:", result.status, result.body);
      return NextResponse.json(
        { error: `Load assignment failed: ${result.body}` },
        { status: result.status }
      );
    }

    let responseData;
    try {
      responseData = JSON.parse(result.body);
    } catch {
      responseData = result.body;
    }

    if (responseData?.errors?.length > 0) {
      const errorMsg = responseData.errors
        .map((e: any) => JSON.stringify(e.errorMap || e))
        .join("; ");
      return NextResponse.json(
        { error: `Welltrax error: ${errorMsg}` },
        { status: 400 }
      );
    }

    // Invalidate server-side caches so the next fetch gets fresh data
    dispatchCache.clear();
    openLoadsCache.clear();

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error("[LoadAssignments] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to process load assignment" },
      { status: 500 }
    );
  }
}
