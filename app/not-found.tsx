import Link from "next/link";

/* Custom 404 — same dark, red-accent language as the app: brand tile,
   generous type, one clear way home. Rendered inside the root layout, so
   the shell, fonts and theme tokens all come from the app itself. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      {/* soft red glow, echoing the player's ambient light */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/15 blur-3xl"
      />
      <span
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-red-500 to-red-700 shadow-lift ring-1 ring-white/20 ring-inset"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="ml-0.5 h-8 w-8 text-white" fill="currentColor">
          <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z" />
        </svg>
      </span>

      <p className="relative mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
        404 · Off air
      </p>
      <h1 className="relative mt-3 max-w-xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
        This page went off-air
      </h1>
      <p className="relative mt-4 max-w-md text-base leading-relaxed text-neutral-400">
        The page you&apos;re looking for isn&apos;t broadcasting — it may have
        moved, or the link took a wrong turn. The channels, though, are all
        still on.
      </p>

      <Link
        href="/"
        className="relative mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-red-500 to-red-700 px-7 text-sm font-semibold text-white shadow-lift ring-1 ring-white/20 ring-inset transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14z" />
        </svg>
        Back to Live TV
      </Link>

      <p className="relative mt-10 text-sm text-neutral-500">
        16,000+ channels from 182 countries are waiting on the home page.
      </p>
    </main>
  );
}
