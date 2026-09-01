"use client";

import { useEffect } from "react";

/** Let the app guard internal navigation and let the browser guard reload/closing. */
export function useReportUnsavedChanges(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
}
