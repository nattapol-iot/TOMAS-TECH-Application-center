"use client";
/*
 * The V1 / V2 switch of the Estimating screens (owner 2026-11-19, lib/estimate-look.ts). V1 renders the screen exactly
 * as before. V2 wraps the same screen in .pge, where estimate-v2.css draws it in the Pegasus ERP look, and tells the
 * screen through EstimateLookContext so it can lay its main parts out the Pegasus way. Everything under .pge is scoped:
 * no rule in estimate-v2.css reaches another screen.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "../i18n";
import { ESTIMATE_LOOK_DEFAULT, estimateLookKey, parseEstimateLook, type EstimateLook } from "../../../lib/estimate-look";
import "./estimate-v2.css";

const EstimateLookContext = createContext<EstimateLook>(ESTIMATE_LOOK_DEFAULT);

/** "v2" inside an Estimating screen opened in the new look, "v1" everywhere else. */
export const useEstimateLook = (): EstimateLook => useContext(EstimateLookContext);

function readLook(userId: number): EstimateLook {
  try {
    return parseEstimateLook(window.localStorage.getItem(estimateLookKey(userId)));
  } catch {
    return ESTIMATE_LOOK_DEFAULT;
  }
}

function storeLook(userId: number, look: EstimateLook): void {
  try {
    window.localStorage.setItem(estimateLookKey(userId), look);
  } catch {
    // Blocked storage only means the choice is not remembered; the screen still switches.
  }
}

/** Text in the reader's language for the few words this file shows. */
export function useLookCopy(): (th: string, en: string, jp: string) => string {
  const { lang } = useLanguage();
  return (th, en, jp) => lang === "TH" ? th : lang === "JP" ? jp : en;
}

export function EstimateLookScope({ userId, children }: { userId: number; children: ReactNode }) {
  const [look, setLook] = useState<EstimateLook>(() => readLook(userId));
  const copy = useLookCopy();
  const choose = useCallback((next: EstimateLook) => { setLook(next); storeLook(userId, next); }, [userId]);
  // Portalled menus (item lookups) sit outside .pge; this mark lets estimate-v2.css give them the same look.
  useEffect(() => {
    if (look !== "v2") return undefined;
    document.documentElement.dataset.estLook = "v2";
    return () => { delete document.documentElement.dataset.estLook; };
  }, [look]);
  const label = copy("หน้าตาหน้าจอ", "Screen look", "画面の表示");
  const bar = <div className="est-look-bar">
    <span className="est-look-label">{label}</span>
    <div className="est-look-switch" role="radiogroup" aria-label={label} data-guide="estimate.look">
      <button type="button" role="radio" aria-checked={look === "v1"} onClick={() => choose("v1")}
        title={copy("หน้าตาเดิม", "The look you know", "従来の表示")}>V1</button>
      <button type="button" role="radio" aria-checked={look === "v2"} data-guide="estimate.lookV2" onClick={() => choose("v2")}
        title={copy("หน้าตาแบบ Pegasus ERP", "The Pegasus ERP look", "Pegasus ERP の表示")}>V2</button>
    </div>
  </div>;
  // The same element in both looks, so switching keeps the screen (the open estimate, its tab, a typed draft) mounted.
  // In V1 it is display: contents and the page lays the screen out exactly as before.
  return <EstimateLookContext.Provider value={look}>
    <div className={look === "v2" ? "pge" : "est-look-v1"} data-est-look={look}>{bar}{children}</div>
  </EstimateLookContext.Provider>;
}
