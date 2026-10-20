"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export interface PlayableChannel {
  name: string;
  logo: string | null;
  countryName: string;
  categories: string[];
  streams: string[];
}

type PlayStatus = "loading" | "playing" | "error";

const LOAD_TIMEOUT_MS = 25_000;
const CONTROLS_HIDE_MS = 2_500;

const isHttp = (url: string) => url.startsWith("http://");
const proxyUrl = (url: string) => `/api/stream?u=${encodeURIComponent(url)}`;
/** http streams can never load directly from an https page — they start proxied. */
const startsProxied = (url: string) => isHttp(url);

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70";
const BAR_BUTTON =
  `flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 pointer-coarse:h-11 pointer-coarse:w-11 ${FOCUS_RING}`;

export default function PlayerModal({
  channel,
  onClose,
}: {
  channel: PlayableChannel;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [streamIndex, setStreamIndex] = useState(0);
  const [viaProxy, setViaProxy] = useState(() => startsProxied(channel.streams[0] ?? ""));
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<PlayStatus>("loading");
  const [note, setNote] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  /* Custom-control state. */
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const liveStateRef = useRef({ status, paused });
  /* Last pointer kind seen on the player — a touch tap on the video toggles
     the chrome, while a mouse click keeps toggling play/pause (desktop). */
  const lastPointerTypeRef = useRef<string>("mouse");
  /* iOS Safari owns volume in hardware: video.volume writes are silently
     ignored there. Probed once on mount; the slider hides where unsupported. */
  const [volumeSupported, setVolumeSupported] = useState(true);

  /* Progress (seekable window + buffered), read off the <video> element. */
  const [progress, setProgress] = useState({ played: 0, buffered: 0, seekable: false });
  const progressRef = useRef(progress);
  const seekWindowRef = useRef<{ start: number; end: number } | null>(null);
  const seekDragRef = useRef(false);

  const readProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    let start = NaN;
    let end = NaN;
    let seekable = false;
    try {
      if (v.seekable && v.seekable.length > 0) {
        start = v.seekable.start(0);
        end = v.seekable.end(v.seekable.length - 1);
        seekable = Number.isFinite(end) && end > start;
      }
    } catch {
      /* the MSE timeline can throw mid-teardown — treat as unseekable */
    }
    let bufStart = NaN;
    let bufEnd = NaN;
    try {
      if (v.buffered && v.buffered.length > 0) {
        bufStart = v.buffered.start(0);
        bufEnd = v.buffered.end(v.buffered.length - 1);
      }
    } catch {
      /* same teardown caveat */
    }
    if (!seekable) {
      // No DVR window: the bar becomes a live/buffer indicator whose window
      // is the buffered extent — it still shows progress, but never seeks.
      seekWindowRef.current = null;
      if (Number.isFinite(bufEnd) && bufEnd > bufStart) {
        start = bufStart;
        end = bufEnd;
      } else {
        start = NaN;
        end = NaN;
      }
    } else {
      seekWindowRef.current = { start, end };
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      if (progressRef.current.played !== 0 || progressRef.current.seekable) {
        const zero = { played: 0, buffered: 0, seekable: false };
        progressRef.current = zero;
        setProgress(zero);
      }
      return;
    }
    const span = end - start;
    const played = Math.min(1, Math.max(0, (v.currentTime - start) / span));
    const buffered = Number.isFinite(bufEnd)
      ? Math.min(1, Math.max(0, (bufEnd - start) / span))
      : played;
    const prev = progressRef.current;
    if (
      Math.abs(prev.played - played) > 0.0005 ||
      Math.abs(prev.buffered - buffered) > 0.0005 ||
      prev.seekable !== seekable
    ) {
      const next = { played, buffered, seekable };
      progressRef.current = next;
      setProgress(next);
    }
  }, []);

  /* Keep the progress bar fresh: media events plus a light 1s tick. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const events = ["timeupdate", "progress", "loadedmetadata", "durationchange", "seeked"] as const;
    for (const name of events) v.addEventListener(name, readProgress);
    const tick = window.setInterval(readProgress, 1000);
    return () => {
      for (const name of events) v.removeEventListener(name, readProgress);
      window.clearInterval(tick);
    };
  }, [readProgress]);

  /** Seek from a pointer position on the progress track (DVR window only). */
  const seekFromPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const win = seekWindowRef.current;
      const v = videoRef.current;
      if (!win || !v) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      v.currentTime = win.start + frac * (win.end - win.start);
      readProgress();
    },
    [readProgress],
  );

  const rawUrl = channel.streams[streamIndex] ?? channel.streams[0];
  const playUrl = viaProxy ? proxyUrl(rawUrl) : rawUrl;

  /* ------------------------------ transport controls ------------------------------ */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const applyVolume = useCallback((value: number) => {
    const v = videoRef.current;
    setVolume(value);
    if (v) {
      v.volume = value;
      if (value > 0 && v.muted) {
        v.muted = false;
        setMuted(false);
      }
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    type WebkitVideo = HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
    };
    const vid = videoRef.current as WebkitVideo | null;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    // iPhone Safari has no element fullscreen — the <video> itself went
    // fullscreen via webkitEnterFullscreen, and only it can exit again.
    if (isFullscreen && vid?.webkitExitFullscreen) {
      vid.webkitExitFullscreen();
      return;
    }
    const root = rootRef.current;
    if (root?.requestFullscreen) {
      root.requestFullscreen().catch(() => {});
      return;
    }
    // iPhone Safari fallback: native video fullscreen, never an error.
    vid?.webkitEnterFullscreen?.();
  }, [isFullscreen]);

  /* ------------------------------ controls auto-hide ------------------------------ */
  useEffect(() => {
    liveStateRef.current = { status, paused };
  });

  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const s = liveStateRef.current;
      if (s.status === "playing" && !s.paused) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  /* Pointer left the player: hide the chrome (and cursor) immediately —
     unless the user is paused, in which case the controls stay put. */
  const hideChromeNow = useCallback(() => {
    const s = liveStateRef.current;
    if (s.status !== "playing" || s.paused) return;
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    setControlsVisible(false);
  }, []);

  /* Touch tap on the video surface toggles the chrome (mobile convention):
     hide it while playing, bring it back (with the auto-hide countdown)
     when hidden. Paused playback never hides — hideChromeNow and the poke
     timer both respect that. stopPropagation keeps the root's pointerdown
     poke from instantly undoing a hide within the same tap. Mouse clicks
     never reach this handler — they keep toggling play/pause. */
  const handleVideoTouchTap = useCallback(
    (e: React.PointerEvent<HTMLVideoElement>) => {
      lastPointerTypeRef.current = e.pointerType;
      e.stopPropagation();
      const s = liveStateRef.current;
      if (controlsVisible && s.status === "playing" && !s.paused) {
        hideChromeNow();
      } else {
        pokeControls();
      }
    },
    [controlsVisible, hideChromeNow, pokeControls],
  );

  /* ------------------------------ fullscreen tracking ------------------------------ */
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onFsChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    // iPhone Safari reports video fullscreen through events on the <video>.
    const v = videoRef.current as EventTarget | null;
    const onBegin = () => setIsFullscreen(true);
    const onEnd = () => setIsFullscreen(false);
    v?.addEventListener("webkitbeginfullscreen", onBegin);
    v?.addEventListener("webkitendfullscreen", onEnd);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      v?.removeEventListener("webkitbeginfullscreen", onBegin);
      v?.removeEventListener("webkitendfullscreen", onEnd);
    };
  }, []);

  /* ------------------------------ volume capability probe ------------------------------
     Try one write on mount: where programmatic volume is unsupported (iOS)
     the value silently refuses to move, and the slider stays hidden — the
     mute toggle and the hardware buttons carry volume there instead. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const prev = v.volume;
      const target = prev > 0.5 ? 0.25 : 0.75;
      v.volume = target;
      const stuck = v.volume !== target;
      v.volume = prev;
      setVolumeSupported(!stuck);
    } catch {
      setVolumeSupported(true);
    }
  }, []);

  /* ------------------------------ keyboard ------------------------------ */
  useEffect(() => {
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      pokeControls(); // any keypress brings the chrome back
      if (e.key === "Escape") {
        // In fullscreen the browser exits fullscreen first; don't also close.
        if (!document.fullscreenElement) onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onClose();
      } else if (e.key === " ") {
        if (tag === "BUTTON") return; // let the focused button handle it natively
        e.preventDefault();
        togglePlay();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, togglePlay, toggleFullscreen, toggleMute, pokeControls]);

  /* ------------------------------ stream attach + fallback chain ------------------------------ */
  /** Manual stream pick — resets the fallback chain for that stream. */
  const selectStream = useCallback(
    (index: number) => {
      const target = channel.streams[index];
      if (!target) return;
      setStreamIndex(index);
      setViaProxy(startsProxied(target));
      setAttempt((a) => a + 1); // re-attach even when re-picking the same stream
      setNote(null);
      setStatus("loading");
    },
    [channel.streams],
  );

  /* Attach the stream, with the fallback chain:
     direct (https only) → via server proxy → next stream → error panel. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !rawUrl) return;
    setStatus("loading");
    setSlow(false);
    setProgress({ played: 0, buffered: 0, seekable: false });
    progressRef.current = { played: 0, buffered: 0, seekable: false };
    seekWindowRef.current = null;
    let hls: Hls | null = null;
    let destroyed = false;
    let failed = false; // one failover per attempt — hls + <video> can both report
    let canPlay = false;

    const failover = () => {
      if (destroyed || failed) return;
      failed = true;
      if (!viaProxy) {
        setNote("Direct link blocked — trying via server…");
        setViaProxy(true);
        return;
      }
      if (streamIndex < channel.streams.length - 1) {
        const next = streamIndex + 1;
        setNote(`That stream didn't respond — trying stream ${next + 1}…`);
        setStreamIndex(next);
        setViaProxy(startsProxied(channel.streams[next]));
        return;
      }
      setStatus("error");
      setControlsVisible(true);
    };

    const slowTimer = window.setTimeout(() => {
      if (!destroyed) setSlow(true);
    }, 9000);
    const watchdog = window.setTimeout(() => {
      if (!destroyed && !canPlay) failover();
    }, LOAD_TIMEOUT_MS);
    const onCanPlay = () => {
      canPlay = true;
      if (!destroyed) {
        setStatus("playing");
        setNote(null);
      }
    };
    const onError = () => failover();
    const onPlayEvt = () => {
      if (!destroyed) {
        setPaused(false);
        pokeControls(); // (re)start the auto-hide countdown while playing
      }
    };
    const onPauseEvt = () => {
      if (!destroyed) {
        setPaused(true);
        setControlsVisible(true);
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      }
    };
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);
    video.addEventListener("play", onPlayEvt);
    video.addEventListener("pause", onPauseEvt);

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) failover();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playUrl; // Safari / iOS native HLS
    } else {
      video.src = playUrl; // last resort (e.g. a plain MP4 link)
    }
    video.play().catch(() => {
      /* Autoplay with sound can be blocked — the big play affordance takes over. */
    });

    return () => {
      destroyed = true;
      window.clearTimeout(slowTimer);
      window.clearTimeout(watchdog);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      video.removeEventListener("play", onPlayEvt);
      video.removeEventListener("pause", onPauseEvt);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [playUrl, rawUrl, viaProxy, streamIndex, channel.streams, attempt, pokeControls]);

  const hasAlternates = channel.streams.length > 1;
  const barVisibility = controlsVisible
    ? "opacity-100"
    : "pointer-events-none opacity-0";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing ${channel.name}`}
      className={`fixed inset-0 z-50 overflow-hidden bg-black ${
        !controlsVisible && status === "playing" && !paused ? "cursor-none" : ""
      }`}
      onPointerMove={pokeControls}
      onPointerDown={(e) => {
        lastPointerTypeRef.current = e.pointerType;
        pokeControls();
      }}
      onPointerLeave={hideChromeNow}
      onMouseLeave={hideChromeNow}
    >
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-contain ${status === "error" ? "invisible" : ""}`}
        playsInline
        onPointerDown={(e) => {
          if (e.pointerType === "touch") handleVideoTouchTap(e);
          else lastPointerTypeRef.current = e.pointerType;
        }}
        onClick={() => {
          /* Touch taps were already handled on pointerdown (chrome toggle);
             mouse/pen clicks keep the desktop play-pause toggle. */
          if (lastPointerTypeRef.current !== "touch") togglePlay();
        }}
      />

      {/* ------------------------------ top bar ------------------------------ */}
      <div
        className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300 sm:px-5 sm:pt-[max(1rem,env(safe-area-inset-top))] ${barVisibility}`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            ref={backRef}
            type="button"
            onClick={onClose}
            aria-label="Back to channels"
            className={`flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 py-2 pl-2.5 pr-3.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20 pointer-coarse:min-h-11 ${FOCUS_RING}`}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="m14.5 5.5-6 6.5 6 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          {channel.logo && !logoFailed ? (
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-neutral-50 to-neutral-300 p-1.5 min-[420px]:flex">
              {/* eslint-disable-next-line @next/next/no-img-element -- logos come from arbitrary third-party hosts */}
              <img
                src={channel.logo}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="max-h-full max-w-full object-contain"
              />
            </span>
          ) : (
            <span
              aria-hidden
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-xs font-bold tracking-wide text-white/85 min-[420px]:flex"
            >
              {initials(channel.name)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
              {channel.name}
            </h2>
            <p className="truncate text-xs text-neutral-300 sm:text-sm">
              {channel.countryName}
              {channel.categories.length > 0 && ` · ${channel.categories.join(", ")}`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className={BAR_BUTTON}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ------------------------------ center states ------------------------------ */}
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-neutral-300">
          <svg className="h-12 w-12 animate-spin text-red-500" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
            <path d="M22 12a10 10 0 0 0-10-10v3a7 7 0 0 1 7 7h3z" fill="currentColor" />
          </svg>
          <p className="px-4 text-center text-sm" role="status">
            {note ?? "Loading stream…"}
          </p>
          {slow && !note && (
            <p className="max-w-sm px-4 text-center text-xs text-neutral-500">
              Still loading — public streams can be slow to start.
            </p>
          )}
        </div>
      )}

      {status === "playing" && paused && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={`Play ${channel.name}`}
            className={`flex h-20 w-20 items-center justify-center rounded-full border border-white/25 bg-accent/90 text-white shadow-pop backdrop-blur transition hover:bg-accent-bright motion-safe:hover:scale-105 ${FOCUS_RING}`}
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9" fill="currentColor" aria-hidden>
              <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z" />
            </svg>
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 shadow-card" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 20h.01" strokeLinecap="round" />
              <path d="M8.5 16.4a5 5 0 0 1 7 0" strokeLinecap="round" />
              <path d="M5.6 13.4a10 10 0 0 1 12.8 0" strokeLinecap="round" />
              <path d="M2.7 10.3a15 15 0 0 1 18.6 0" strokeLinecap="round" />
            </svg>
          </span>
          <p className="font-medium text-white">Stream unavailable</p>
          <p className="max-w-md text-sm text-neutral-400">
            This channel isn’t playing right now.
          </p>
          <button
            type="button"
            onClick={() => selectStream(0)}
            className={`mt-1 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow-card transition hover:bg-accent-bright pointer-coarse:min-h-11 ${FOCUS_RING}`}
          >
            Try again
          </button>
        </div>
      )}

      {/* ------------------------------ bottom control bar ------------------------------ */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-12 transition-opacity duration-300 sm:px-5 ${barVisibility}`}
      >
        {/* Progress: position + buffered within the seekable (DVR) window.
            Click/drag seeks when the stream exposes a window; without one
            the bar is a live/buffer indicator and never fakes seeking. */}
        <div
          className={`group/bar relative mb-1.5 flex h-5 touch-none items-center pointer-coarse:h-7 ${
            progress.seekable ? "cursor-pointer" : "cursor-default"
          }`}
          role={progress.seekable ? "slider" : undefined}
          aria-label={progress.seekable ? "Seek" : undefined}
          aria-valuemin={progress.seekable ? 0 : undefined}
          aria-valuemax={progress.seekable ? 100 : undefined}
          aria-valuenow={progress.seekable ? Math.round(progress.played * 100) : undefined}
          tabIndex={progress.seekable ? 0 : -1}
          onPointerDown={(e) => {
            if (!progress.seekable) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekDragRef.current = true;
            seekFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (seekDragRef.current) seekFromPointer(e);
          }}
          onPointerUp={() => {
            seekDragRef.current = false;
          }}
          onPointerCancel={() => {
            seekDragRef.current = false;
          }}
          onKeyDown={(e) => {
            if (!progress.seekable) return;
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.stopPropagation();
            const v = videoRef.current;
            const win = seekWindowRef.current;
            if (!v || !win) return;
            const delta = (e.key === "ArrowRight" ? 10 : -10);
            v.currentTime = Math.min(win.end, Math.max(win.start, v.currentTime + delta));
            readProgress();
          }}
        >
          <div className="relative h-1 w-full rounded-full bg-white/20 transition-[height] duration-150 group-hover/bar:h-1.5">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${progress.buffered * 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-red-600"
              style={{ width: `${progress.played * 100}%` }}
            />
            {progress.seekable && (
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 opacity-0 shadow transition-opacity duration-150 group-hover/bar:opacity-100"
                style={{ left: `${progress.played * 100}%` }}
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={paused ? "Play" : "Pause"}
            className={BAR_BUTTON}
          >
            {paused ? (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className={BAR_BUTTON}
            >
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none" />
                  <path d="m16 9.5 5 5m0-5-5 5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none" />
                  <path d="M15 9.5a4 4 0 0 1 0 5" strokeLinecap="round" />
                  <path d="M17.5 7a7.5 7.5 0 0 1 0 10" strokeLinecap="round" />
                </svg>
              )}
            </button>
            {volumeSupported && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => applyVolume(Number(e.target.value))}
                aria-label="Volume"
                className={`h-1.5 w-16 cursor-pointer accent-red-600 sm:w-24 pointer-coarse:h-2 pointer-coarse:w-24 ${FOCUS_RING}`}
              />
            )}
          </div>

          {hasAlternates && (
            <div
              className="ml-1 flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible"
              role="group"
              aria-label="Alternate streams"
            >
              {channel.streams.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectStream(i)}
                  aria-pressed={i === streamIndex}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition pointer-coarse:min-h-11 pointer-coarse:px-3.5 ${FOCUS_RING} ${
                    i === streamIndex
                      ? "bg-accent text-white shadow-card"
                      : "text-neutral-300 hover:text-white"
                  }`}
                >
                  Stream {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className={BAR_BUTTON}
            >
              {isFullscreen ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
