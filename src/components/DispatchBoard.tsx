"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DispatchLoad, Load } from "@/lib/types";
import DispatchLoadEditModal from "./DispatchLoadEditModal";
import { useDispatchBridge } from "@/lib/useDispatchBridge";

const TERMINALS = [
  "MIDLAND",
  "CARLSBAD/ORLA",
  "PECOS/FT STOCKTON",
  "SOUTH TEXAS",
];

/** Terminal ID map is built dynamically from bridge data (portal IDs differ from WAPI IDs). */

interface DispatchBoardProps {
  onModuleChange: (m: "loads" | "dispatch") => void;
  userName: string;
  onSignOut: () => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

/* ── date helpers ──────────────────────────────────────── */
function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
function tomorrowMMDDYYYY(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
/** Parse MM/DD/YYYY to a comparable number YYYYMMDD */
function dateToNum(dateStr: string): number {
  if (!dateStr) return 0;
  const [m, d, y] = dateStr.split("/");
  return Number(y) * 10000 + Number(m) * 100 + Number(d);
}

/* ── tile backgrounds by status ────────────────────────── */
function tileBg(load: DispatchLoad): string {
  const s = load.status.toUpperCase();
  if (s === "COMPLETE") return "#0f2818";
  if (s === "ONGOING" || load.progress > 0) return "#2a2210";
  return "#1e293b";
}
function tileBorder(load: DispatchLoad): string {
  const s = load.status.toUpperCase();
  if (s === "COMPLETE") return "#22c55e";
  if (s === "ONGOING" || load.progress > 0) return "#ca8a04";
  return "#334155";
}

/* ── drag data ─────────────────────────────────────────── */
interface DragData {
  loadId: number;
  fromDriver: string | null; // null = open pool
}

interface OpenPointerDrag {
  loadId: number;
  x: number;
  y: number;
}

interface CardPointerDrag {
  loadId: number;
  fromDriver: string;
  x: number;
  y: number;
}

type SortDir = "asc" | "desc";

/* ── Open loads table columns ──────────────────────────── */
const OPEN_COLS = [
  { key: "aging", label: "Aging", w: 80, minW: 64 },
  { key: "confirmationNo", label: "Conf #", w: 100, minW: 84 },
  { key: "pickupAccountName", label: "PU Account", w: 160, minW: 120 },
  { key: "pickupName", label: "Pickup", w: 180, minW: 120 },
  { key: "pickupOperator", label: "Operator", w: 160, minW: 120 },
  { key: "isUrgent", label: "Urgent", w: 78, minW: 70 },
  { key: "tankName", label: "Tank", w: 100, minW: 72 },
  { key: "dropoffName", label: "Drop Off", w: 180, minW: 120 },
  { key: "requestedPickupDate", label: "Pickup Date", w: 100, minW: 96 },
  { key: "loadedMiles", label: "Miles", w: 60, minW: 60 },
  { key: "loadInstructions", label: "Instructions", w: 200, minW: 140 },
] as const;

type OpenColumnKey = (typeof OPEN_COLS)[number]["key"];
interface OpenSortEntry {
  key: OpenColumnKey;
  dir: SortDir;
}

const DRAG_COL_W = 32;
const DISPATCH_WORKSPACE_KEY = "dispatch-board-workspace";
const DEFAULT_OPEN_COLUMN_ORDER = OPEN_COLS.map((column) => column.key) as OpenColumnKey[];
const OPEN_COLS_MAP = new Map(OPEN_COLS.map((column) => [column.key, column]));

export default function DispatchBoard({ onModuleChange, userName, onSignOut, theme, onThemeToggle }: DispatchBoardProps) {
  const [allLoads, setAllLoads] = useState<DispatchLoad[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState(TERMINALS[0]);
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [openCollapsed, setOpenCollapsed] = useState(false);
  const [openSortStack, setOpenSortStack] = useState<OpenSortEntry[]>([]);
  const [openPaneHeight, setOpenPaneHeight] = useState(240); // default max-h
  const [openColumnOrder, setOpenColumnOrder] = useState<OpenColumnKey[]>(DEFAULT_OPEN_COLUMN_ORDER);
  const openPaneRef = useRef<HTMLDivElement>(null);
  const [editLoad, setEditLoad] = useState<DispatchLoad | null>(null);
  const [dragOverDriver, setDragOverDriver] = useState<string | null>(null);
  const [dragOverOpen, setDragOverOpen] = useState(false);
  const [armedDragLoadId, setArmedDragLoadId] = useState<number | null>(null);
  const [pressingLoadId, setPressingLoadId] = useState<number | null>(null);
  const [openPointerDrag, setOpenPointerDrag] = useState<OpenPointerDrag | null>(null);
  const [cardPointerDrag, setCardPointerDrag] = useState<CardPointerDrag | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void; onCancel: () => void } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; loadId: number } | null>(null);
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openColumnWidths, setOpenColumnWidths] = useState<Record<OpenColumnKey, number>>(() =>
    Object.fromEntries(OPEN_COLS.map((column) => [column.key, column.w])) as Record<OpenColumnKey, number>
  );
  const { bridgeDrivers, bridgeStatus, hasBridgeData } = useDispatchBridge(selectedTerminal);
  const resizingCol = useRef<{ key: OpenColumnKey; startX: number; startW: number } | null>(null);
  const dragOpenCol = useRef<OpenColumnKey | null>(null);
  const [draggingOpenCol, setDraggingOpenCol] = useState<OpenColumnKey | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISPATCH_WORKSPACE_KEY);
      if (!saved) {
        setWorkspaceLoaded(true);
        return;
      }
      const parsed = JSON.parse(saved) as {
        selectedTerminal?: string;
        openCollapsed?: boolean;
        openPaneHeight?: number;
        openColumnWidths?: Partial<Record<OpenColumnKey, number>>;
        openColumnOrder?: OpenColumnKey[];
        openSortStack?: OpenSortEntry[];
      };
      if (parsed.selectedTerminal && TERMINALS.includes(parsed.selectedTerminal)) {
        setSelectedTerminal(parsed.selectedTerminal);
      }
      if (typeof parsed.openCollapsed === "boolean") setOpenCollapsed(parsed.openCollapsed);
      if (typeof parsed.openPaneHeight === "number") setOpenPaneHeight(parsed.openPaneHeight);
      if (parsed.openColumnWidths) {
        setOpenColumnWidths((current) => ({ ...current, ...parsed.openColumnWidths }));
      }
      if (parsed.openColumnOrder?.length) {
        const validKeys = parsed.openColumnOrder.filter((key) => OPEN_COLS_MAP.has(key));
        if (validKeys.length === DEFAULT_OPEN_COLUMN_ORDER.length) {
          setOpenColumnOrder(validKeys);
        }
      }
      if (parsed.openSortStack) setOpenSortStack(parsed.openSortStack);
    } catch {}
    setWorkspaceLoaded(true);
  }, []);

  useEffect(() => {
    if (!workspaceLoaded) return;
    localStorage.setItem(
      DISPATCH_WORKSPACE_KEY,
      JSON.stringify({
        selectedTerminal,
        openCollapsed,
        openPaneHeight,
        openColumnWidths,
        openColumnOrder,
        openSortStack,
      })
    );
  }, [openCollapsed, openColumnOrder, openColumnWidths, openPaneHeight, openSortStack, selectedTerminal, workspaceLoaded]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizingCol.current) return;
      event.preventDefault();
      const { key, startX, startW } = resizingCol.current;
      const column = OPEN_COLS.find((item) => item.key === key);
      const minWidth = column?.minW ?? 60;
      const nextWidth = Math.max(minWidth, startW + (event.clientX - startX));
      setOpenColumnWidths((current) => ({ ...current, [key]: nextWidth }));
    };

    const onMouseUp = () => {
      if (!resizingCol.current) return;
      resizingCol.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  /* ── Open loads from load list ────────────────────────── */
  const [loadListLoads, setLoadListLoads] = useState<Load[]>([]);

  /* ── fetch ───────────────────────────────────────────── */
  const fetchLoads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTerminal) params.set("terminals", selectedTerminal);
      const [dispatchRes, loadsRes] = await Promise.all([
        fetch(`/api/dispatch?${params}`),
        fetch(`/api/loads?${params}`),
      ]);
      const [dispatchData, loadsData] = await Promise.all([
        dispatchRes.json(),
        loadsRes.json(),
      ]);
      setAllLoads(dispatchData.loads || []);
      // Cap open loads at tomorrow — exclude future-dated auto-haul loads
      const tomorrowNum = dateToNum(tomorrowMMDDYYYY());
      const openLoadsFiltered = (loadsData.loads || []).filter((l: Load) => {
        const pickupNum = dateToNum(l.requestedPickupDate);
        return l.aging >= 0 && (pickupNum === 0 || pickupNum <= tomorrowNum);
      });
      setLoadListLoads(openLoadsFiltered);
    } catch {
      setAllLoads([]);
      setLoadListLoads([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTerminal]);

  useEffect(() => {
    if (selectedTerminal) fetchLoads();
  }, [fetchLoads, selectedTerminal]);

  /* ── today filter (dispatch loads — assigned/ongoing/complete only) ── */
  const filteredLoads = useMemo(() => {
    const today = todayMMDDYYYY();

    return allLoads.filter((l) => {
      const s = l.status.toUpperCase();
      if (s === "ASSIGNED" || s === "ONGOING") return true;
      if (s === "COMPLETE") {
        const loadDate = l.pickupArrivalDate || l.assignedPickupDate;
        return loadDate === today;
      }
      return false;
    });
  }, [allLoads]);

  /* ── Build bridge lookup: driver name → sequence map (bol → seqNo) ── */
  const bridgeLookup = useMemo(() => {
    const lookup = new Map<string, {
      driver: typeof bridgeDrivers[0];
      seqByBol: Map<string, number>;
      seqByLoadId: Map<number, number>;
    }>();

    for (const bd of bridgeDrivers) {
      const seqByBol = new Map<string, number>();
      const seqByLoadId = new Map<number, number>();
      for (const entry of bd.entries) {
        if (entry.bol) seqByBol.set(entry.bol, entry.sequenceNo);
        if (entry.loadId) seqByLoadId.set(entry.loadId, entry.sequenceNo);
      }
      lookup.set(bd.driverName, { driver: bd, seqByBol, seqByLoadId });
    }

    return lookup;
  }, [bridgeDrivers]);

  /* ── group by driver ─────────────────────────────────── */
  const { openLoads, driverRows } = useMemo(() => {
    const driverMap = new Map<string, { driver: DispatchLoad; loads: DispatchLoad[] }>();

    for (const load of filteredLoads) {
      if (!load.driverName) continue;
      const key = load.driverName;
      if (!driverMap.has(key)) {
        driverMap.set(key, { driver: load, loads: [] });
      }
      driverMap.get(key)!.loads.push(load);
    }

    // Enrich with sequence numbers from bridge data
    const hasBridge = bridgeLookup.size > 0;
    if (hasBridge) {
      for (const [driverName, row] of driverMap) {
        const bridgeInfo = bridgeLookup.get(driverName);
        if (!bridgeInfo) continue;

        for (const load of row.loads) {
          // Try matching by BOL first, then by load ID
          const seq =
            bridgeInfo.seqByBol.get(load.bolNumber) ??
            bridgeInfo.seqByLoadId.get(load.id) ??
            null;
          if (seq !== null) {
            load.sequenceNumber = seq;
          }
        }

        // Update driver info from bridge data if available
        if (bridgeInfo.driver.driverId && !row.driver.driverId) {
          row.driver.driverId = bridgeInfo.driver.driverId;
        }
        if (bridgeInfo.driver.driverHostId && !row.driver.driverHostId) {
          row.driver.driverHostId = bridgeInfo.driver.driverHostId;
        }
        if (bridgeInfo.driver.shiftDate && !row.driver.shiftDate) {
          row.driver.shiftDate = bridgeInfo.driver.shiftDate;
        }
      }

      // Add working drivers from bridge that aren't in Ticket API data
      for (const bd of bridgeDrivers) {
        if (driverMap.has(bd.driverName)) continue;

        // Create a placeholder driver entry
        const placeholder: DispatchLoad = {
          id: 0,
          bolNumber: "",
          confirmationNo: "",
          status: "WORKING",
          pickupAccountName: "",
          pickupName: "",
          pickupOperator: "",
          tankName: "",
          dropoffAccountName: "",
          dropoffName: "",
          terminal: selectedTerminal,
          loadedMiles: null,
          requestedPickupDate: "",
          assignedPickupDate: "",
          pickupArrivalDate: "",
          progress: 0,
          dispatchedAt: "",
          driverName: bd.driverName,
          commodity: "",
          isUrgent: false,
          loadInstructions: "",
          aging: 0,
          pickupLat: null,
          pickupLng: null,
          dropoffLat: null,
          dropoffLng: null,
          driverId: bd.driverId,
          driverHostId: bd.driverHostId,
          driverPhone: bd.driverPhone,
          driverCarrier: bd.driverCarrier,
          sequenceNumber: null,
          shiftDate: bd.shiftDate,
        };

        driverMap.set(bd.driverName, { driver: placeholder, loads: [] });
      }
    }

    // Sort loads: by sequence number if available, otherwise by dispatchedAt
    for (const row of driverMap.values()) {
      if (hasBridge) {
        row.loads.sort((a, b) => {
          const seqA = a.sequenceNumber ?? 999;
          const seqB = b.sequenceNumber ?? 999;
          if (seqA !== seqB) return seqA - seqB;
          return a.dispatchedAt.localeCompare(b.dispatchedAt);
        });
      } else {
        row.loads.sort((a, b) => a.dispatchedAt.localeCompare(b.dispatchedAt));
      }
    }

    const rows = Array.from(driverMap.values()).sort((a, b) =>
      a.driver.driverName.localeCompare(b.driver.driverName)
    );

    return { openLoads: loadListLoads, driverRows: rows };
  }, [filteredLoads, bridgeLookup, bridgeDrivers, selectedTerminal, loadListLoads]);

  const driverCount = driverRows.length;

  /** Lookup any load by ID — searches both driver loads and open loads. */
  const findLoadById = useCallback((id: number): (DispatchLoad | Load | null) => {
    return filteredLoads.find((l) => l.id === id) || openLoads.find((l) => l.id === id) || null;
  }, [filteredLoads, openLoads]);

  const didDrag = useRef(false);

  const canDropLoad = useCallback((load: DispatchLoad | Load | null | undefined) => {
    return !!load && load.status.toUpperCase() === "ASSIGNED";
  }, []);

  /** Compute a 1-based insert index from pointer position within a driver row. */
  const getInsertIndex = useCallback((x: number, driverName: string, totalLoads: number): number => {
    const cards = document.querySelectorAll(`[data-driver-row="${driverName}"] [data-load-card]`);
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (x < midX) return i + 1; // 1-based
    }
    return totalLoads; // drop at end
  }, []);

  const askConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingConfirm({
        message,
        onConfirm: () => { setPendingConfirm(null); resolve(true); },
        onCancel: () => { setPendingConfirm(null); resolve(false); },
      });
    });
  }, []);

  const clearOpenPointerDrag = useCallback(() => {
    didDrag.current = false;
    setOpenPointerDrag(null);
    setDragData(null);
    setDragOverDriver(null);
  }, []);

  const clearTileHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  /* ── drag & drop handlers ────────────────────────────── */
  const onDragStart = (e: React.DragEvent, loadId: number, fromDriver: string | null) => {
    const data: DragData = { loadId, fromDriver };
    didDrag.current = false;
    setDragData(data);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    e.dataTransfer.setData("application/dispatch-load", JSON.stringify(data));
  };

  // Track drag source via dataTransfer (avoids React state timing issues)
  const onDragEnd = () => {
    didDrag.current = false;
    clearTileHold();
    setDragData(null);
    setDragOverDriver(null);
    setDragOverOpen(false);
    setArmedDragLoadId(null);
    setPressingLoadId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDropOnDriver = async (e: React.DragEvent, driverName: string) => {
    e.preventDefault();
    setDragOverDriver(null);

    let data: DragData;
    try {
      data = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch { return; }

    setDragData(null);

    const load = findLoadById(data.loadId);
    if (!load) return;
    const targetRow = driverRows.find((r) => r.driver.driverName === driverName);
    if (!targetRow) return;

    if (data.fromDriver === null) {
      const confirmed = await askConfirm(`Assign load ${load.confirmationNo || load.bolNumber} to ${driverName}?`);
      if (!confirmed) return;
    } else if (data.fromDriver === driverName) {
      const newSeq = getInsertIndex(e.clientX, driverName, targetRow.loads.length);
      const currentIdx = targetRow.loads.findIndex((l) => l.id === data.loadId);
      const currentSeq = currentIdx + 1;
      if (newSeq === currentSeq || newSeq === currentSeq + 1) return; // same position, no-op

      const confirmed = await askConfirm(`Move load ${load.confirmationNo || load.bolNumber} to position ${newSeq} on ${driverName}?`);
      if (!confirmed) return;
      try {
        setActionLoading(true);
        setError("");
        await callAssignment({
          action: "rearrange",
          loadId: load.id,
          billOfLadingNumber: load.bolNumber,
          driverId: targetRow.driver.driverId,
          driverHostId: targetRow.driver.driverHostId,
          shiftDate: targetRow.driver.shiftDate || todayMMDDYYYY(),
          sequenceNumber: newSeq,
        });
        await fetchLoads();
      } catch (err: any) {
        setError(err.message || "Rearrange failed");
      } finally {
        setActionLoading(false);
      }
      return;
    } else {
      const confirmed = await askConfirm(`Reassign load ${load.confirmationNo || load.bolNumber} from ${data.fromDriver} to ${driverName}?`);
      if (!confirmed) return;
    }

    try {
      setActionLoading(true);
      setError("");

      if (data.fromDriver === null) {
        // Open pool → driver: ADD
        await callAssignment({
          action: "add",
          loadId: load.id,
          billOfLadingNumber: load.bolNumber,
          driverId: targetRow.driver.driverId,
          driverHostId: targetRow.driver.driverHostId,
          shiftDate: targetRow.driver.shiftDate || todayMMDDYYYY(),
          terminalName: targetRow.driver.terminal || load.terminal,
          sequenceNumber: targetRow.loads.length + 1,
        });
      } else {
        // Different driver → REASSIGN
        await callAssignment({
          action: "reassign",
          loadId: load.id,
          billOfLadingNumber: load.bolNumber,
          driverId: targetRow.driver.driverId,
          driverHostId: targetRow.driver.driverHostId,
          shiftDate: targetRow.driver.shiftDate || todayMMDDYYYY(),
          sequenceNumber: targetRow.loads.length + 1,
        });
      }

      await fetchLoads();
    } catch (err: any) {
      setError(err.message || "Assignment failed");
    } finally {
      setActionLoading(false);
    }
  };

  const onDropOnOpen = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverOpen(false);

    let data: DragData;
    try {
      data = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch { return; }

    setDragData(null);

    // Only allow dropping from a driver back to open
    if (data.fromDriver === null) return;

    const load = findLoadById(data.loadId);
    if (!load || !canDropLoad(load as DispatchLoad)) return;

    const confirmed = await askConfirm(`Unassign load ${load.confirmationNo || load.bolNumber} from ${data.fromDriver}?`);
    if (!confirmed) return;

    const driverRow = driverRows.find((r) => r.driver.driverName === data.fromDriver);

    try {
      setActionLoading(true);
      setError("");
      await callAssignment({
        action: "drop",
        loadId: load.id,
        billOfLadingNumber: load.bolNumber,
        driverId: driverRow?.driver.driverId ?? (load as DispatchLoad).driverId,
        driverHostId: driverRow?.driver.driverHostId ?? (load as DispatchLoad).driverHostId,
        shiftDate: driverRow?.driver.shiftDate || todayMMDDYYYY(),
      });
      await fetchLoads();
    } catch (err: any) {
      setError(err.message || "Drop failed");
    } finally {
      setActionLoading(false);
    }
  };

  const callAssignment = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch("/api/loads/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Assignment failed");
    return data;
  }, []);

  /* ── edit save handler ──────────────────────────────── */
  const handleEditSave = async (loadId: number, updates: { tankName?: string; dropoffName?: string; dropoffAccountName?: string }) => {
    const load = filteredLoads.find((l) => l.id === loadId);
    if (!load) throw new Error("Load not found");

    const payload: Record<string, string> = {
      billOfLadingNumber: load.bolNumber,
    };
    if (updates.tankName !== undefined) payload.pickUpTankNumber = updates.tankName;
    if (updates.dropoffName !== undefined) payload.dropOffName = updates.dropoffName;
    if (updates.dropoffAccountName !== undefined) payload.dropOffAccountName = updates.dropoffAccountName;

    const res = await fetch("/api/loads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Edit failed");
    await fetchLoads();
  };

  /* ── card height constant ────────────────────────────── */
  const CARD_H = 68;

  useEffect(() => {
    if (!openPointerDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      setOpenPointerDrag((current) =>
        current
          ? { ...current, x: e.clientX, y: e.clientY }
          : current
      );

      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const driverRow = target?.closest("[data-driver-row]") as HTMLElement | null;
      setDragOverDriver(driverRow?.dataset.driverRow || null);
    };

    const handlePointerUp = async () => {
      const activeDrag = openPointerDrag;
      const targetDriver = dragOverDriver;
      clearOpenPointerDrag();

      if (!targetDriver) return;

      const load = findLoadById(activeDrag.loadId);
      const targetRow = driverRows.find((row) => row.driver.driverName === targetDriver);
      if (!load || !targetRow) return;

      const confirmed = await askConfirm(`Assign load ${load.confirmationNo || load.bolNumber} to ${targetDriver}?`);
      if (!confirmed) return;

      try {
        setActionLoading(true);
        setError("");
        await callAssignment({
          action: "add",
          loadId: load.id,
          billOfLadingNumber: load.bolNumber,
          driverId: targetRow.driver.driverId,
          driverHostId: targetRow.driver.driverHostId,
          shiftDate: targetRow.driver.shiftDate || todayMMDDYYYY(),
          terminalName: targetRow.driver.terminal || load.terminal,
          sequenceNumber: targetRow.loads.length + 1,
        });
        await fetchLoads();
      } catch (err: any) {
        setError(err.message || "Assignment failed");
      } finally {
        setActionLoading(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [askConfirm, callAssignment, clearOpenPointerDrag, dragOverDriver, driverRows, fetchLoads, findLoadById, openPointerDrag]);

  /* ── Card pointer drag (touch/mobile for driver tiles) ── */
  const clearCardPointerDrag = useCallback(() => {
    setCardPointerDrag(null);
    setDragData(null);
    setDragOverDriver(null);
    setDragOverOpen(false);
    setArmedDragLoadId(null);
    setPressingLoadId(null);
  }, []);

  useEffect(() => {
    if (!cardPointerDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      setCardPointerDrag((curr) => curr ? { ...curr, x: e.clientX, y: e.clientY } : curr);
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const driverRow = target?.closest("[data-driver-row]") as HTMLElement | null;
      const openPane = openPaneRef.current;
      if (driverRow) {
        setDragOverDriver(driverRow.dataset.driverRow || null);
        setDragOverOpen(false);
      } else if (openPane && (openPane === target || openPane.contains(target))) {
        setDragOverDriver(null);
        setDragOverOpen(true);
      } else {
        setDragOverDriver(null);
        setDragOverOpen(false);
      }
    };

    const handlePointerUp = async () => {
      const activeDrag = cardPointerDrag;
      const targetDriver = dragOverDriver;
      const isOverOpen = dragOverOpen;
      clearCardPointerDrag();

      const load = findLoadById(activeDrag.loadId);
      if (!load) return;

      if (isOverOpen && activeDrag.fromDriver) {
        const confirmed = await askConfirm(`Unassign load ${load.confirmationNo || load.bolNumber} from ${activeDrag.fromDriver}?`);
        if (!confirmed) return;
        const driverRow = driverRows.find((r) => r.driver.driverName === activeDrag.fromDriver);
        try {
          setActionLoading(true);
          setError("");
          await callAssignment({
            action: "drop",
            loadId: load.id,
            billOfLadingNumber: load.bolNumber,
            driverId: driverRow?.driver.driverId ?? (load as DispatchLoad).driverId,
            driverHostId: driverRow?.driver.driverHostId ?? (load as DispatchLoad).driverHostId,
            shiftDate: driverRow?.driver.shiftDate || todayMMDDYYYY(),
          });
          await fetchLoads();
        } catch (err: any) {
          setError(err.message || "Drop failed");
        } finally {
          setActionLoading(false);
        }
      } else if (targetDriver && targetDriver === activeDrag.fromDriver) {
        // Same driver — rearrange
        const targetRow = driverRows.find((r) => r.driver.driverName === targetDriver);
        if (!targetRow) return;
        const newSeq = getInsertIndex(activeDrag.x, targetDriver, targetRow.loads.length);
        const currentIdx = targetRow.loads.findIndex((l) => l.id === activeDrag.loadId);
        const currentSeq = currentIdx + 1;
        if (newSeq === currentSeq || newSeq === currentSeq + 1) return; // same position, no-op

        const confirmed = await askConfirm(`Move load ${load.confirmationNo || load.bolNumber} to position ${newSeq} on ${targetDriver}?`);
        if (!confirmed) return;
        try {
          setActionLoading(true);
          setError("");
          await callAssignment({
            action: "rearrange",
            loadId: load.id,
            billOfLadingNumber: load.bolNumber,
            driverId: targetRow.driver.driverId,
            driverHostId: targetRow.driver.driverHostId,
            shiftDate: targetRow.driver.shiftDate || todayMMDDYYYY(),
            sequenceNumber: newSeq,
          });
          await fetchLoads();
        } catch (err: any) {
          setError(err.message || "Rearrange failed");
        } finally {
          setActionLoading(false);
        }
      } else if (targetDriver && targetDriver !== activeDrag.fromDriver) {
        const targetRow = driverRows.find((r) => r.driver.driverName === targetDriver);
        if (!targetRow) return;
        const action = activeDrag.fromDriver ? "reassign" : "add";
        const confirmMsg = action === "reassign"
          ? `Reassign load ${load.confirmationNo || load.bolNumber} from ${activeDrag.fromDriver} to ${targetDriver}?`
          : `Assign load ${load.confirmationNo || load.bolNumber} to ${targetDriver}?`;
        const confirmed = await askConfirm(confirmMsg);
        if (!confirmed) return;
        try {
          setActionLoading(true);
          setError("");
          await callAssignment({
            action,
            loadId: load.id,
            billOfLadingNumber: load.bolNumber,
            driverId: targetRow.driver.driverId,
            driverHostId: targetRow.driver.driverHostId,
            shiftDate: targetRow.driver.shiftDate || todayMMDDYYYY(),
            terminalName: targetRow.driver.terminal || load.terminal,
            sequenceNumber: targetRow.loads.length + 1,
          });
          await fetchLoads();
        } catch (err: any) {
          setError(err.message || "Assignment failed");
        } finally {
          setActionLoading(false);
        }
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [askConfirm, callAssignment, cardPointerDrag, clearCardPointerDrag, dragOverDriver, dragOverOpen, driverRows, fetchLoads, findLoadById, getInsertIndex]);

  /* ── Load Card (driver tiles) ────────────────────────── */
  const renderLoadCard = (load: DispatchLoad, driverName: string) => {
    const isDragging = dragData?.loadId === load.id;
    const pct = load.progress;
    const bg = tileBg(load);
    const border = tileBorder(load);
    const draggable = canDropLoad(load);
    const isPressing = pressingLoadId === load.id;
    const isArmed = armedDragLoadId === load.id;

    return (
      <div
        key={load.id}
        draggable={draggable && isArmed}
        onPointerDown={(e) => {
          if (!draggable || e.button !== 0) return;
          didDrag.current = false;
          setPressingLoadId(load.id);
          pointerStartRef.current = { x: e.clientX, y: e.clientY, loadId: load.id };
          holdTimerRef.current = setTimeout(() => {
            setArmedDragLoadId(load.id);
          }, 220);
        }}
        onPointerMove={(e) => {
          const start = pointerStartRef.current;
          if (!start || start.loadId !== load.id) return;
          if (isArmed) {
            // Start pointer-based drag for mobile (HTML5 DnD doesn't fire on touch)
            if (!cardPointerDrag && !didDrag.current) {
              setCardPointerDrag({ loadId: load.id, fromDriver: driverName, x: e.clientX, y: e.clientY });
              setDragData({ loadId: load.id, fromDriver: driverName });
            }
            return;
          }
          const dx = Math.abs(e.clientX - start.x);
          const dy = Math.abs(e.clientY - start.y);
          if (dx > 6 || dy > 6) {
            clearTileHold();
            setPressingLoadId(null);
          }
        }}
        onPointerUp={() => {
          clearTileHold();
          setPressingLoadId(null);
          if (!dragData || dragData.loadId !== load.id) {
            setArmedDragLoadId(null);
          }
        }}
        onPointerLeave={() => {
          if (!dragData || dragData.loadId !== load.id) {
            clearTileHold();
            setPressingLoadId(null);
            setArmedDragLoadId(null);
          }
        }}
        onDragStart={(e) => {
          if (!isArmed) {
            e.preventDefault();
            return;
          }
          didDrag.current = true;
          onDragStart(e, load.id, driverName);
        }}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (!didDrag.current) setEditLoad(load);
        }}
        data-load-card={load.id}
        className="relative flex-shrink-0 rounded transition-all select-none overflow-hidden cursor-pointer"
        style={{
          width: 200,
          height: CARD_H,
          background: isDragging ? "rgba(59,130,246,0.15)" : isArmed ? "rgba(30,64,175,0.35)" : bg,
          border: `1px solid ${isArmed ? "#60a5fa" : border}`,
          opacity: isDragging ? 0.5 : 1,
          boxShadow: isArmed ? "0 0 0 1px rgba(96,165,250,0.45)" : isPressing ? "0 0 0 1px rgba(148,163,184,0.25)" : undefined,
          touchAction: isArmed ? "none" : "auto",
        }}
      >
        {/* Progress bar — top edge only */}
        <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: "rgba(0,0,0,0.3)" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "#22c55e",
              transition: "width 0.3s ease",
            }}
          />
          {pct > 0 && pct < 100 && (
            <div
              className="absolute top-0"
              style={{
                left: `${pct}%`,
                width: 3,
                height: "100%",
                background: "#f59e0b",
                transform: "translateX(-1px)",
              }}
            />
          )}
        </div>

        {/* Card content */}
        <div className="px-2 flex flex-col justify-center" style={{ height: CARD_H, paddingTop: 7, paddingBottom: 5 }}>
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold truncate text-slate-100">
              {load.pickupName || "—"}
            </span>
            {load.isUrgent && (
              <span className="text-[10px] text-red-400 flex-shrink-0">&#9888;</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-px">
            <span className="text-[11px] truncate text-slate-400">
              {load.dropoffName || "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
            <span className="truncate">{load.confirmationNo || load.bolNumber || "No conf"}</span>
            {load.tankName && <span className="truncate">Tank {load.tankName}</span>}
          </div>
        </div>
      </div>
    );
  };

  /* ── sorted open loads ────────────────────────────────── */
  const compareOpenValues = (a: Load, b: Load, key: OpenColumnKey, dir: SortDir) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";

    let comparison = 0;
    if (typeof av === "number" && typeof bv === "number") {
      comparison = av - bv;
    } else if (typeof av === "boolean" && typeof bv === "boolean") {
      comparison = Number(av) - Number(bv);
    } else {
      comparison = String(av).localeCompare(String(bv));
    }

    return dir === "desc" ? -comparison : comparison;
  };

  const sortedOpenLoads = useMemo(() => {
    const effectiveSort =
      openSortStack.length > 0
        ? openSortStack
        : [{ key: "aging" as OpenColumnKey, dir: "asc" as SortDir }];

    return [...openLoads].sort((a, b) => {
      for (const { key, dir } of effectiveSort) {
        const result = compareOpenValues(a, b, key, dir);
        if (result !== 0) return result;
      }
      return 0;
    });
  }, [openLoads, openSortStack]);

  const handleOpenSort = (key: OpenColumnKey) => {
    setOpenSortStack((previous) => {
      const existingIndex = previous.findIndex((item) => item.key === key);
      if (existingIndex >= 0) {
        if (existingIndex === previous.length - 1) {
          const updated = [...previous];
          updated[existingIndex] = {
            ...updated[existingIndex],
            dir: updated[existingIndex].dir === "asc" ? "desc" : "asc",
          };
          return updated;
        }
        return previous;
      }
      return [...previous, { key, dir: "asc" }];
    });
  };

  const removeOpenSort = useCallback((key: OpenColumnKey) => {
    setOpenSortStack((previous) => previous.filter((item) => item.key !== key));
  }, []);

  const startResizeColumn = (key: OpenColumnKey, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizingCol.current = {
      key,
      startX: event.clientX,
      startW: openColumnWidths[key],
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const orderedOpenCols = useMemo(
    () => openColumnOrder.map((key) => OPEN_COLS_MAP.get(key)).filter(Boolean) as (typeof OPEN_COLS)[number][],
    [openColumnOrder]
  );

  const onOpenColDragStart = (key: OpenColumnKey, event: React.DragEvent) => {
    dragOpenCol.current = key;
    setDraggingOpenCol(key);
    event.dataTransfer.effectAllowed = "move";
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    event.dataTransfer.setDragImage(img, 0, 0);
  };

  const onOpenColDrop = (targetKey: OpenColumnKey, event: React.DragEvent) => {
    event.preventDefault();
    const fromKey = dragOpenCol.current;
    if (!fromKey || fromKey === targetKey) return;

    setOpenColumnOrder((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(fromKey);
      const targetIndex = next.indexOf(targetKey);
      if (fromIndex < 0 || targetIndex < 0) return current;
      next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, fromKey);
      return next;
    });
  };

  const onOpenColDragEnd = () => {
    dragOpenCol.current = null;
    setDraggingOpenCol(null);
  };

  /* ── Open load table row (draggable) ─────────────────── */
  const renderOpenCell = (load: Load, key: OpenColumnKey) => {
    if (key === "isUrgent") {
      return (
        <span className={`whitespace-nowrap ${load.isUrgent ? "text-red-400" : "text-slate-500"}`}>
          {load.isUrgent ? "Yes" : ""}
        </span>
      );
    }
    if (key === "confirmationNo") {
      return <span className="font-mono text-slate-400 whitespace-nowrap">{load.confirmationNo}</span>;
    }
    if (key === "pickupName") {
      return (
        <span className="text-slate-200 font-medium truncate">
          {load.pickupName}
          {load.isUrgent && <span className="text-red-400 ml-1">&#9888;</span>}
        </span>
      );
    }
    if (key === "aging") {
      const v = load.aging;
      const color = v >= 3 ? "text-red-400" : v >= 1 ? "text-amber-400" : "text-slate-500";
      return <span className={`whitespace-nowrap ${color}`}>{v > 0 ? `${v}d` : v === 0 ? "today" : ""}</span>;
    }
    if (key === "loadedMiles") {
      return <span className="text-slate-500 whitespace-nowrap">{load.loadedMiles ?? ""}</span>;
    }

    const value = load[key];
    const textColor =
      key === "requestedPickupDate" || key === "loadInstructions" ? "text-slate-500" : "text-slate-400";

    return <span className={`truncate ${textColor}`}>{String(value ?? "")}</span>;
  };

  const OpenLoadRow = ({ load }: { load: Load }) => {
    const isDragging = openPointerDrag?.loadId === load.id;
    return (
      <div
        className="grid cursor-grab active:cursor-grabbing transition-colors hover:bg-slate-800/60 border-t border-slate-800/50"
        style={{
          gridTemplateColumns: `${DRAG_COL_W}px ${orderedOpenCols.map((col) => `${openColumnWidths[col.key]}px`).join(" ")}`,
          opacity: isDragging ? 0.55 : 1,
          background: isDragging ? "rgba(59,130,246,0.12)" : undefined,
          outline: isDragging ? "1px solid rgba(96,165,250,0.55)" : undefined,
        }}
      >
        <div
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            didDrag.current = true;
            setDragData({ loadId: load.id, fromDriver: null });
            setOpenPointerDrag({ loadId: load.id, x: e.clientX, y: e.clientY });
          }}
          className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap flex items-center cursor-grab active:cursor-grabbing select-none"
          title={`Drag to assign ${load.pickupName || load.confirmationNo}`}
        >
          ⋮⋮
        </div>
        {orderedOpenCols.map((col) => (
          <div
            key={col.key}
            className="px-2 py-2 text-xs min-w-0 flex items-center"
          >
            {renderOpenCell(load, col.key)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col relative" style={{ background: "var(--color-bg-primary)" }}>
      {/* ── Header bar ──────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 flex-shrink-0 border-b"
        style={{
          background: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="min-w-[220px]">
          <div className="text-lg font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-primary)" }}>
            Dispatch Board
          </div>
        </div>

        <select
          value={selectedTerminal}
          onChange={(e) => setSelectedTerminal(e.target.value)}
          className="text-sm font-semibold rounded-xl px-3 py-2"
          style={{
            background: "var(--color-input-bg)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-input-border)",
          }}
        >
          {TERMINALS.map((terminal) => (
            <option key={terminal} value={terminal}>{terminal}</option>
          ))}
        </select>

        <div className="self-stretch w-px" style={{ background: "var(--color-border)" }} />

        <div className="flex items-baseline gap-2" style={{ color: "var(--color-text-secondary)" }}>
          <span className="text-sm font-medium uppercase tracking-[0.18em]">Drivers</span>
          <span
            className="text-3xl font-semibold leading-none"
            style={{ color: "var(--color-text-primary)" }}
          >
            {driverCount}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-input-border)" }}>
            <button
              onClick={() => onModuleChange("loads")}
              className="px-3 py-1.5 text-sm transition-colors"
              style={{
                background: "var(--color-input-bg)",
                color: "var(--color-text-secondary)",
              }}
            >
              Loads
            </button>
            <button
              className="px-3 py-1.5 text-sm transition-colors"
              style={{
                background: "var(--color-accent)",
                color: "#fff",
                borderLeft: "1px solid var(--color-input-border)",
              }}
            >
              Dispatch
            </button>
          </div>

          <div className="self-stretch w-px" style={{ background: "var(--color-border)" }} />

          <button
            onClick={() => setShowBridgeModal(true)}
            className="rounded-full border px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5"
            style={{
              background: hasBridgeData ? "rgba(34,197,94,0.12)" : "var(--color-input-bg)",
              borderColor: hasBridgeData ? "var(--color-success)" : "var(--color-input-border)",
              color: hasBridgeData ? "#86efac" : "var(--color-text-secondary)",
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: hasBridgeData ? "var(--color-success)" : "var(--color-text-muted)" }}
            />
            {hasBridgeData ? "Bridge Active" : "Bridge Offline"}
          </button>

          <div className="self-stretch w-px" style={{ background: "var(--color-border)" }} />

          <button
            onClick={fetchLoads}
            disabled={loading}
            className="rounded-lg px-3 py-1.5 text-sm transition-colors"
            style={{
              background: "var(--color-accent)",
              border: "1px solid var(--color-accent)",
              color: "#fff",
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <div className="self-stretch w-px" style={{ background: "var(--color-border)" }} />

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((current) => !current)}
              className="h-[34px] w-[34px] rounded-lg transition-colors"
              style={{
                background: "var(--color-input-bg)",
                border: "1px solid var(--color-input-border)",
                color: "var(--color-text-secondary)",
              }}
              title="Open menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-40 mt-2 min-w-[170px] rounded-xl p-2 shadow-lg"
                style={{
                  background: "var(--color-surface-strong)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="px-2 py-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {userName}
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onThemeToggle();
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-red-600/20"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-sm text-red-300 bg-red-900/50 flex items-center gap-2">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto text-red-300 hover:text-red-100">&times;</button>
        </div>
      )}

      {/* Action loading overlay — blocks all interaction */}
      {actionLoading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-slate-800 border border-slate-600 shadow-2xl">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-200">Processing...</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {selectedTerminal && loading && allLoads.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Board */}
      {selectedTerminal && !(loading && allLoads.length === 0) && (
        <div className="flex-1 flex flex-col overflow-hidden" ref={boardRef}>

          {/* ── Loading overlay ──────────────────────────── */}
          {loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 pointer-events-none">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 shadow-lg pointer-events-auto">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-300">Refreshing...</span>
              </div>
            </div>
          )}

          {/* ── Open Loads Table ────────────────────────── */}
          <div
            ref={openPaneRef}
            className={`mx-4 mt-3 rounded-lg bg-slate-900 border transition-colors flex-shrink-0 ${
              dragOverOpen && canDropLoad(findLoadById(dragData?.loadId ?? 0))
                ? "border-blue-500 bg-blue-950/30"
                : "border-slate-700"
            }`}
            onDragOver={(e) => {
              const activeLoad = findLoadById(dragData?.loadId ?? 0);
              if (!canDropLoad(activeLoad)) return;
              handleDragOver(e);
              setDragOverOpen(true);
            }}
            onDragLeave={() => setDragOverOpen(false)}
            onDrop={onDropOnOpen}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
              onClick={() => setOpenCollapsed((v) => !v)}
            >
              <span className="text-[11px] text-slate-500">{openCollapsed ? "▶" : "▼"}</span>
              <span className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Open Loads
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-900/40 text-blue-400">
                {openLoads.length}
              </span>
              <span className="text-[11px] text-slate-500 ml-2">
                Grab a row and drag onto a driver to assign
              </span>
              {dragData?.fromDriver !== null && canDropLoad(findLoadById(dragData?.loadId ?? 0)) && (
                <span className="text-xs text-blue-400 ml-2">Drop here to unassign</span>
              )}
            </div>
            {!openCollapsed && (
              <>
                {openSortStack.length > 0 && (
                  <div className="sticky top-0 z-20 border-t border-slate-800 bg-slate-900 px-2 py-1.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                    <span className="text-xs text-slate-500">Sort:</span>
                    {openSortStack.map((entry, index) => {
                      const column = OPEN_COLS.find((col) => col.key === entry.key);
                      return (
                        <span
                          key={entry.key}
                          className="inline-flex items-center gap-1.5 text-xs bg-blue-600/20 text-blue-400 rounded-md px-2.5 py-1"
                        >
                          {index + 1}. {column?.label ?? entry.key} {entry.dir === "asc" ? "↑" : "↓"}
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              removeOpenSort(entry.key);
                            }}
                            className="hover:text-red-400 ml-0.5 text-sm leading-none"
                            title={`Remove ${column?.label ?? entry.key} sort`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    <button
                      onClick={() => setOpenSortStack([])}
                      className="text-xs text-slate-500 hover:text-red-400 ml-auto flex-shrink-0"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: openPaneHeight }}>
                  <div
                    className="min-w-max text-left"
                    style={{ width: `calc(${DRAG_COL_W}px + ${orderedOpenCols.reduce((sum, col) => sum + openColumnWidths[col.key], 0)}px)` }}
                  >
                    <div
                      className={`sticky ${openSortStack.length > 0 ? "top-[37px]" : "top-0"} bg-slate-800 border-b border-slate-700 grid`}
                      style={{ gridTemplateColumns: `${DRAG_COL_W}px ${orderedOpenCols.map((col) => `${openColumnWidths[col.key]}px`).join(" ")}` }}
                    >
                      <div />
                      {orderedOpenCols.map((col) => {
                        const sortIndex = openSortStack.findIndex((entry) => entry.key === col.key);
                        const sortEntry = sortIndex >= 0 ? openSortStack[sortIndex] : null;
                        const isLocked = !!sortEntry && sortIndex < openSortStack.length - 1;
                        return (
                          <div
                            key={col.key}
                            draggable
                            onDragStart={(event) => onOpenColDragStart(col.key, event)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => onOpenColDrop(col.key, event)}
                            onDragEnd={onOpenColDragEnd}
                            className={`px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap select-none transition-colors relative flex items-center gap-1 ${
                              isLocked
                                ? "text-blue-400/60 cursor-pointer"
                                : sortEntry
                                ? "text-blue-400 cursor-pointer hover:bg-slate-700/60"
                                : "text-slate-400 cursor-pointer hover:bg-slate-700/60"
                            }`}
                            style={{ opacity: draggingOpenCol === col.key ? 0.5 : 1 }}
                            onClick={() => handleOpenSort(col.key)}
                            title={
                              sortEntry && isLocked
                                ? `${col.label} is locked until later sorts are removed`
                                : `Sort by ${col.label}`
                            }
                          >
                            <span className="truncate">{col.label}</span>
                            {sortEntry && (
                              <span className="flex items-center gap-0.5 text-[10px] flex-shrink-0">
                                <span className={`${isLocked ? "bg-blue-600/50" : "bg-blue-600"} text-white rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none`}>
                                  {sortIndex + 1}
                                </span>
                                <span>{sortEntry.dir === "asc" ? "▲" : "▼"}</span>
                              </span>
                            )}
                            <div
                              onMouseDown={(event) => startResizeColumn(col.key, event)}
                              onClick={(event) => event.stopPropagation()}
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div>
                      {sortedOpenLoads.map((load) => (
                        <OpenLoadRow key={load.id} load={load} />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Resize handle + Divider ──────────────────── */}
          {!openCollapsed && (
            <div
              className="mx-4 flex items-center justify-center cursor-row-resize select-none group"
              style={{ height: 12 }}
              onPointerDown={(e) => {
                e.preventDefault();
                const startY = e.clientY;
                const startHeight = openPaneHeight;
                const maxH = window.innerHeight * 0.5;
                const minH = 120;

                const onMove = (ev: PointerEvent) => {
                  const delta = ev.clientY - startY;
                  setOpenPaneHeight(Math.max(minH, Math.min(maxH, startHeight + delta)));
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
            >
              <div className="w-12 h-1 rounded-full bg-slate-700 group-hover:bg-slate-500 transition-colors" />
            </div>
          )}

          {/* ── Driver Rows ────────────────────────────── */}
          <div className="flex-1 overflow-auto px-4 pb-4">
            {driverRows.map((row) => {
              const d = row.driver;
              const loads = row.loads;
              const completedCount = loads.filter((l) => l.status.toUpperCase() === "COMPLETE").length;
              const totalCount = loads.length;
              const isDropTarget = dragOverDriver === d.driverName && dragData !== null;

              return (
                <div
                  key={d.driverName}
                  data-driver-row={d.driverName}
                  className={`flex items-stretch rounded-lg mb-2 overflow-hidden bg-slate-900 border transition-colors ${
                    isDropTarget ? "border-blue-500 bg-blue-950/20" : "border-slate-700"
                  }`}
                  onDragOver={(e) => {
                    handleDragOver(e);
                    setDragOverDriver(d.driverName);
                  }}
                  onDragLeave={() => setDragOverDriver(null)}
                  onDrop={(e) => onDropOnDriver(e, d.driverName)}
                >
                  {/* Driver info tile */}
                  <div
                    className="flex-shrink-0 flex flex-col justify-center px-3"
                    style={{
                      width: 180,
                      minHeight: CARD_H,
                      background: "#0f172a",
                      borderRight: "1px solid #334155",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate text-slate-100">
                        {d.driverName}
                      </span>
                      {d.shiftDate && (
                        <span className="text-[10px] text-slate-500">
                          {d.shiftDate.split("/").slice(0, 2).join("/")}
                        </span>
                      )}
                    </div>
                    {d.driverCarrier && (
                      <div className="text-[10px] truncate mt-0.5 text-slate-500">
                        {d.driverCarrier}
                      </div>
                    )}
                    {d.driverPhone && (
                      <div className="text-[10px] mt-0.5 flex items-center gap-1 text-slate-500">
                        <span>&#9742;</span> {d.driverPhone}
                      </div>
                    )}
                    <div className="text-[10px] mt-0.5 text-slate-600">
                      {completedCount}/{totalCount} complete
                    </div>
                  </div>

                  {/* Load cards row */}
                  <div className="flex-1 flex items-center gap-1.5 overflow-x-auto px-2 py-1.5">
                    {loads.map((load) => renderLoadCard(load, d.driverName))}

                    {loads.length === 0 && (
                      <div
                        className="flex items-center justify-center text-xs italic flex-1 text-slate-600"
                        style={{ minHeight: CARD_H }}
                      >
                        Drop loads here
                      </div>
                    )}

                    {isDropTarget && loads.length > 0 && (
                      <div className="flex items-center justify-center text-xs text-blue-400 px-3">
                        {dragData?.fromDriver === d.driverName ? "Reorder" : dragData?.fromDriver === null ? "+ Assign" : "Reassign"}
                      </div>
                    )}
                    {dragData !== null && !isDropTarget && (
                      <div className="flex items-center justify-center text-[10px] text-slate-600 px-2">
                        Drop here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {driverRows.length === 0 && !loading && (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <p className="text-sm">No drivers found for this terminal and date range</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editLoad && (
        <DispatchLoadEditModal
          load={editLoad}
          onClose={() => setEditLoad(null)}
          onSave={handleEditSave}
        />
      )}

      {openPointerDrag && (() => {
        const load = findLoadById(openPointerDrag.loadId);
        if (!load) return null;

        return (
          <div
            className="fixed z-50 pointer-events-none rounded-md border border-blue-400 bg-slate-900/95 px-3 py-2 shadow-lg"
            style={{
              left: openPointerDrag.x + 14,
              top: openPointerDrag.y + 14,
            }}
          >
            <div className="text-xs font-semibold text-slate-100">
              {load.pickupName || load.confirmationNo}
            </div>
            <div className="text-[11px] text-blue-300">
              Drop on a driver to assign
            </div>
          </div>
        );
      })()}

      {/* Welltrax Bridge Modal */}
      {showBridgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowBridgeModal(false)}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[440px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-slate-100">Welltrax Bridge</h3>
              <button onClick={() => setShowBridgeModal(false)} className="text-slate-400 hover:text-slate-200">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {hasBridgeData ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Receiving data from Welltrax
                  </div>
                  <div className="space-y-1">
                    {bridgeStatus!.cached.map((b, i) => {
                      const termName = b.terminalName || `Terminal ${b.terminalId}`;
                      return (
                        <div key={i} className="flex items-center gap-3 text-xs text-slate-300 bg-slate-900 rounded px-3 py-2">
                          <span className="font-medium">{termName}</span>
                          <span className="text-slate-500">{b.date}</span>
                          <span className="text-emerald-400">{b.workingDrivers} drivers</span>
                          <span className="ml-auto text-slate-500">{b.ageSeconds}s ago</span>
                        </div>
                      );
                    })}
                  </div>
                  {bridgeDrivers.length > 0 && (
                    <p className="text-xs text-emerald-400/70 mt-2">
                      Merged {bridgeDrivers.length} drivers with sequence data into the board.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="inline-block w-2 h-2 rounded-full bg-slate-500" />
                    No data yet
                  </div>
                  <div className="text-xs text-slate-400 space-y-2">
                    <p className="font-medium text-slate-300">Setup (one time):</p>
                    <ol className="list-decimal list-inside space-y-1 pl-1">
                      <li>Open <code className="text-amber-300 bg-slate-900 px-1 rounded">chrome://extensions</code></li>
                      <li>Enable &ldquo;Developer mode&rdquo; (top right)</li>
                      <li>Click &ldquo;Load unpacked&rdquo; and select the <code className="text-amber-300 bg-slate-900 px-1 rounded">extension</code> folder</li>
                    </ol>
                    <p className="font-medium text-slate-300 mt-3">Usage:</p>
                    <p>Open the <a href="https://welltrax.wolfepakcloud.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Welltrax dispatch board</a> for any terminal. Data syncs here automatically.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-6 mx-4 max-w-sm w-full">
            <p className="text-sm text-slate-200 mb-5">{pendingConfirm.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={pendingConfirm.onCancel}
                className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={pendingConfirm.onConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
