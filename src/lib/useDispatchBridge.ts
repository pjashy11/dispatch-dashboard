"use client";

import { useEffect, useMemo, useState } from "react";

export interface BridgeStatus {
  cached: Array<{
    terminalId: string;
    terminalName: string;
    date: string;
    workingDrivers: number;
    notWorkingDrivers: number;
    ageSeconds: number;
  }>;
  terminalMap: Record<string, string>;
}

export interface BridgeDriver {
  driverName: string;
  driverId: number | null;
  driverHostId: string;
  driverPhone: string;
  driverCarrier: string;
  shiftDate: string;
  entries: Array<{
    sequenceNo: number;
    loadId: number | null;
    bol: string;
    status: string;
    pickupName: string;
    dropoffName: string;
  }>;
}

function parseBridgeDrivers(response: any, today: string): BridgeDriver[] {
  const working = response?.data?.SCHEDULE_DRIVERS_WORKING || [];

  return working.map((entry: any) => {
    const driver = entry.driver || {};
    const contact = driver.contact || {};
    const firstName = (contact.firstName || "").trim();
    const lastName = (contact.lastName || "").trim();

    return {
      driverName:
        lastName && firstName
          ? `${lastName}, ${firstName}`
          : contact.fullName || driver.name || `Driver ${driver.id || "?"}`,
      driverId: driver.id ?? null,
      driverHostId: driver.hostID || driver.hostId || "",
      driverPhone: entry.phoneNumber ? String(entry.phoneNumber) : "",
      driverCarrier: driver.driverGroupList?.[0]?.name || driver.contractor?.contact?.fullName || "",
      shiftDate: driver.shift?.shiftDate?.date || today,
      entries: (entry.entryList || []).map((scheduleEntry: any) => {
        const load = scheduleEntry.load || {};
        const pickup = load.pickUpList?.[0] || {};
        const dropoff = load.dropOffList?.[0] || {};

        return {
          sequenceNo: scheduleEntry.driverShiftSequenceNo ?? 0,
          loadId: load.id ?? null,
          bol: load.billOfLadingNumber || "",
          status: load.status || "",
          pickupName: pickup.contact?.fullName || "",
          dropoffName: dropoff.contact?.fullName || "",
        };
      }),
    };
  });
}

export function useDispatchBridge(selectedTerminal: string) {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [bridgeDrivers, setBridgeDrivers] = useState<BridgeDriver[]>([]);
  const [bridgeFingerprint, setBridgeFingerprint] = useState("");

  useEffect(() => {
    const check = () => {
      fetch("/api/dispatch-board/ingest")
        .then((response) => response.json())
        .then((data) => setBridgeStatus(data))
        .catch(() => {});
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const resolvedTerminalId = useMemo(() => {
    const terminalMap = bridgeStatus?.terminalMap || {};
    if (terminalMap[selectedTerminal]) return terminalMap[selectedTerminal];

    for (const [name, id] of Object.entries(terminalMap)) {
      if (
        name.toUpperCase().includes(selectedTerminal.toUpperCase()) ||
        selectedTerminal.toUpperCase().includes(name.toUpperCase())
      ) {
        return id;
      }
    }

    return null;
  }, [bridgeStatus, selectedTerminal]);

  const hasBridgeData =
    resolvedTerminalId !== null &&
    (bridgeStatus?.cached ?? []).some((item) => item.terminalId === resolvedTerminalId);

  useEffect(() => {
    if (!bridgeStatus?.cached?.length) {
      setBridgeFingerprint("");
      return;
    }

    const now = Math.round(Date.now() / 1000);
    setBridgeFingerprint(
      bridgeStatus.cached
        .map((item) => `${item.terminalId}:${item.date}:${Math.round((now - item.ageSeconds) / 10)}`)
        .sort()
        .join("|")
    );
  }, [bridgeStatus]);

  useEffect(() => {
    if (!bridgeFingerprint || !selectedTerminal || !resolvedTerminalId) {
      setBridgeDrivers([]);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    fetch(`/api/dispatch-board?terminalId=${resolvedTerminalId}&date=${today}&commodityId=1`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.data) {
          setBridgeDrivers([]);
          return;
        }

        setBridgeDrivers(parseBridgeDrivers(data, today));
      })
      .catch(() => setBridgeDrivers([]));
  }, [bridgeFingerprint, resolvedTerminalId, selectedTerminal]);

  return {
    bridgeDrivers,
    bridgeStatus,
    hasBridgeData,
    resolvedTerminalId,
  };
}
