"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ChannelStream, WorldPayload } from "@/lib/iptv";
import ChannelTile, { type TileData } from "./ChannelTile";
import CountrySelect, { ALL_COUNTRIES } from "./CountrySelect";
import PlayerModal, { type PlayableChannel } from "./PlayerModal";

const PAGE_SIZE = 120;
const FAV_KEY = "live-tv:favorites:v1";
const ALL = ALL_COUNTRIES;

interface FavoriteSnapshot extends PlayableChannel {
  url: string; // primary stream URL — the favorite key
  country: string;
}

type ViewKind = "browse" | "favorites";

const fmt = (n: number) => n.toLocaleString("en-US");

function groupStreams(streams: ChannelStream[]): TileData[] {
  const map = new Map<string, TileData>();
  for (const s of streams) {
    const existing = map.get(s.channelId);
    if (existing) {
      existing.streams.push(s.url);
      for (const c of s.categories) {
        if (!existing.categories.includes(c)) existing.categories.push(c);
      }
    } else {
      map.set(s.channelId, {
        key: s.channelId,
        name: s.name,
        logo: s.logo,
        country: s.country,
        countryName: s.countryName,
        categories: [...s.categories],
        streams: [s.url],
        primaryUrl: s.url,
      });
    }
  }
  return [...map.values()];
}

/* ---------------- Favorites as an external store (localStorage) ----------------
   useSyncExternalStore is React's sanctioned way to subscribe to external
   state — no setState-in-effect syncing needed. */

const EMPTY_FAVORITES: FavoriteSnapshot[] = [];
let favoritesCache: FavoriteSnapshot[] | null = null;
const favoritesListeners = new Set<() => void>();

function readStoredFavorites(): FavoriteSnapshot[] {
  if (favoritesCache) return favoritesCache;
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const parsed = raw ? (JSON.parse(raw) as FavoriteSnapshot[]) : [];
    favoritesCache = Array.isArray(parsed)
      ? parsed.filter((f) => f && typeof f.url === "string")
      : [];
  } catch {
    favoritesCache = [];
  }
  return favoritesCache;
}

function subscribeFavorites(onStoreChange: () => void): () => void {
  favoritesListeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAV_KEY) {
      favoritesCache = null;
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    favoritesListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeFavorites(next: FavoriteSnapshot[]) {
  favoritesCache = next;
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {
    /* storage full/blocked — favorites just won't persist */
  }
  favoritesListeners.forEach((cb) => cb());
}

export default function LiveTvApp() {
  const [payload, setPayload] = useState<WorldPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [country, setCountry] = useState<string>(ALL);
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewKind>("browse");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [playing, setPlaying] = useState<PlayableChannel | null>(null);
  /* Mobile (<lg) off-canvas drawer holding the sidebar body. Desktop never
     opens it — the rail is always visible there. */
  const [drawerOpen, setDrawerOpen] = useState(false);

  const favorites = useSyncExternalStore(
    subscribeFavorites,
    readStoredFavorites,
    () => EMPTY_FAVORITES,
  );

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ data loading ------------------------------ */
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/channels", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setPayload((await res.json()) as WorldPayload);
        setVisibleCount(PAGE_SIZE);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setLoadError(
            "Could not load the channel catalogue. Check your connection and try again.",
          );
        }
      });
    return () => controller.abort();
  }, [reloadTick]);

  /* ------------------------------ favorites ------------------------------ */
  const favUrls = useMemo(() => new Set(favorites.map((f) => f.url)), [favorites]);

  const toggleFavorite = useCallback(
    (tile: TileData) => {
      if (favUrls.has(tile.primaryUrl)) {
        writeFavorites(favorites.filter((f) => f.url !== tile.primaryUrl));
      } else {
        writeFavorites([
          ...favorites,
          {
            url: tile.primaryUrl,
            country: tile.country,
            name: tile.name,
            logo: tile.logo,
            countryName: tile.countryName,
            categories: tile.categories,
            streams: tile.streams,
          },
        ]);
      }
    },
    [favorites, favUrls],
  );

  /* ------------------------------ filter actions ------------------------------ */
  const resetPaging = () => setVisibleCount(PAGE_SIZE);
  /* Every navigation pick also closes the mobile drawer, so the grid is one
     tap away after choosing. On desktop the drawer is never open — no-op. */
  const showFavorites = () => {
    setView("favorites");
    resetPaging();
    setDrawerOpen(false);
  };
  const showAll = () => {
    setView("browse");
    setCategory("All");
    resetPaging();
    setDrawerOpen(false);
  };
  const showCategory = (name: string) => {
    setView("browse");
    setCategory(name);
    resetPaging();
    setDrawerOpen(false);
  };
  const clearFilters = () => {
    setQuery("");
    setCategory("All");
    setCountry(ALL);
    setView("browse");
    resetPaging();
  };
  const pickCountry = (code: string) => {
    setCountry(code);
    setCategory("All");
    setView("browse");
    resetPaging();
    setDrawerOpen(false);
  };

  /* ------------------------------ filtering ------------------------------ */
  const q = query.trim().toLowerCase();

  const streamsForCountry = useMemo(() => {
    if (!payload) return [];
    return country === ALL
      ? payload.streams
      : payload.streams.filter((s) => s.country === country);
  }, [payload, country]);

  const railCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of streamsForCountry) {
      for (const c of s.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [streamsForCountry]);

  const filteredStreams = useMemo(() => {
    if (!payload) return [];
    // Search runs across the whole world dataset, ignoring country/category picks.
    if (q) return payload.streams.filter((s) => s.name.toLowerCase().includes(q));
    return streamsForCountry.filter(
      (s) => category === "All" || s.categories.includes(category),
    );
  }, [payload, q, streamsForCountry, category]);

  const browseTiles = useMemo(() => groupStreams(filteredStreams), [filteredStreams]);

  const favoriteTiles = useMemo<TileData[]>(
    () =>
      favorites
        .filter((f) => !q || f.name.toLowerCase().includes(q))
        .map((f) => ({
          key: f.url,
          name: f.name,
          logo: f.logo,
          country: f.country,
          countryName: f.countryName,
          categories: f.categories,
          streams: f.streams,
          primaryUrl: f.url,
        })),
    [favorites, q],
  );

  const displayTiles = view === "favorites" ? favoriteTiles : browseTiles;
  const visibleTiles = displayTiles.slice(0, visibleCount);

  /* Progressive reveal inside the channel pane: grow the rendered window as
     the sentinel approaches — observed against the pane, not the window. */
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const total = displayTiles.length;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => (c < total ? Math.min(c + PAGE_SIZE, total) : c));
        }
      },
      { root, rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayTiles.length]);

  /* A new filter context starts at the top of the grid. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [country, category, view, q]);

  /* ------------------------------ helpers ------------------------------ */
  const selectedCountryName =
    country === ALL
      ? "All countries"
      : (payload?.countries.find((c) => c.code === country)?.name ?? country);

  const heading =
    view === "favorites"
      ? "Favorites"
      : q
        ? `Results for “${query.trim()}”`
        : [country !== ALL ? selectedCountryName : null, category !== "All" ? category : null]
            .filter(Boolean)
            .join(" · ") || "All Channels";

  const contextLine =
    view === "favorites"
      ? `${fmt(displayTiles.length)} pinned`
      : q
        ? `${fmt(displayTiles.length)} channels worldwide`
        : `${fmt(displayTiles.length)} channels`;

  const railItemClass = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70 ${
      active
        ? "bg-accent font-semibold text-white shadow-card"
        : "text-neutral-400 hover:bg-surface-2 hover:text-white"
    }`;

  const railCountClass = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
      active ? "bg-white/20 text-white" : "bg-white/5 text-neutral-500"
    }`;

  /* ------------------------------ mobile drawer ------------------------------ */
  /* Esc closes the drawer (backdrop tap and the × button are the other two). */
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  /* Non-default filter/search state — drives the badge on the Filters button. */
  const activeFilterCount =
    (country !== ALL ? 1 : 0) +
    (category !== "All" ? 1 : 0) +
    (q ? 1 : 0) +
    (view === "favorites" ? 1 : 0);

  /* The sidebar body — brand, search, country picker and the category rail.
     ONE implementation rendered in two shells: the always-visible desktop
     rail (lg+) and the mobile off-canvas drawer (<lg). All filter state and
     handlers live in LiveTvApp, so both instances drive the same filters —
     no forked copies, no duplicated logic. The only differences are the
     rail's responsive visibility class and the drawer's close button. */
  const sidebarBody = (inDrawer: boolean) => (
    <>
      <div className="space-y-3 p-4 pb-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-red-500 to-red-700 shadow-card ring-1 ring-white/20 ring-inset"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 text-white" fill="currentColor">
              <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z" />
            </svg>
          </span>
          {/* Exactly one <h1> per page: the desktop rail owns it; the drawer
              copy renders the same text as a <p> so the DOM never carries
              two h1s when both shells are mounted. */}
          {inDrawer ? (
            <p className="text-xl font-bold leading-tight tracking-tight">Live TV</p>
          ) : (
            <h1 className="text-xl font-bold leading-tight tracking-tight">Live TV</h1>
          )}
          {inDrawer && (
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close filters"
              className="ml-auto flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2 text-neutral-300 transition hover:bg-surface-3 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="group relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-neutral-500 transition group-focus-within:text-red-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPaging();
            }}
            placeholder="Search channels in every country…"
            aria-label="Search channels"
            className="w-full rounded-full border border-line bg-inset py-2.5 pl-11 pr-4 text-sm text-white shadow-inner placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
          />
        </div>

        {/* Country picker */}
        <CountrySelect
          countries={payload?.countries ?? []}
          allCount={payload?.totals.streams ?? 0}
          value={country}
          onChange={pickCountry}
          triggerClassName="w-full"
        />
      </div>

      {/* Category nav (scrolls inside the rail / drawer) */}
      <nav
        className={
          inDrawer
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4"
            : "hidden min-h-0 flex-1 overflow-y-auto px-3 pb-4 lg:block"
        }
        aria-label="Categories"
      >
        <button
          type="button"
          onClick={showFavorites}
          className={railItemClass(view === "favorites")}
        >
          <span>★ Favorites</span>
          <span className={railCountClass(view === "favorites")}>{favorites.length}</span>
        </button>
        <div className="my-3 border-t border-line" />
        <button
          type="button"
          onClick={showAll}
          className={railItemClass(view === "browse" && category === "All")}
        >
          <span>All</span>
          <span className={railCountClass(view === "browse" && category === "All")}>
            {fmt(streamsForCountry.length)}
          </span>
        </button>
        {railCategories.map(({ name, count }) => (
          <button
            key={name}
            type="button"
            onClick={() => showCategory(name)}
            className={railItemClass(view === "browse" && category === name)}
          >
            <span className="truncate">{name}</span>
            <span className={railCountClass(view === "browse" && category === name)}>
              {fmt(count)}
            </span>
          </button>
        ))}
      </nav>
    </>
  );

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-neutral-50 lg:flex-row">
      {/* ------------------------------ LEFT SIDEBAR (desktop rail) ------------------------------ */}
      <aside className="z-30 hidden shrink-0 flex-col border-b border-line bg-surface-1/60 lg:flex lg:h-full lg:w-80 lg:border-b-0 lg:border-r">
        {sidebarBody(false)}
      </aside>

      {/* ------------------------------ Mobile filter drawer (<lg) ------------------------------
          The same sidebar body as an off-canvas panel: closed by default,
          slides in from the left over a backdrop. The wrapper is lg:hidden, so
          at desktop widths the rail above is the only sidebar. inert keeps
          the closed panel out of the tab order and off the accessibility
          tree while it sits off-screen. */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${
          drawerOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-[min(85vw,20rem)] flex-col border-r border-line bg-surface-1 shadow-pop transition-transform duration-300 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          aria-label="Channel filters"
          inert={!drawerOpen}
        >
          {sidebarBody(true)}
        </aside>
      </div>

      {/* ------------------------------ RIGHT: channel area ------------------------------ */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Slim mobile top bar — the ONLY chrome above the grid under lg
            (56px + safe-area). Brand mark + current view on the left;
            favorites shortcut and the Filters button (opens the drawer)
            on the right. Desktop renders the rail instead: lg:hidden. */}
        <div
          className="shrink-0 border-b border-line bg-surface-1/60 lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex h-14 items-center gap-1.5 px-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-red-500 to-red-700 shadow-card ring-1 ring-white/20 ring-inset"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 text-white" fill="currentColor">
                <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
              {heading}
            </span>
            <button
              type="button"
              onClick={showFavorites}
              aria-pressed={view === "favorites"}
              aria-label="Show favorites"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70 ${
                view === "favorites"
                  ? "border-amber-300/40 bg-amber-400/20"
                  : "border-line bg-surface-2 hover:bg-surface-3"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 ${view === "favorites" ? "text-amber-400" : "text-neutral-300"}`}
                fill={view === "favorites" ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path
                  strokeLinejoin="round"
                  d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              className="relative flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-card transition hover:bg-accent-bright focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M4 8h9M17 8h3M4 16h3M11 16h9" strokeLinecap="round" />
                <circle cx="15" cy="8" r="2" />
                <circle cx="9" cy="16" r="2" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-accent shadow-card">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Scrollable grid pane — the page heading lives at the top of the
            scrolling content and scrolls away with the grid (no sticky bar). */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {/* Page heading */}
          <div className="mb-5">
            <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {payload || loadError ? contextLine : "Loading…"}
            </p>
          </div>

          {/* States */}
          {!payload && !loadError && (
            <div aria-label="Loading channels">
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[4/3] rounded-2xl border border-line bg-surface-1" />
                    <div className="mt-2 h-3.5 w-3/4 rounded bg-surface-2" />
                    <div className="mt-1.5 h-3 w-1/2 rounded bg-surface-2" />
                  </div>
                ))}
              </div>
              <p className="mt-6 text-center text-sm text-neutral-500">
                Gathering every public channel we can find — this can take a few seconds.
              </p>
            </div>
          )}

          {loadError && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 shadow-card" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 20h.01" strokeLinecap="round" />
                  <path d="M8.5 16.4a5 5 0 0 1 7 0" strokeLinecap="round" />
                  <path d="M5.6 13.4a10 10 0 0 1 12.8 0" strokeLinecap="round" />
                  <path d="M2.7 10.3a15 15 0 0 1 18.6 0" strokeLinecap="round" />
                </svg>
              </span>
              <p className="font-medium text-white">{loadError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  setPayload(null);
                  setReloadTick((t) => t + 1);
                }}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-accent-bright focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
              >
                Try again
              </button>
            </div>
          )}

          {payload && displayTiles.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 shadow-card" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.8-3.8" strokeLinecap="round" />
                </svg>
              </span>
              {view === "favorites" && favorites.length === 0 ? (
                <>
                  <p className="font-medium text-white">No favorites yet</p>
                  <p className="max-w-sm text-sm text-neutral-400">
                    Tap the star on any channel tile and it will be pinned here for quick access.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-white">No channels match</p>
                  <p className="max-w-sm text-sm text-neutral-400">
                    Nothing found with the current country, category and search filters.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-full border border-line bg-surface-2 px-5 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          )}

          {/* Grid */}
          {payload && displayTiles.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {visibleTiles.map((tile) => (
                  <ChannelTile
                    key={`${view}-${tile.key}-${tile.primaryUrl}`}
                    tile={tile}
                    isFavorite={favUrls.has(tile.primaryUrl)}
                    onPlay={(t) => setPlaying(t)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
              <div ref={sentinelRef} className="h-2" />
              {visibleCount < displayTiles.length && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((c) => Math.min(c + PAGE_SIZE, displayTiles.length))
                    }
                    className="rounded-full border border-line bg-surface-2 px-6 py-3 text-sm font-medium text-white shadow-card transition hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
                  >
                    Show more · {fmt(visibleCount)} of {fmt(displayTiles.length)} channels
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {playing && <PlayerModal channel={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
