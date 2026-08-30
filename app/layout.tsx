import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT } from "./system/product";
import { isTrustedWebProtocol } from "./system/network-origin";

// `next/font/google` emits no stylesheet under vinext — the generated class
// lands on <body> but the CSS variable and @font-face never ship, so the whole
// font-family declaration that referenced it was dropped by the browser.
// Loading the two families directly keeps dev and production identical.
// Inter covers Latin; Noto Sans Thai covers the Thai glyphs Inter lacks.
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap";

export function generateMetadata(): Metadata {
  const configuredOrigin = process.env.SITE_ORIGIN ?? "http://localhost:3000";
  const origin = safeOrigin(configuredOrigin);
  const image = `${origin}/og.png`;
  const title = `${PRODUCT.name} — ${PRODUCT.tagline}`;
  const description = "Secure internal engineering workflow for inquiry registration, estimate cost review and approval, project initiation, and inventory visibility.";
  return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

function safeOrigin(value: string) {
  try {
    const url = new URL(value);
    const teamTestMode = process.env.NEXT_PUBLIC_AUTH_MODE === "team-test";
    if (!isTrustedWebProtocol(url, teamTestMode)) return "http://localhost:3000";
    return url.origin;
  } catch {
    return "http://localhost:3000";
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
