import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { PRODUCT } from "./system/data";

// `next/font/google` emits no stylesheet under vinext — the generated class
// lands on <body> but the CSS variable and @font-face never ship, so the whole
// font-family declaration that referenced it was dropped by the browser.
// Loading the two families directly keeps dev and production identical.
// Inter covers Latin; Noto Sans Thai covers the Thai glyphs Inter lacks.
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "tomas-estimate-cost.example";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = `${PRODUCT.name} — ${PRODUCT.tagline}`;
  const description = "Internal engineering cost control: inquiry registration, estimate cost workspace, price library, supplier quotations, revision control and engineering review.";
  return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
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
