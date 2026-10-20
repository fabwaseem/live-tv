"use client";

import { useEffect } from "react";
import Link from "next/link";

/* Root error boundary — friendly, plain language only. The technical error
   goes to the console, never to the screen (standing quality bar). */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/15 blur-3xl"
      />
      <span
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 shadow-lift ring-1 ring-white/15 ring-inset"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-red-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <h1 className="relative mt-8 max-w-xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
        Something interrupted the broadcast
      </h1>
      <p className="relative mt-4 max-w-md text-base leading-relaxed text-neutral-400">
        Sorry — something went wrong on our side while loading this page.
        It&apos;s usually temporary, so please try again in a moment.
      </p>

      <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-12 cursor-pointer items-center rounded-full bg-gradient-to-b from-red-500 to-red-700 px-7 text-sm font-semibold text-white shadow-lift ring-1 ring-white/20 ring-inset transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-full border border-line bg-surface-2 px-7 text-sm font-semibold text-neutral-200 transition hover:bg-surface-3 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/70"
        >
          Back to Live TV
        </Link>
      </div>
    </main>
  );
}
