import { NextResponse } from "next/server";
import { createLoad } from "@/lib/welltrax";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      pickUpAccountName,
      pickUpName,
      pickUpTankNumber,
      dropOffAccountName,
      dropOffName,
      useDefaultDropoff,
      requestedPickUpDate,
      requestedDropOffDate,
      loadedMiles,
      averageSpeed,
      isUrgent,
      dispatcherComments,
      confirmationNumber,
    } = body;

    if (!pickUpAccountName || !pickUpName) {
      return NextResponse.json(
        { error: "pickUpAccountName and pickUpName are required" },
        { status: 400 }
      );
    }

    // Build payload matching WAPI_TMS11 /api/inbound/loads format
    const payload: Record<string, unknown> = {
      pickUpAccountName,
      pickUpName,
      requestedPickUpDate: requestedPickUpDate || undefined,
      requestedPickUpTimeType: "RANGE",
      requestedPickUpRangeOrSpecific: "ANY",
      assignedPickUpDate: requestedPickUpDate || undefined,
      senderId: "explore",
    };

    // Optional fields
    if (pickUpTankNumber) {
      payload.pickUpTankNumber = pickUpTankNumber;
    }

    if (loadedMiles) {
      payload.loadedMiles = Number(loadedMiles);
    }

    if (averageSpeed) {
      payload.averageSpeed = Number(averageSpeed);
    }

    if (isUrgent) {
      payload.isUrgent = true;
    }

    if (dispatcherComments) {
      payload.dispatcherComments = dispatcherComments;
    }

    if (confirmationNumber) {
      payload.confirmationNumber = confirmationNumber;
    }

    // Split pickups (indices 2-6)
    for (let idx = 2; idx <= 6; idx++) {
      const name = body[`pickUpName${idx}`];
      const tank = body[`pickUpTankNumber${idx}`];
      if (name) payload[`pickUpName${idx}`] = name;
      if (tank) payload[`pickUpTankNumber${idx}`] = tank;
    }

    // Handle dropoff
    if (useDefaultDropoff || !dropOffName) {
      payload.createLoadWithFirstDefaultDropOff = "true";
    } else {
      payload.createLoadWithFirstDefaultDropOff = "false";
      payload.dropOffAccountName = dropOffAccountName || pickUpAccountName;
      payload.dropOffName = dropOffName;
      payload.requestedDropOffDate = requestedDropOffDate || requestedPickUpDate;
      payload.requestedDropOffTimeType = "RANGE";
      payload.requestedDropOffRangeOrSpecific = "ANY";
    }

    const result = await createLoad(payload);

    if (!result.ok) {
      console.error("[LoadCreate] Failed:", result.status, result.body);
      return NextResponse.json(
        { error: `Load creation failed: ${result.body}` },
        { status: result.status }
      );
    }

    let responseData;
    try {
      responseData = JSON.parse(result.body);
    } catch {
      responseData = result.body;
    }

    // Check for Welltrax errors in response
    if (responseData?.errors?.length > 0) {
      const errorMsg = responseData.errors
        .map((e: any) => JSON.stringify(e.errorMap || e))
        .join("; ");
      return NextResponse.json(
        { error: `Welltrax error: ${errorMsg}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      confirmation: responseData?.success?.[0]?.confirmationNumber,
      bol: responseData?.success?.[0]?.billOfLadingNumber,
    });
  } catch (error: any) {
    console.error("[LoadCreate] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to create load" },
      { status: 500 }
    );
  }
}
