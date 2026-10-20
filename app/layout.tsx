import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/* viewport-fit=cover lets env(safe-area-inset-*) resolve on notched phones —
   the mobile top bar, drawer and player chrome pad against them. On desktop
   the insets are 0, so nothing changes there. */
export const viewport: Viewport = {
  viewportFit: "cover",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Live TV — every public channel in the world",
  description:
    "Browse and watch thousands of publicly available live TV streams from every country, gathered by the iptv-org community database and Free-TV/IPTV.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-neutral-50">{children}</body>
    </html>
  );
}
