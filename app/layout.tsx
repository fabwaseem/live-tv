import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://livetv.fabwaseem.com";
const SITE_NAME = "Live TV";
const TITLE = "Live TV — Watch Free Live TV Channels from Every Country";
const DESCRIPTION =
  "Watch 16,000+ live TV channels from 182 countries — news, sports, movies and more, streaming free in your browser. No sign-up, no cost.";

/* viewport-fit=cover lets env(safe-area-inset-*) resolve on notched phones —
   the mobile top bar, drawer and player chrome pad against them. On desktop
   the insets are 0, so nothing changes there. themeColor paints the mobile
   browser chrome in the app's own background tone. */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#09090c",
  colorScheme: "dark",
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | Live TV",
  },
  description: DESCRIPTION,
  keywords: [
    "live tv",
    "watch live tv online free",
    "free tv channels",
    "live streaming",
    "world tv channels",
    "international tv channels",
    "live news channels",
    "live sports channels",
    "watch tv online",
    "free live television",
  ],
  authors: [{ name: "Waseem Anjum", url: "https://fabwaseem.com" }],
  creator: "Waseem Anjum",
  publisher: SITE_NAME,
  category: "Entertainment",
  classification: "Live TV streaming directory",
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/icon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Live TV — free live TV channels from every country",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

/* Structured data: honest, minimal — what the site is and that it's free. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: DESCRIPTION,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires a modern web browser with JavaScript.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-neutral-50">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
