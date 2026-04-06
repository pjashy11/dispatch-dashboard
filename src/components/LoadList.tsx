"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Load } from "@/lib/types";

interface LoadListProps {
  loads: Load[];
  loading: boolean;
  selectedLoad: Load | null;
  onSelectLoad: (load: Load) => void;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  onColumnOrderChange?: (order: string[]) => void;
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
}

type SortDir = "asc" | "desc";
interface SortEntry {
  key: keyof Load;
  dir: SortDir;
}

interface ColumnDef {
  key: keyof Load;
  label: string;
  defaultWidth: number;
  minW: number;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "aging", label: "Age", defaultWidth: 64, minW: 40 },
  { key: "confirmationNo", label: "Conf #", defaultWidth: 96, minW: 60 },
  { key: "pickupAccountName", label: "PU Account", defaultWidth: 150, minW: 80 },
  { key: "pickupName", label: "Pickup Name", defaultWidth: 160, minW: 80 },
  { key: "pickupOperator", label: "Operator", defaultWidth: 140, minW: 80 },
  { key: "tankName", label: "Tank", defaultWidth: 80, minW: 40 },
  { key: "dropoffAccountName", label: "DO Account", defaultWidth: 150, minW: 80 },
  { key: "dropoffName", label: "Drop Off", defaultWidth: 150, minW: 80 },
  { key: "loadedMiles", label: "Miles", defaultWidth: 60, minW: 40 },
  { key: "requestedPickupDate", label: "Req PU Date", defaultWidth: 100, minW: 70 },
  { key: "assignedPickupDate", label: "Asgn PU Date", defaultWidth: 100, minW: 70 },
  { key: "loadInstructions", label: "Instructions", defaultWidth: 160, minW: 80 },
];

const DEFAULT_ORDER = ALL_COLUMNS.map((c) => c.key);
const DEFAULT_WIDTHS: Record<string, number> = {};
for (const c of ALL_COLUMNS) DEFAULT_WIDTHS[c.key] = c.defaultWidth;

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]));

function agingRowClass(aging: number): string {
  if (aging >= 5) return "bg-red-500/15";
  if (aging >= 3) return "bg-red-500/8";
  if (aging >= 1) return "bg-amber-500/8";
  return "";
}

function agingTextClass(aging: number): string {
  if (aging >= 5) return "text-red-400 font-semibold";
  if (aging >= 3) return "text-red-400";
  if (aging >= 1) return "text-amber-400";
  return "text-slate-400 dark:text-slate-400";
}

function compareValues(a: any, b: any, dir: SortDir): number {
  const av = a ?? "";
  const bv = b ?? "";
  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv));
  }
  return dir === "desc" ? -cmp : cmp;
}

export default function LoadList({
  loads,
  loading,
  selectedLoad,
  onSelectLoad,
  columnOrder: externalOrder,
  columnWidths: externalWidths,
  onColumnOrderChange,
  onColumnWidthsChange,
}: LoadListProps) {
  const [sortStack, setSortStack] = useState<SortEntry[]>([]);

  // Column order and widths — use external (persisted) if provided
  const columnOrder = externalOrder || DEFAULT_ORDER;
  const columnWidths = externalWidths || DEFAULT_WIDTHS;

  const setColumnOrder = useCallback(
    (order: string[]) => {
      onColumnOrderChange?.(order);
    },
    [onColumnOrderChange]
  );

  const setColumnWidths = useCallback(
    (updater: (prev: Record<string, number>) => Record<string, number>) => {
      onColumnWidthsChange?.(updater(columnWidths));
    },
    [columnWidths, onColumnWidthsChange]
  );

  // Ordered column definitions
  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((key) => COLUMN_MAP.get(key as keyof Load))
      .filter(Boolean) as ColumnDef[];
  }, [columnOrder]);

  const totalMinWidth = orderedColumns.reduce(
    (sum, c) => sum + (columnWidths[c.key] ?? c.defaultWidth) + 16,
    0
  );

  // Sorting
  const handleHeaderClick = useCallback(
    (key: keyof Load) => {
      setSortStack((prev) => {
        const existingIdx = prev.findIndex((s) => s.key === key);
        if (existingIdx >= 0) {
          if (existingIdx === prev.length - 1) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              dir: updated[existingIdx].dir === "asc" ? "desc" : "asc",
            };
            return updated;
          }
          return prev;
        }
        return [...prev, { key, dir: "asc" }];
      });
    },
    []
  );

  const removeSort = useCallback((key: keyof Load) => {
    setSortStack((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const sortedLoads = useMemo(() => {
    const effectiveSort =
      sortStack.length > 0
        ? sortStack
        : [{ key: "aging" as keyof Load, dir: "asc" as SortDir }];
    return [...loads].sort((a, b) => {
      for (const { key, dir } of effectiveSort) {
        const cmp = compareValues(a[key], b[key], dir);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [loads, sortStack]);

  // Column resize
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      e.preventDefault();
      const diff = e.clientX - resizing.current.startX;
      const col = COLUMN_MAP.get(resizing.current.key as keyof Load);
      const minW = col?.minW ?? 40;
      const newW = Math.max(minW, resizing.current.startW + diff);
      setColumnWidths((prev) => ({ ...prev, [resizing.current!.key]: newW }));
    };
    const onMouseUp = () => {
      if (resizing.current) {
        resizing.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setColumnWidths]);

  const startResize = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = {
      key,
      startX: e.clientX,
      startW: columnWidths[key] ?? DEFAULT_WIDTHS[key] ?? 100,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // Column drag-to-reorder
  const dragCol = useRef<string | null>(null);
  const dragOverCol = useRef<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const onDragStart = (key: string, e: React.DragEvent) => {
    dragCol.current = key;
    setDragKey(key);
    e.dataTransfer.effectAllowed = "move";
    // Use a transparent image so default ghost is hidden
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const onDragOver = (key: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverCol.current = key;
  };

  const onDrop = (key: string, e: React.DragEvent) => {
    e.preventDefault();
    const from = dragCol.current;
    if (!from || from === key) return;
    const newOrder = [...columnOrder];
    const fromIdx = newOrder.indexOf(from);
    const toIdx = newOrder.indexOf(key);
    if (fromIdx < 0 || toIdx < 0) return;
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, from);
    setColumnOrder(newOrder);
    dragCol.current = null;
    dragOverCol.current = null;
    setDragKey(null);
  };

  const onDragEnd = () => {
    dragCol.current = null;
    dragOverCol.current = null;
    setDragKey(null);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading loads...
        </div>
      </div>
    );
  }

  if (loads.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)]">
        No loads found for the selected filters
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto text-[13px]">
      <div style={{ minWidth: totalMinWidth }}>
        {/* Sort info bar */}
        {sortStack.length > 0 && (
          <div className="sticky top-0 z-20 bg-[var(--color-bg-secondary)] px-2 py-1.5 border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--color-text-muted)]">Sort:</span>
            {sortStack.map((s, i) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-1.5 text-xs bg-blue-600/20 text-blue-400 rounded-md px-2.5 py-1"
              >
                {i + 1}. {COLUMN_MAP.get(s.key)?.label}{" "}
                {s.dir === "asc" ? "↑" : "↓"}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSort(s.key);
                  }}
                  className="hover:text-red-400 ml-0.5 text-sm leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={() => setSortStack([])}
              className="text-xs text-[var(--color-text-muted)] hover:text-red-400 ml-auto"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Header */}
        <div
          className={`sticky ${sortStack.length > 0 ? "top-[37px]" : "top-0"} z-10 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex`}
        >
          {orderedColumns.map((col) => {
            const w = columnWidths[col.key] ?? col.defaultWidth;
            const sortIdx = sortStack.findIndex((s) => s.key === col.key);
            const sortEntry = sortIdx >= 0 ? sortStack[sortIdx] : null;
            const isLocked = sortEntry && sortIdx < sortStack.length - 1;
            const isDragging = dragKey === col.key;
            return (
              <div
                key={col.key}
                draggable
                onDragStart={(e) => onDragStart(col.key, e)}
                onDragOver={(e) => onDragOver(col.key, e)}
                onDrop={(e) => onDrop(col.key, e)}
                onDragEnd={onDragEnd}
                onClick={() => handleHeaderClick(col.key)}
                style={{ width: w, minWidth: col.minW, opacity: isDragging ? 0.5 : 1 }}
                className={`flex-shrink-0 px-2 py-2 text-xs font-semibold uppercase tracking-wide select-none transition-colors flex items-center gap-1 relative ${
                  isLocked
                    ? "text-blue-400/60 cursor-grab"
                    : sortEntry
                    ? "text-blue-400 cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
                    : "text-[var(--color-text-secondary)] cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
                }`}
                title="Click to sort, drag to reorder"
              >
                <span className="truncate">{col.label}</span>
                {sortEntry && (
                  <span className="flex items-center gap-0.5 text-[10px] flex-shrink-0">
                    <span className={`${isLocked ? "bg-blue-600/50" : "bg-blue-600"} text-white rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none`}>
                      {sortIdx + 1}
                    </span>
                    <span>{sortEntry.dir === "asc" ? "▲" : "▼"}</span>
                  </span>
                )}
                {/* Resize handle */}
                <div
                  onMouseDown={(e) => startResize(col.key, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/50 z-10"
                />
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {sortedLoads.map((load) => {
          const isSelected = selectedLoad?.id === load.id;
          return (
            <div
              key={load.id}
              onClick={() => onSelectLoad(load)}
              className={`flex border-b border-[var(--color-border-row)] cursor-pointer transition-colors ${
                isSelected
                  ? "bg-blue-600/20 border-l-2 border-l-blue-500"
                  : `${agingRowClass(load.aging)} hover:bg-[var(--color-bg-tertiary)]`
              }`}
            >
              {orderedColumns.map((col) => {
                const w = columnWidths[col.key] ?? col.defaultWidth;
                const value = load[col.key];
                const urgentText = load.isUrgent ? "text-red-400" : "";
                return (
                  <div
                    key={col.key}
                    style={{ width: w, minWidth: col.minW }}
                    className="flex-shrink-0 px-2 py-1.5 truncate"
                  >
                    {col.key === "aging" ? (
                      <span
                        className={`font-mono ${load.isUrgent ? "text-red-400 font-semibold" : agingTextClass(Number(value))}`}
                      >
                        {String(value ?? "")}
                      </span>
                    ) : col.key === "loadedMiles" ? (
                      <span className={`font-mono ${urgentText || "text-[var(--color-text-primary)]"}`}>
                        {value != null ? String(value) : ""}
                      </span>
                    ) : (
                      <span className={urgentText || "text-[var(--color-text-primary)]"}>
                        {String(value ?? "")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
