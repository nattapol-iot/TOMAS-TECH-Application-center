"use client";

import dynamic from "next/dynamic";

const VerifyEntry = dynamic(() => import("../system/VerifyEntry"), {
  ssr: false,
  loading: () => <main className="demo-loading" aria-live="polite">Opening document verification…</main>,
});

/** Where the verification code and QR on a signature certificate point. */
export default function Verify() { return <VerifyEntry />; }
