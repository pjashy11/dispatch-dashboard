"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface EntitySearchProps {
  label: string;
  target: string;
  searchField: string;
  displayField?: string;
  value: string;
  onSelect: (entity: any) => void;
  onClear: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function EntitySearch({
  label,
  target,
  searchField,
  displayField = "name",
  value,
  onSelect,
  onClear,
  disabled = false,
  placeholder = "Search...",
}: EntitySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (term: string) => {
      if (!term || term.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/setupinfo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "search",
            target,
            searchCriteria: { [searchField]: term },
          }),
        });
        const data = await res.json();

        let items = data.results || [];
        // For PICK_UP target, results are nested under accounts
        if (target === "PICK_UP") {
          const pickups: any[] = [];
          for (const account of items) {
            const puList = account.pickUpList || [];
            for (const pu of puList) {
              pickups.push({
                ...pu,
                _accountName: account.fullName || account.name,
                _accountId: account.id,
                _accountHostId: account.hostId,
              });
            }
          }
          items = pickups;
        }
        if (target === "DROP_OFF") {
          const dropoffs: any[] = [];
          for (const account of items) {
            const doList = account.dropOffList || [];
            for (const d of doList) {
              dropoffs.push({
                ...d,
                _accountName: account.fullName || account.name,
                _accountId: account.id,
                _accountHostId: account.hostId,
              });
            }
          }
          items = dropoffs;
        }

        setResults(items);
        setOpen(true);
      } catch (err) {
        console.error("Entity search failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [target, searchField]
  );

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getDisplayName = (item: any) => {
    return (
      item[displayField] ||
      item.fullName ||
      item.name ||
      item.number ||
      "Unknown"
    );
  };

  if (value) {
    return (
      <div>
        <label className="block text-xs text-slate-400 mb-1">{label}</label>
        <div className="flex items-center gap-2 bg-slate-700 border border-slate-600 rounded px-3 py-1.5">
          <span className="text-sm text-slate-100 flex-1 truncate">
            {value}
          </span>
          {!disabled && (
            <button
              onClick={onClear}
              className="text-slate-400 hover:text-red-400 text-xs"
            >
              &times;
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      />
      {loading && (
        <div className="absolute right-3 top-7">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto bg-slate-700 border border-slate-600 rounded shadow-lg">
          {results.map((item, i) => (
            <div
              key={item.id || item.hostId || i}
              onClick={() => {
                onSelect(item);
                setQuery("");
                setOpen(false);
                setResults([]);
              }}
              className="px-3 py-2 text-sm hover:bg-slate-600 cursor-pointer border-b border-slate-600/50 last:border-0"
            >
              <div className="text-slate-100">{getDisplayName(item)}</div>
              {item._accountName && (
                <div className="text-xs text-slate-400">
                  Account: {item._accountName}
                </div>
              )}
              {item.number && (
                <div className="text-xs text-slate-400">#{item.number}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
