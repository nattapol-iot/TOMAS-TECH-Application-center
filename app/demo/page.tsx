"use client";

import dynamic from "next/dynamic";

const DemoApp = dynamic(() => import("../system/App"), {
  ssr: false,
  loading: () => <main className="demo-loading" aria-live="polite">Loading demo workspace…</main>,
});

/** The design prototype on the in-repo dataset. Production owns "/". */
export default function Demo() { return <DemoApp forceDemo />; }
