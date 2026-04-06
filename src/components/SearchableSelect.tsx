"use client";

import { useState, useRef, useEffect, useMemo, useId } from "react";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
  style = {},
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

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

  const filtered = useMemo(() => {
    if (search.length < 2) return options;
    const term = search.toUpperCase();
    return options.filter((o) => o.label.toUpperCase().includes(term));
  }, [options, search]);

  const selectedLabel = options.find((o) => o.value === value)?.label || value;

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  if (disabled) {
    return (
      <div
        className={`${className} opacity-50 cursor-not-allowed`}
        style={style}
      >
        <span className="truncate">{value ? selectedLabel : placeholder}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={`${className} text-left flex items-center gap-2`}
        style={style}
      >
        <span className="truncate flex-1">
          {value ? selectedLabel : placeholder}
        </span>
        <span className="text-[10px] flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
          ▼
        </span>
      </button>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full min-w-[200px] max-h-64 overflow-auto rounded shadow-lg"
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
          {filtered.map((opt) => (
            <div
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              role="option"
              aria-selected={opt.value === value}
              className="px-3 py-1.5 text-sm cursor-pointer hover:opacity-80"
              style={{
                background: opt.value === value ? "var(--color-bg-tertiary)" : "transparent",
                color: "var(--color-text-primary)",
              }}
            >
              {opt.label}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {search.length >= 2 ? "No matches" : "No options"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
