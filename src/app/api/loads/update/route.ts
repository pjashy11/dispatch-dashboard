import { NextResponse } from "next/server";
import { updateLoad } from "@/lib/welltrax";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      billOfLadingNumber,
      pickUpName,
      pickUpTankNumber,
      dropOffAccountName,
      dropOffName,
      requestedPickUpDate,
      requestedDropOffDate,
      dispatcherComments,
      loadedMiles,
      averageSpeed,
      isUrgent,
    } = body;

    if (!billOfLadingNumber) {
      return NextResponse.json(
        { error: "billOfLadingNumber is required to identify the load" },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      billOfLadingNumber,
    };

    // Only include fields that are being updated
    if (pickUpName !== undefined) payload.pickUpName = pickUpName;
    if (pickUpTankNumber !== undefined) payload.pickUpTankNumber = pickUpTankNumber;
    if (dropOffAccountName !== undefined) payload.dropOffAccountName = dropOffAccountName;
    if (dropOffName !== undefined) payload.dropOffName = dropOffName;
    if (requestedPickUpDate !== undefined) {
      payload.requestedPickUpDate = requestedPickUpDate;
      payload.requestedPickUpTimeType = "RANGE";
      payload.requestedPickUpRangeOrSpecific = "ANY";
      payload.assignedPickUpDate = requestedPickUpDate;
    }
    if (requestedDropOffDate !== undefined) {
      payload.requestedDropOffDate = requestedDropOffDate;
      payload.requestedDropOffTimeType = "RANGE";
      payload.requestedDropOffRangeOrSpecific = "ANY";
    }
    if (dispatcherComments !== undefined) payload.dispatcherComments = dispatcherComments;
    if (loadedMiles !== undefined) payload.loadedMiles = Number(loadedMiles);
    if (averageSpeed !== undefined) payload.averageSpeed = Number(averageSpeed);
    if (isUrgent !== undefined) payload.isUrgent = isUrgent;

    const result = await updateLoad(payload);

    if (!result.ok) {
      console.error("[LoadUpdate] Failed:", result.status, result.body);
      return NextResponse.json(
        { error: `Load update failed: ${result.body}` },
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

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error("[LoadUpdate] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to update load" },
      { status: 500 }
    );
  }
}
