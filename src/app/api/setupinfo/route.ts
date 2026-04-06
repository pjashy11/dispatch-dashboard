import { NextResponse } from "next/server";
import { fetchSetupInfo, fetchTerminals, fetchAllScenarios } from "@/lib/welltrax";

// In-memory caches for terminals and scenarios
let terminalCache: { data: any[]; expiresAt: number } | null = null;
let scenarioCache: { data: any[]; expiresAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "terminals") {
      if (terminalCache && terminalCache.expiresAt > Date.now()) {
        return NextResponse.json({ terminals: terminalCache.data });
      }
      const terminals = await fetchTerminals();
      const mapped = terminals.map((t: any) => ({
        id: t.id || t.terminalId,
        hostId: t.hostId || "",
        name: t.name || t.terminalName || "",
      }));
      terminalCache = { data: mapped, expiresAt: Date.now() + CACHE_TTL };
      return NextResponse.json({ terminals: mapped });
    }

    if (action === "scenarios") {
      if (scenarioCache && scenarioCache.expiresAt > Date.now()) {
        return NextResponse.json({ scenarios: scenarioCache.data });
      }
      const rawScenarios = await fetchAllScenarios();
      const scenarios = rawScenarios.map((s: any) => ({
        scenarioId: s.id,
        hostId: s.hostID || "",
        isActive: s.isActive,
        loadedMiles: s.loadedMiles,
        averageSpeed: s.averageSpeed,
        pickUpId: s.pickUp?.id,
        pickUpName: s.pickUp?.contact?.fullName || "",
        pickUpHostId: s.pickUp?.hostID || "",
        pickUpAccountId: s.pickUpAccount?.id,
        pickUpAccountName: s.pickUpAccount?.contact?.fullName || "",
        pickUpAccountHostId: s.pickUpAccount?.hostID || "",
        dropOffId: s.dropOff?.id,
        dropOffName: s.dropOff?.contact?.fullName || "",
        dropOffHostId: s.dropOff?.hostID || "",
        dropOffAccountId: s.dropOffAccount?.id,
        dropOffAccountName: s.dropOffAccount?.contact?.fullName || "",
        dropOffAccountHostId: s.dropOffAccount?.hostID || "",
      }));
      console.log(`[Scenarios] Mapped ${scenarios.length} scenarios`);
      scenarioCache = { data: scenarios, expiresAt: Date.now() + CACHE_TTL };
      return NextResponse.json({ scenarios });
    }

    if (action === "search") {
      const { target, searchCriteria } = body;
      if (!target) {
        return NextResponse.json(
          { error: "target is required" },
          { status: 400 }
        );
      }

      const result = await fetchSetupInfo([
        { target, searchCriteria: searchCriteria || {} },
      ]);

      if (!result.ok) {
        return NextResponse.json(
          { error: "Setup info fetch failed", details: result.data },
          { status: result.status }
        );
      }

      const retList = result.data?.result?.[0]?.retList ?? [];
      return NextResponse.json({ results: retList });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[SetupInfo] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed" },
      { status: 500 }
    );
  }
}
