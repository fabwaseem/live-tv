"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CountrySummary } from "@/lib/iptv";

export const ALL_COUNTRIES = "ALL";

interface Row {
  code: string;
  name: string;
  flag: string;
  count: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function matches(row: Row, q: string): boolean {
  return (
    row.name.toLowerCase().includes(q) ||
    (row.code !== ALL_COUNTRIES && row.code.toLowerCase() === q)
  );
}

/**
 * Hand-built searchable country picker (replaces the native <select>):
 * a pill trigger, a panel with an autofocused search field, the full
 * 180+ row list with counts, full keyboard support (arrows / enter /
 * escape, type-to-search), and "All countries" pinned at the top.
 */
export default function CountrySelect({
  countries,
  allCount,
  value,
  onChange,
  triggerClassName = "w-52 sm:w-60",
}: {
  countries: CountrySummary[];
  allCount: number;
  value: string;
  onChange: (code: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const listboxId = `${baseId}-listbox`;
  const rowId = (code: string) => `${baseId}-row-${code}`;

  const allRow: Row = useMemo(
    () => ({ code: ALL_COUNTRIES, name: "All countries", flag: "🌐", count: allCount }),
    [allCount],
  );

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      allRow,
      ...countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag, count: c.count })),
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((r) => matches(r, q)) : all;
  }, [allRow, countries, query]);

  const selected: Row =
    value === ALL_COUNTRIES
      ? allRow
      : (rows.find((r) => r.code === value) ??
        countries
          .filter((c) => c.code === value)
          .map((c) => ({ code: c.code, name: c.name, flag: c.flag, count: c.count }))[0] ??
        allRow);

  const close = (refocus = false) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  const openPanel = () => {
    const idx = rows.findIndex((r) => r.code === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  const select = (code: string) => {
    onChange(code);
    close(true);
  };

  /* Autofocus the search field when the panel opens. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  /* Close on outside pointerdown. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /* Keep the keyboard-active row visible. */
  useEffect(() => {
    if (!open) return;
    const row = rows[activeIndex];
    if (row) {
      document
        .getElementById(rowId(row.code))
        ?.scrollIntoView({ block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) select(row.code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close();
    }
  };

  const activeRow = rows[activeIndex];

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openPanel();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={`Country: ${selected.name}`}
        className={`flex items-center gap-2 rounded-full border border-line bg-surface-2 py-2.5 pl-4 pr-3 text-sm text-white shadow-card transition hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70 ${triggerClassName}`}
      >
        <span aria-hidden className="shrink-0 text-base leading-none">
          {selected.flag}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{selected.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-neutral-400">{fmt(selected.count)}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line-strong bg-surface-1 shadow-pop">
          <div className="border-b border-line p-2">
            <div className="group relative">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 transition group-focus-within:text-red-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.8-3.8" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={activeRow ? rowId(activeRow.code) : undefined}
                aria-label="Search countries"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder="Search countries…"
                className="w-full rounded-xl border border-line bg-inset py-2.5 pl-9 pr-3 text-sm text-white shadow-inner placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
              />
            </div>
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-label="Countries"
            className="max-h-[46vh] overflow-y-auto overscroll-contain p-1.5"
          >
            {rows.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-neutral-500">
                No countries match “{query.trim()}”
              </li>
            )}
            {rows.map((row, i) => {
              const isSelected = row.code === value;
              const isActive = i === activeIndex;
              return (
                <li
                  key={row.code}
                  id={rowId(row.code)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(row.code)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                    isActive ? "bg-accent-soft text-white" : "text-neutral-300"
                  } ${isSelected ? "font-semibold text-white" : ""}`}
                >
                  <span aria-hidden className="w-6 shrink-0 text-center text-base leading-none">
                    {row.flag}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  {isSelected && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-red-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      aria-hidden
                    >
                      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                    {fmt(row.count)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
