"use client";
import { useCallback, useEffect, useState } from "react";
import { estimateNavigationKey, restoreEstimateNavigation, type EstimateNavigation, type EstimateTab } from "../../../lib/estimate-navigation";

export function useEstimateNavigation(userId: number, initialId: number | null) {
  const key = estimateNavigationKey(userId);
  const [state, setState] = useState<EstimateNavigation & { key: string | null }>({ key: null, estimateId: initialId, tab: "summary" });
  const ready = state.key === key;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let saved: string | null = null;
      try { saved = window.sessionStorage.getItem(key); } catch { /* Navigation still works without storage. */ }
      setState({ key, ...restoreEstimateNavigation(saved, initialId) });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, initialId]);
  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(key, JSON.stringify({ estimateId: state.estimateId, tab: state.tab })); }
    catch { /* Remembering navigation is optional. */ }
  }, [key, ready, state.estimateId, state.tab]);
  const selectEstimate = useCallback((estimateId: number | null) => {
    setState({ key, estimateId, tab: "summary" });
  }, [key]);
  const selectTab = useCallback((tab: EstimateTab) => {
    setState(current => ({ ...current, tab }));
  }, []);
  return { ready, estimateId: state.estimateId, tab: state.tab, selectEstimate, selectTab };
}
