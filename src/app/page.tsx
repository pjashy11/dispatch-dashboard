"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import FilterBar from "@/components/FilterBar";
import LoadList from "@/components/LoadList";
import LoadForm from "@/components/LoadForm";
import DispatchBoard from "@/components/DispatchBoard";
import LoginScreen from "@/components/LoginScreen";
import { useAuth } from "@/lib/AuthContext";
import type { Load, Scenario } from "@/lib/types";
import { useLoadSelectors } from "@/lib/loadSelectors";

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();

  const [allLoads, setAllLoads] = useState<Load[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedTerminals, setSelectedTerminals] = useState<string[]>([]);
  const [showToday, setShowToday] = useState(true);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedPickups, setSelectedPickups] = useState<string[]>([]);
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [selectedDropoffs, setSelectedDropoffs] = useState<string[]>([]);
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cacheRefreshing, setCacheRefreshing] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lastTerminal, setLastTerminal] = useState("");
  const [dividerX, setDividerX] = useState(60);
  const [showDetailPane, setShowDetailPane] = useState(true);
  const [activeModule, setActiveModule] = useState<"loads" | "dispatch">("loads");
  const dragging = useRef(false);

  // Workspace preferences — column order, widths, pane size
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  // Load workspace preferences from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dispatch-workspace");
      if (saved) {
        const ws = JSON.parse(saved);
        if (ws.columnOrder) setColumnOrder(ws.columnOrder);
        if (ws.columnWidths) setColumnWidths(ws.columnWidths);
        if (ws.dividerX != null) setDividerX(ws.dividerX);
        if (ws.showDetailPane != null) setShowDetailPane(ws.showDetailPane);
      }
    } catch {}
    setWorkspaceLoaded(true);
  }, []);

  // Persist workspace preferences
  const saveWorkspaceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!workspaceLoaded) return;
    clearTimeout(saveWorkspaceRef.current);
    saveWorkspaceRef.current = setTimeout(() => {
      localStorage.setItem(
        "dispatch-workspace",
        JSON.stringify({ columnOrder, columnWidths, dividerX, showDetailPane })
      );
    }, 300);
  }, [columnOrder, columnWidths, dividerX, showDetailPane, workspaceLoaded]);

  // Theme
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = localStorage.getItem("dispatch-theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dispatch-theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Fetch scenarios on mount
  useEffect(() => {
    fetch("/api/setupinfo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scenarios" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.scenarios) setScenarios(d.scenarios);
      })
      .catch(console.error);
  }, []);

  const fetchLoads = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTerminals.length > 0) {
        params.set("terminals", selectedTerminals.join(","));
      }
      if (forceRefresh) {
        params.set("refresh", "1");
      }
      const res = await fetch(`/api/loads?${params}`);
      const data = await res.json();
      setAllLoads(data.loads || []);
    } catch (err) {
      console.error("Failed to fetch loads:", err);
      setAllLoads([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTerminals]);

  // Fetch loads when filters change
  useEffect(() => {
    fetchLoads();
  }, [fetchLoads]);

  const {
    filteredLoads,
    availableAccounts,
    availablePickups,
    availableOperators,
    availableDropoffs,
    accountsByTerminal,
  } = useLoadSelectors({
    allLoads,
    showToday,
    showTomorrow,
    selectedAccounts,
    selectedPickups,
    selectedOperators,
    selectedDropoffs,
    showUrgentOnly,
  });

  const handleRefreshCache = useCallback(async () => {
    setCacheRefreshing(true);
    try {
      await Promise.all([
        fetch("/api/pickups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear" }),
        }),
        fetch("/api/dropoffs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear" }),
        }),
      ]);
      // Also re-fetch loads to get fresh data
      await fetchLoads(true);
    } catch (err) {
      console.error("Cache refresh failed:", err);
    } finally {
      setCacheRefreshing(false);
    }
  }, [fetchLoads]);

  const handleSelectLoad = (load: Load) => {
    setSelectedLoad(load);
    setShowForm(true);
  };

  const handleLoadCreated = (terminal: string) => {
    setLastTerminal(terminal);
    setShowForm(false);
    setSelectedLoad(null);
    fetchLoads();
  };

  // Resizable divider
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      const pct = (e.clientX / window.innerWidth) * 100;
      setDividerX(Math.max(30, Math.min(75, pct)));
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
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
  }, []);

  // Hardcoded terminals for the form
  const terminalOptions = [
    { id: 1, hostId: "", name: "MIDLAND" },
    { id: 2, hostId: "", name: "CARLSBAD/ORLA" },
    { id: 3, hostId: "", name: "PECOS/FT STOCKTON" },
    { id: 4, hostId: "", name: "SOUTH TEXAS" },
  ];

  // Derive display name from Firebase user
  const displayName = user?.displayName || user?.email?.split("@")[0] || "";

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--color-text-muted)" }}>
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (activeModule === "dispatch") {
    return (
      <div className="h-full flex flex-col">
        <DispatchBoard
          onModuleChange={setActiveModule}
          userName={displayName}
          onSignOut={signOut}
          theme={theme}
          onThemeToggle={toggleTheme}
          scenarios={scenarios}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <FilterBar
        selectedTerminals={selectedTerminals}
        onTerminalsChange={setSelectedTerminals}
        showToday={showToday}
        showTomorrow={showTomorrow}
        onToggleToday={() => setShowToday((v) => !v)}
        onToggleTomorrow={() => setShowTomorrow((v) => !v)}
        selectedAccounts={selectedAccounts}
        onAccountsChange={setSelectedAccounts}
        availableAccounts={availableAccounts}
        selectedPickups={selectedPickups}
        onPickupsChange={setSelectedPickups}
        availablePickups={availablePickups}
        selectedOperators={selectedOperators}
        onOperatorsChange={setSelectedOperators}
        availableOperators={availableOperators}
        selectedDropoffs={selectedDropoffs}
        onDropoffsChange={setSelectedDropoffs}
        availableDropoffs={availableDropoffs}
        showUrgentOnly={showUrgentOnly}
        onUrgentToggle={() => setShowUrgentOnly((v) => !v)}
        onClearAllFilters={() => {
          setSelectedAccounts([]);
          setSelectedPickups([]);
          setSelectedOperators([]);
          setSelectedDropoffs([]);
          setShowUrgentOnly(false);
        }}
        hasActiveFilters={
          selectedAccounts.length > 0 ||
          selectedPickups.length > 0 ||
          selectedOperators.length > 0 ||
          selectedDropoffs.length > 0 ||
          showUrgentOnly
        }
        activeFilterChips={[
          ...selectedAccounts.map((value) => ({ key: `account:${value}`, label: value, group: "account" as const })),
          ...selectedPickups.map((value) => ({ key: `pickup:${value}`, label: value, group: "pickup" as const })),
          ...selectedOperators.map((value) => ({ key: `operator:${value}`, label: value, group: "operator" as const })),
          ...selectedDropoffs.map((value) => ({ key: `dropoff:${value}`, label: value, group: "dropoff" as const })),
          ...(showUrgentOnly ? [{ key: "urgent", label: "Urgent only", group: "urgent" as const }] : []),
        ]}
        onRemoveFilter={(group, value) => {
          if (group === "account") setSelectedAccounts((current) => current.filter((item) => item !== value));
          if (group === "pickup") setSelectedPickups((current) => current.filter((item) => item !== value));
          if (group === "operator") setSelectedOperators((current) => current.filter((item) => item !== value));
          if (group === "dropoff") setSelectedDropoffs((current) => current.filter((item) => item !== value));
          if (group === "urgent") setShowUrgentOnly(false);
        }}
        onRefresh={() => fetchLoads(true)}
        onRefreshCache={handleRefreshCache}
        cacheRefreshing={cacheRefreshing}
        loadCount={filteredLoads.length}
        theme={theme}
        onThemeToggle={toggleTheme}
        showDetailPane={showDetailPane}
        onDetailPaneToggle={() => setShowDetailPane((v) => !v)}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        userName={displayName}
        onSignOut={signOut}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <div style={{ width: showDetailPane ? `${dividerX}%` : "100%" }} className="min-h-0 overflow-auto">
          <LoadList
            loads={filteredLoads}
            loading={loading}
            selectedLoad={selectedLoad}
            onSelectLoad={(load) => {
              handleSelectLoad(load);
              if (!showDetailPane) setShowDetailPane(true);
            }}
            columnOrder={columnOrder.length > 0 ? columnOrder : undefined}
            columnWidths={Object.keys(columnWidths).length > 0 ? columnWidths : undefined}
            onColumnOrderChange={setColumnOrder}
            onColumnWidthsChange={setColumnWidths}
          />
        </div>

        {showDetailPane && (
          <>
            {/* Resizable divider */}
            <div
              className="w-1 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
              style={{ background: "var(--color-border)" }}
              onMouseDown={onMouseDown}
            />

            {/* Right panel */}
            <div
              style={{ width: `${100 - dividerX}%` }}
              className="min-h-0 overflow-auto"
            >
              {showForm ? (
                <LoadForm
                  terminals={terminalOptions}
                  scenarios={scenarios}
                  lastTerminal={lastTerminal || selectedTerminals[0] || ""}
                  accountsByTerminal={accountsByTerminal}
                  existingLoad={selectedLoad}
                  onCreated={handleLoadCreated}
                  onCancel={() => {
                    setShowForm(false);
                    setSelectedLoad(null);
                  }}
                  onLoadUpdated={() => {
                    fetchLoads();
                  }}
                  userName={displayName}
                />
              ) : (
                <div className="h-full flex items-center justify-center" style={{ color: "var(--color-text-muted)" }}>
                  <div className="text-center">
                    <p className="text-lg">Select a load or create a new one</p>
                    <button
                      onClick={() => {
                        setSelectedLoad(null);
                        setShowForm(true);
                      }}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      + New Load
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
