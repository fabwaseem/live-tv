"use client";

import { useState } from "react";
import type { PlayableChannel } from "./PlayerModal";

export interface TileData extends PlayableChannel {
  key: string;
  country: string;
  primaryUrl: string;
}

const MONOGRAM_COLORS = [
  "#374151", "#44403c", "#1e40af", "#155e63", "#5b21b6",
  "#7f1d1d", "#065f46", "#713f12", "#831843", "#1e3a8a",
];

function monogramColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return MONOGRAM_COLORS[Math.abs(h) % MONOGRAM_COLORS.length];
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ChannelTile({
  tile,
  isFavorite,
  onPlay,
  onToggleFavorite,
}: {
  tile: TileData;
  isFavorite: boolean;
  onPlay: (tile: TileData) => void;
  onToggleFavorite: (tile: TileData) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = tile.logo && !logoFailed;

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => onPlay(tile)}
        aria-label={`Play ${tile.name}`}
        className="group block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
      >
        <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-neutral-50 to-neutral-300 p-4 shadow-card transition duration-300 group-hover:border-line-strong group-hover:shadow-lift motion-safe:group-hover:-translate-y-1">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logos come from arbitrary third-party hosts; next/image cannot handle them all
            <img
              src={tile.logo ?? undefined}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="max-h-full max-w-full object-contain drop-shadow-sm"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-white/15 to-black/25 text-3xl font-bold tracking-wide text-white/90"
              style={{ backgroundColor: monogramColor(tile.name) }}
            >
              {initials(tile.name)}
            </span>
          )}
        </span>
        <span className="mt-2.5 block truncate text-[15px] font-semibold tracking-tight text-neutral-50">
          {tile.name}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="truncate">{tile.countryName}</span>
          {tile.streams.length > 1 && (
            <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-px text-[10px] font-medium tabular-nums text-neutral-400">
              {tile.streams.length} streams
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onToggleFavorite(tile)}
        aria-pressed={isFavorite}
        aria-label={
          isFavorite ? `Remove ${tile.name} from favorites` : `Add ${tile.name} to favorites`
        }
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70 motion-safe:hover:scale-110 pointer-coarse:h-11 pointer-coarse:w-11 ${
          isFavorite
            ? "border-amber-300/40 bg-amber-400/20"
            : "border-white/10 bg-black/55 hover:bg-black/75"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${isFavorite ? "text-amber-400" : "text-neutral-200"}`}
          fill={isFavorite ? "currentColor" : "none"}
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
    </div>
  );
}
