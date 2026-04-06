"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const TERMINALS = [
  "MIDLAND",
  "CARLSBAD/ORLA",
  "PECOS/FT STOCKTON",
  "SOUTH TEXAS",
];

interface FilterBarProps {
  selectedTerminals: string[];
  onTerminalsChange: (t: string[]) => void;
  showToday: boolean;
  showTomorrow: boolean;
  onToggleToday: () => void;
  onToggleTomorrow: () => void;
  selectedAccounts: string[];
  onAccountsChange: (a: string[]) => void;
  availableAccounts: string[];
  selectedPickups: string[];
  onPickupsChange: (v: string[]) => void;
  availablePickups: string[];
  selectedOperators: string[];
  onOperatorsChange: (v: string[]) => void;
  availableOperators: string[];
  selectedDropoffs: string[];
  onDropoffsChange: (v: string[]) => void;
  availableDropoffs: string[];
  showUrgentOnly: boolean;
  onUrgentToggle: () => void;
  onClearAllFilters: () => void;
  hasActiveFilters: boolean;
  activeFilterChips: Array<{
    key: string;
    label: string;
    group: "account" | "pickup" | "operator" | "dropoff" | "urgent";
  }>;
  onRemoveFilter: (
    group: "account" | "pickup" | "operator" | "dropoff" | "urgent",
    value?: string
  ) => void;
  onRefresh: () => void;
  onRefreshCache: () => void;
  cacheRefreshing: boolean;
  loadCount: number;
  theme: "dark" | "light";
  onThemeToggle: () => void;
  showDetailPane: boolean;
  onDetailPaneToggle: () => void;
  activeModule: "loads" | "dispatch";
  onModuleChange: (m: "loads" | "dispatch") => void;
  userName?: string;
  onSignOut?: () => void;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt]
    );
  };

  const filteredOptions = useMemo(() => {
    if (search.length < 2) return options;
    const term = search.toUpperCase();
    return options.filter((opt) => opt.toUpperCase().includes(term));
  }, [options, search]);

  const display =
    selected.length === 0
      ? `All ${label}`
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded px-3 py-1.5 text-sm text-left min-w-[160px] flex items-center gap-2 transition-colors"
        style={{
          background: "var(--color-input-bg)",
          border: "1px solid var(--color-input-border)",
          color: "var(--color-text-primary)",
        }}
      >
        <span className="truncate flex-1">{display}</span>
        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>▼</span>
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 w-full min-w-[200px] max-h-72 overflow-auto rounded shadow-lg"
          style={{
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-input-border)",
          }}
        >
          {/* Search input */}
          <div className="sticky top-0 z-10" style={{ background: "var(--color-input-bg)" }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter..."
              className="w-full px-3 py-1.5 text-sm outline-none"
              style={{
                background: "var(--color-input-bg)",
                color: "var(--color-text-primary)",
                borderBottom: "1px solid var(--color-border)",
              }}
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-xs text-left hover:opacity-80"
              style={{
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              Clear all
            </button>
          )}
          {filteredOptions.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:opacity-80"
              style={{
                background: selected.includes(opt)
                  ? "var(--color-bg-tertiary)"
                  : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-blue-500 rounded"
              />
              <span style={{ color: "var(--color-text-primary)" }}>{opt}</span>
            </label>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {search.length >= 2 ? "No matches" : "No options"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({
  selectedTerminals,
  onTerminalsChange,
  showToday,
  showTomorrow,
  onToggleToday,
  onToggleTomorrow,
  selectedAccounts,
  onAccountsChange,
  availableAccounts,
  selectedPickups,
  onPickupsChange,
  availablePickups,
  selectedOperators,
  onOperatorsChange,
  availableOperators,
  selectedDropoffs,
  onDropoffsChange,
  availableDropoffs,
  showUrgentOnly,
  onUrgentToggle,
  onClearAllFilters,
  hasActiveFilters,
  activeFilterChips,
  onRemoveFilter,
  onRefresh,
  onRefreshCache,
  cacheRefreshing,
  loadCount,
  theme,
  onThemeToggle,
  showDetailPane,
  onDetailPaneToggle,
  activeModule,
  onModuleChange,
  userName,
  onSignOut,
}: FilterBarProps) {
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRefresh = useCallback(() => {
    if (cooldown > 0) return;
    onRefresh();
    setCooldown(60);
  }, [cooldown, onRefresh]);

  useEffect(() => {
    if (cooldown <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  return (
    <div
      className="border-b"
      style={{
        background: "var(--color-bg-secondary)",
        borderBottom: "1px solid var(--color-border)",
      }}
      >
        <div className="px-4 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px]">
            <div className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Dispatch Dashboard
            </div>
            <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {loadCount} total loads
            </div>
          </div>

          <div className="self-stretch w-px mx-2 hidden xl:block" style={{ background: "var(--color-border)" }} />

          <div className="flex-1 min-w-[640px] flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Terminal
              </label>
              <MultiSelect
                label="Terminals"
                options={TERMINALS}
                selected={selectedTerminals}
                onChange={onTerminalsChange}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Day
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onToggleToday}
                  className="rounded-full px-3 py-1 text-sm transition-colors"
                  style={{
                    background: showToday ? "var(--color-accent)" : "var(--color-input-bg)",
                    border: `1px solid ${showToday ? "var(--color-accent)" : "var(--color-input-border)"}`,
                    color: showToday ? "#fff" : "var(--color-text-primary)",
                  }}
                >
                  Today
                </button>
                <button
                  onClick={onToggleTomorrow}
                  className="rounded-full px-3 py-1 text-sm transition-colors"
                  style={{
                    background: showTomorrow ? "var(--color-accent)" : "var(--color-input-bg)",
                    border: `1px solid ${showTomorrow ? "var(--color-accent)" : "var(--color-input-border)"}`,
                    color: showTomorrow ? "#fff" : "var(--color-text-primary)",
                  }}
                >
                  Tomorrow
                </button>
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                PU Account
              </label>
              <MultiSelect
                label="Accounts"
                options={availableAccounts}
                selected={selectedAccounts}
                onChange={onAccountsChange}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Pickup
              </label>
              <MultiSelect
                label="Pickups"
                options={availablePickups}
                selected={selectedPickups}
                onChange={onPickupsChange}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Operator
              </label>
              <MultiSelect
                label="Operators"
                options={availableOperators}
                selected={selectedOperators}
                onChange={onOperatorsChange}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Drop Off
              </label>
              <MultiSelect
                label="Drop Offs"
                options={availableDropoffs}
                selected={selectedDropoffs}
                onChange={onDropoffsChange}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                &nbsp;
              </label>
              <button
                onClick={onUrgentToggle}
                className="rounded-full px-3 py-1 text-sm transition-colors"
                style={{
                  background: showUrgentOnly ? "#dc2626" : "var(--color-input-bg)",
                  border: `1px solid ${showUrgentOnly ? "#dc2626" : "var(--color-input-border)"}`,
                  color: showUrgentOnly ? "#fff" : "var(--color-text-primary)",
                }}
              >
                Urgent
              </button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-input-border)" }}>
              <button
                onClick={() => onModuleChange("loads")}
                className="px-3 py-1 text-sm transition-colors"
                style={{
                  background: activeModule === "loads" ? "var(--color-accent)" : "var(--color-input-bg)",
                  color: activeModule === "loads" ? "#fff" : "var(--color-text-secondary)",
                }}
              >
                Loads
              </button>
              <button
                onClick={() => onModuleChange("dispatch")}
                className="px-3 py-1 text-sm transition-colors"
                style={{
                  background: activeModule === "dispatch" ? "var(--color-accent)" : "var(--color-input-bg)",
                  color: activeModule === "dispatch" ? "#fff" : "var(--color-text-secondary)",
                  borderLeft: "1px solid var(--color-input-border)",
                }}
              >
                Dispatch
              </button>
            </div>

            <button
              onClick={onDetailPaneToggle}
              className="h-[30px] w-[30px] text-sm rounded-lg transition-colors flex items-center justify-center"
              style={{
                background: showDetailPane ? "var(--color-accent)" : "var(--color-input-bg)",
                border: `1px solid ${showDetailPane ? "var(--color-accent)" : "var(--color-input-border)"}`,
                color: showDetailPane ? "#fff" : "var(--color-text-secondary)",
              }}
              title={showDetailPane ? "Hide detail pane" : "Show detail pane"}
            >
              {showDetailPane ? "▣" : "◫"}
            </button>

            <button
              onClick={onRefreshCache}
              disabled={cacheRefreshing}
              className="px-3 py-1 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--color-input-bg)",
                border: "1px solid var(--color-input-border)",
                color: "var(--color-text-secondary)",
              }}
              title="Clear cached pickup/dropoff data and re-fetch from Welltrax"
            >
              {cacheRefreshing ? "Syncing..." : "Sync Entities"}
            </button>

            <button
              onClick={handleRefresh}
              disabled={cooldown > 0}
              className="h-[30px] w-[30px] text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              style={{
                background: "var(--color-accent)",
                border: "1px solid var(--color-accent)",
                color: "#fff",
              }}
              title={cooldown > 0 ? `Refresh disabled for ${cooldown}s` : "Refresh"}
            >
              ↻
            </button>

            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
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
                  className="absolute right-0 top-full z-40 mt-2 min-w-[160px] rounded-xl p-2 shadow-lg"
                  style={{
                    background: "var(--color-surface-strong)",
                    border: "1px solid var(--color-border)",
                  }}
                >
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
                  {userName && (
                    <div
                      className="px-2 py-1.5 text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {userName}
                    </div>
                  )}
                  {onSignOut && (
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
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => onRemoveFilter(chip.group, chip.group === "urgent" ? undefined : chip.label)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                style={{
                  background: "var(--color-surface-strong)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                <span>{chip.label}</span>
                <span style={{ color: "var(--color-text-muted)" }}>×</span>
              </button>
            ))}

            {hasActiveFilters && (
              <button
                onClick={onClearAllFilters}
                className="rounded-full px-3 py-1 text-xs transition-colors hover:opacity-80"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-input-border)",
                  color: "var(--color-text-muted)",
                }}
                >
                  Clear Filters
                </button>
            )}
        </div>
      </div>
    </div>
  );
}
