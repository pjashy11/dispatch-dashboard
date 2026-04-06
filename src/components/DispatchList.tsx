"use client";

import { useState, useMemo, useCallback } from "react";
import type { DispatchLoad } from "@/lib/types";

interface DispatchListProps {
  loads: DispatchLoad[];
  loading: boolean;
  selectedLoad: DispatchLoad | null;
  onSelectLoad: (load: DispatchLoad) => void;
}

type SortDir = "asc" | "desc";
interface SortEntry { key: keyof DispatchLoad; dir: SortDir; }

const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "text-blue-400",
  ONGOING: "text-amber-400",
};
const STATUS_ROW_BG: Record<string, string> = {
  ASSIGNED: "bg-blue-500/5",
  ONGOING: "bg-amber-500/5",
};

interface ColDef { key: keyof DispatchLoad; label: string; w: number; }

const columns: ColDef[] = [
  { key: "status", label: "Status", w: 90 },
  { key: "confirmationNo", label: "Conf #", w: 110 },
  { key: "driverName", label: "Driver", w: 160 },
  { key: "pickupAccountName", label: "PU Account", w: 140 },
  { key: "pickupName", label: "Pickup", w: 160 },
  { key: "pickupOperator", label: "Operator", w: 140 },
  { key: "tankName", label: "Tank", w: 70 },
  { key: "dropoffName", label: "Drop Off", w: 150 },
  { key: "loadedMiles", label: "Miles", w: 60 },
  { key: "assignedPickupDate", label: "Pickup Date", w: 100 },
  { key: "loadInstructions", label: "Instructions", w: 160 },
];

function compare(a: any, b: any, dir: SortDir): number {
  const av = a ?? "";
  const bv = b ?? "";
  const cmp = typeof av === "number" && typeof bv === "number"
    ? av - bv
    : String(av).localeCompare(String(bv));
  return dir === "desc" ? -cmp : cmp;
}

export default function DispatchList({ loads, loading, selectedLoad, onSelectLoad }: DispatchListProps) {
  const [sortStack, setSortStack] = useState<SortEntry[]>([]);

  const handleHeaderClick = useCallback((key: keyof DispatchLoad) => {
    setSortStack((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx >= 0 && idx === prev.length - 1) {
        const u = [...prev];
        u[idx] = { ...u[idx], dir: u[idx].dir === "asc" ? "desc" : "asc" };
        return u;
      }
      if (idx >= 0) return prev;
      return [...prev, { key, dir: "asc" }];
    });
  }, []);

  const removeSort = useCallback((key: keyof DispatchLoad) => {
    setSortStack((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const sorted = useMemo(() => {
    const eff = sortStack.length > 0 ? sortStack : [{ key: "assignedPickupDate" as keyof DispatchLoad, dir: "asc" as SortDir }];
    return [...loads].sort((a, b) => {
      for (const { key, dir } of eff) {
        const c = compare(a[key], b[key], dir);
        if (c !== 0) return c;
      }
      return 0;
    });
  }, [loads, sortStack]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading dispatch board...
        </div>
      </div>
    );
  }

  if (loads.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">
        No assigned or ongoing loads found
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto text-[13px]">
      {/* Desktop table */}
      <div className="hidden md:block" style={{ minWidth: columns.reduce((s, c) => s + c.w + 16, 0) }}>
        {/* Sort bar */}
        {sortStack.length > 0 && (
          <div className="sticky top-0 z-20 bg-[var(--color-bg-secondary)] px-2 py-1.5 border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--color-text-muted)]">Sort:</span>
            {sortStack.map((s, i) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-xs bg-blue-600/20 text-blue-400 rounded-md px-2.5 py-1">
                {i + 1}. {columns.find((c) => c.key === s.key)?.label} {s.dir === "asc" ? "↑" : "↓"}
                <button onClick={() => removeSort(s.key)} className="hover:text-red-400 ml-0.5 text-sm leading-none">×</button>
              </span>
            ))}
            <button onClick={() => setSortStack([])} className="text-xs text-[var(--color-text-muted)] hover:text-red-400 ml-auto">Clear all</button>
          </div>
        )}

        {/* Header */}
        <div className={`sticky ${sortStack.length > 0 ? "top-[37px]" : "top-0"} z-10 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex`}>
          {columns.map((col) => {
            const si = sortStack.findIndex((s) => s.key === col.key);
            const se = si >= 0 ? sortStack[si] : null;
            return (
              <div
                key={col.key}
                onClick={() => handleHeaderClick(col.key)}
                style={{ width: col.w, minWidth: col.w }}
                className={`flex-shrink-0 px-2 py-2 text-xs font-semibold uppercase tracking-wide select-none cursor-pointer flex items-center gap-1 hover:bg-[var(--color-bg-tertiary)] ${se ? "text-blue-400" : "text-[var(--color-text-secondary)]"}`}
              >
                <span className="truncate">{col.label}</span>
                {se && <span className="text-[10px]">{se.dir === "asc" ? "▲" : "▼"}</span>}
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {sorted.map((load) => {
          const sel = selectedLoad?.id === load.id;
          return (
            <div
              key={load.id}
              onClick={() => onSelectLoad(load)}
              className={`flex border-b border-[var(--color-border-row)] cursor-pointer transition-colors ${
                sel ? "bg-blue-600/20 border-l-2 border-l-blue-500" : `${STATUS_ROW_BG[load.status] || ""} hover:bg-[var(--color-bg-tertiary)]`
              }`}
            >
              {columns.map((col) => {
                const v = load[col.key];
                return (
                  <div key={col.key} style={{ width: col.w, minWidth: col.w }} className="flex-shrink-0 px-2 py-1.5 truncate">
                    {col.key === "status" ? (
                      <span className={`text-xs font-semibold ${STATUS_COLORS[load.status] || "text-[var(--color-text-primary)]"}`}>
                        {String(v)}
                      </span>
                    ) : col.key === "driverName" ? (
                      <span className="text-[var(--color-text-primary)] font-medium">
                        {String(v || "—")}
                      </span>
                    ) : col.key === "loadedMiles" ? (
                      <span className="font-mono text-[var(--color-text-primary)]">{v != null ? String(v) : ""}</span>
                    ) : (
                      <span className={load.isUrgent ? "text-red-400" : "text-[var(--color-text-primary)]"}>
                        {String(v ?? "")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-2 p-3">
        {sorted.map((load) => {
          const sel = selectedLoad?.id === load.id;
          return (
            <div
              key={load.id}
              onClick={() => onSelectLoad(load)}
              className={`rounded-lg p-3 border-l-4 cursor-pointer transition-colors ${
                load.status === "ASSIGNED" ? "border-l-blue-500" : "border-l-amber-500"
              } ${sel ? "bg-blue-600/20 ring-1 ring-blue-500" : "hover:bg-[var(--color-bg-tertiary)]"}`}
              style={{ background: sel ? undefined : "var(--color-bg-secondary)", border: sel ? undefined : "1px solid var(--color-border)" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${STATUS_COLORS[load.status] || ""}`}>
                  {load.status}
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {load.confirmationNo}
                </span>
              </div>
              <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {load.pickupName} → {load.dropoffName}
              </div>
              {load.driverName && (
                <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  Driver: <span style={{ color: "var(--color-text-primary)" }}>{load.driverName}</span>
                </div>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                <span>{load.pickupAccountName}</span>
                {load.loadedMiles != null && <span>{load.loadedMiles} mi</span>}
                <span>{load.assignedPickupDate}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
