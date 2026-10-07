"use client";
/* Full screen for one part of a page: the browser's Fullscreen API where it exists, otherwise the page
   lays the element over the whole window itself (iPhone Safari has no element full screen). Escape
   leaves either one; the browser handles it for the real full screen, a key listener for the overlay. */

import { useCallback, useEffect, useRef, useState } from "react";

const OVERLAY_BODY_CLASS = "fullscreen-overlay-open";

export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const sync = () => setNative(ref.current !== null && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOverlay(false); };
    document.addEventListener("keydown", onKey);
    // The page under the overlay must not scroll with the chart.
    document.body.classList.add(OVERLAY_BODY_CLASS);
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove(OVERLAY_BODY_CLASS); };
  }, [overlay]);

  const exit = useCallback(async () => {
    setOverlay(false);
    if (ref.current !== null && document.fullscreenElement === ref.current) await document.exitFullscreen().catch(() => undefined);
  }, []);

  const toggle = useCallback(async () => {
    const element = ref.current;
    if (!element) return;
    if (native || overlay) { await exit(); return; }
    if (document.fullscreenEnabled && typeof element.requestFullscreen === "function") {
      try { await element.requestFullscreen(); return; } catch { /* refused (e.g. an iframe without permission): use the overlay */ }
    }
    setOverlay(true);
  }, [exit, native, overlay]);

  return { ref, active: native || overlay, overlay, toggle, exit };
}
