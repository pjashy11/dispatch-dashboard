"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { DispatchLoad } from "@/lib/types";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false });

interface DispatchDetailProps {
  load: DispatchLoad;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  ASSIGNED: { bg: "bg-blue-600/20", text: "text-blue-400" },
  ONGOING: { bg: "bg-amber-600/20", text: "text-amber-400" },
};

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export default function DispatchDetail({ load, onClose, onUpdated }: DispatchDetailProps) {
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Assign/Reassign driver state
  const [driverSearch, setDriverSearch] = useState("");
  const [driverResults, setDriverResults] = useState<any[]>([]);
  const [searchingDrivers, setSearchingDrivers] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [shiftDate, setShiftDate] = useState(todayStr());
  const [sequenceNumber, setSequenceNumber] = useState("");

  // Rearrange state
  const [newSequence, setNewSequence] = useState("");

  const badge = STATUS_BADGE[load.status] || STATUS_BADGE.ASSIGNED;

  const searchDrivers = useCallback(async (term: string) => {
    if (term.length < 2) { setDriverResults([]); return; }
    setSearchingDrivers(true);
    try {
      const res = await fetch("/api/setupinfo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          target: "DRIVER",
          searchCriteria: { driverName: term },
        }),
      });
      const data = await res.json();
      setDriverResults(data.results || []);
    } catch {
      setDriverResults([]);
    } finally {
      setSearchingDrivers(false);
    }
  }, []);

  const callAssignment = useCallback(async (payload: Record<string, unknown>) => {
    setActionPending(true);
    setError(null);
    try {
      const res = await fetch("/api/loads/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Action failed");
        return false;
      }
      return true;
    } catch (err: any) {
      setError(err.message || "Action failed");
      return false;
    } finally {
      setActionPending(false);
    }
  }, []);

  const handleAssign = async () => {
    if (!selectedDriver) { setError("Select a driver"); return; }
    const ok = await callAssignment({
      action: activeAction === "reassign" ? "reassign" : "add",
      loadId: load.id,
      billOfLadingNumber: load.bolNumber,
      driverId: selectedDriver.id,
      shiftDate,
      terminalName: load.terminal,
      ...(sequenceNumber ? { sequenceNumber: parseInt(sequenceNumber) } : {}),
    });
    if (ok) { onUpdated(); onClose(); }
  };

  const handleDrop = async () => {
    const ok = await callAssignment({
      action: "drop",
      loadId: load.id,
      billOfLadingNumber: load.bolNumber,
    });
    if (ok) { onUpdated(); onClose(); }
  };

  const handleRearrange = async () => {
    if (!newSequence) { setError("Enter a sequence number"); return; }
    const ok = await callAssignment({
      action: "rearrange",
      loadId: load.id,
      billOfLadingNumber: load.bolNumber,
      sequenceNumber: parseInt(newSequence),
    });
    if (ok) { onUpdated(); onClose(); }
  };

  const handleCancel = async () => {
    const ok = await callAssignment({
      action: "cancel",
      loadId: load.id,
      billOfLadingNumber: load.bolNumber,
    });
    if (ok) { onUpdated(); onClose(); }
  };

  const inputClass = "w-full rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
  const inputStyle = {
    background: "var(--color-input-bg)",
    border: "1px solid var(--color-input-border)",
    color: "var(--color-text-primary)",
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--color-bg-secondary)" }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex-1 min-w-0 mr-3">
          <h2 className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {load.pickupName} → {load.dropoffName} - {load.confirmationNo}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm font-medium rounded transition-colors hover:bg-red-600/20 hover:text-red-400 flex-shrink-0"
          style={{ color: "var(--color-text-primary)", border: "1px solid var(--color-input-border)", background: "var(--color-input-bg)" }}
        >
          ✕ Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && (
          <div className="px-3 py-2 rounded text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "rgb(252,165,165)" }}>
            {error}
          </div>
        )}

        {/* Status + Driver */}
        <div className="flex items-center gap-3">
          <span className={`${badge.bg} ${badge.text} text-xs font-semibold px-2.5 py-1 rounded`}>
            {load.status}
          </span>
          {load.driverName && (
            <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
              Driver: <span className="font-semibold">{load.driverName}</span>
            </span>
          )}
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3">
          <InfoField label="BOL #" value={load.bolNumber} />
          <InfoField label="Confirmation #" value={load.confirmationNo} />
          <InfoField label="Terminal" value={load.terminal} />
          <InfoField label="PU Account" value={load.pickupAccountName} />
          <InfoField label="Pickup" value={load.pickupName} />
          <InfoField label="Drop Off" value={load.dropoffName} />
          <InfoField label="Operator" value={load.pickupOperator} />
          <InfoField label="Tank" value={load.tankName} />
          <InfoField label="Miles" value={load.loadedMiles != null ? String(load.loadedMiles) : ""} />
          <InfoField label="Pickup Date" value={load.assignedPickupDate} />
          {load.driverCarrier && <InfoField label="Carrier" value={load.driverCarrier} />}
          {load.sequenceNumber != null && <InfoField label="Sequence #" value={String(load.sequenceNumber)} />}
          <InfoField label="Instructions" value={load.loadInstructions} />
          <InfoField label="Urgent" value={load.isUrgent ? "Yes" : "No"} />
        </div>

        {/* Route map */}
        <RouteMap load={load} />

        {/* Action buttons */}
        {!activeAction && (
          <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
            {load.status === "ASSIGNED" && (
              <button
                onClick={() => setActiveAction("reassign")}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                Reassign Driver
              </button>
            )}
            {(load.status === "ASSIGNED" || load.status === "ONGOING") && (
              <>
                <button
                  onClick={() => setActiveAction("drop")}
                  className="px-4 py-2 text-sm bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 rounded transition-colors"
                  style={{ border: "1px solid rgba(245,158,11,0.4)" }}
                >
                  Drop Load
                </button>
                <button
                  onClick={() => setActiveAction("rearrange")}
                  className="px-4 py-2 text-sm rounded transition-colors"
                  style={{ background: "var(--color-input-bg)", border: "1px solid var(--color-input-border)", color: "var(--color-text-primary)" }}
                >
                  Rearrange
                </button>
                <button
                  onClick={() => setActiveAction("cancel")}
                  className="px-4 py-2 text-sm bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
                  style={{ border: "1px solid rgba(239,68,68,0.4)" }}
                >
                  Cancel Load
                </button>
              </>
            )}
          </div>
        )}

        {/* Assign/Reassign form */}
        {(activeAction === "add" || activeAction === "reassign") && (
          <div className="space-y-3 p-3 rounded" style={{ background: "var(--color-bg-tertiary)", border: "1px solid var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {activeAction === "reassign" ? "Reassign to Driver" : "Assign Driver"}
            </h3>

            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Search Driver</label>
              <input
                type="text"
                value={driverSearch}
                onChange={(e) => { setDriverSearch(e.target.value); searchDrivers(e.target.value); }}
                placeholder="Type driver name..."
                className={inputClass}
                style={inputStyle}
              />
              {searchingDrivers && <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Searching...</div>}
              {driverResults.length > 0 && !selectedDriver && (
                <div className="mt-1 max-h-40 overflow-auto rounded" style={{ background: "var(--color-input-bg)", border: "1px solid var(--color-input-border)" }}>
                  {driverResults.map((d: any) => (
                    <div
                      key={d.id}
                      onClick={() => { setSelectedDriver(d); setDriverSearch(d.contact?.fullName || d.fullName || d.name || ""); setDriverResults([]); }}
                      className="px-3 py-1.5 text-sm cursor-pointer hover:opacity-80"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {d.contact?.fullName || d.fullName || d.name || `Driver #${d.id}`}
                    </div>
                  ))}
                </div>
              )}
              {selectedDriver && (
                <div className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  Selected: <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{selectedDriver.contact?.fullName || selectedDriver.fullName}</span>
                  <button onClick={() => { setSelectedDriver(null); setDriverSearch(""); }} className="ml-2 text-red-400 hover:text-red-300">Clear</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Shift Date</label>
                <input type="text" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} placeholder="MM/DD/YYYY" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Sequence # (optional)</label>
                <input type="number" value={sequenceNumber} onChange={(e) => setSequenceNumber(e.target.value)} placeholder="Auto" className={inputClass} style={inputStyle} />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={handleAssign} disabled={actionPending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50">
                {actionPending ? "Processing..." : activeAction === "reassign" ? "Reassign" : "Assign"}
              </button>
              <button onClick={() => { setActiveAction(null); setError(null); setSelectedDriver(null); setDriverSearch(""); }} className="px-4 py-2 text-sm rounded transition-colors" style={{ background: "var(--color-input-bg)", border: "1px solid var(--color-input-border)", color: "var(--color-text-primary)" }}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* Drop confirmation */}
        {activeAction === "drop" && (
          <div className="space-y-3 p-3 rounded" style={{ background: "var(--color-bg-tertiary)", border: "1px solid var(--color-border)" }}>
            <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
              Drop this load from <span className="font-semibold">{load.driverName || "the driver"}</span>?
            </p>
            <div className="flex gap-2">
              <button onClick={handleDrop} disabled={actionPending} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors disabled:opacity-50">
                {actionPending ? "Processing..." : "Confirm Drop"}
              </button>
              <button onClick={() => { setActiveAction(null); setError(null); }} className="px-4 py-2 text-sm rounded transition-colors" style={{ background: "var(--color-input-bg)", border: "1px solid var(--color-input-border)", color: "var(--color-text-primary)" }}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* Rearrange form */}
        {activeAction === "rearrange" && (
          <div className="space-y-3 p-3 rounded" style={{ background: "var(--color-bg-tertiary)", border: "1px solid var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Rearrange Load Sequence</h3>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>New Sequence #</label>
              <input type="number" value={newSequence} onChange={(e) => setNewSequence(e.target.value)} placeholder="1, 2, 3..." className={inputClass} style={{ ...inputStyle, maxWidth: "120px" }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleRearrange} disabled={actionPending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50">
                {actionPending ? "Processing..." : "Rearrange"}
              </button>
              <button onClick={() => { setActiveAction(null); setError(null); }} className="px-4 py-2 text-sm rounded transition-colors" style={{ background: "var(--color-input-bg)", border: "1px solid var(--color-input-border)", color: "var(--color-text-primary)" }}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* Cancel confirmation */}
        {activeAction === "cancel" && (
          <div className="space-y-3 p-3 rounded" style={{ background: "var(--color-bg-tertiary)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <p className="text-sm text-red-400">
              Are you sure you want to cancel this load? This will drop the driver assignment and cancel the load.
            </p>
            <div className="flex gap-2">
              <button onClick={handleCancel} disabled={actionPending} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50">
                {actionPending ? "Processing..." : "Confirm Cancel"}
              </button>
              <button onClick={() => { setActiveAction(null); setError(null); }} className="px-4 py-2 text-sm rounded transition-colors" style={{ background: "var(--color-input-bg)", border: "1px solid var(--color-input-border)", color: "var(--color-text-primary)" }}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
