"use client";
/*
 * The V1 / V2 switch of the Sales screens (owner 2026-11-21, lib/sales-look.ts). V1 renders the screen exactly as before. V2
 * wraps the same screen in "pg-skin pg-screen sales-v2": pegasus-skin.css and pegasus-screens.css give it the Pegasus ERP look
 * the Team & Knowledge and System menus already wear, and sales-v2.css adds what the Sales screens need on top. The screen
 * learns its look from useSalesLook() to lay its main list out the Pegasus way. Every rule of the three sheets is scoped, so
 * nothing reaches a screen opened in V1 or any other screen.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useLanguage } from "../i18n";
import { SALES_LOOK_DEFAULT, parseSalesLook, salesLookKey, type SalesLook } from "../../../lib/sales-look";
import "./pegasus-skin.css";
import "./pegasus-screens.css";
import "./sales-v2.css";

const SalesLookContext = createContext<SalesLook>(SALES_LOOK_DEFAULT);

/** "v2" inside a Sales screen opened in the new look, "v1" everywhere else. */
export const useSalesLook = (): SalesLook => useContext(SalesLookContext);

function readLook(userId: number): SalesLook {
  try {
    return parseSalesLook(window.localStorage.getItem(salesLookKey(userId)));
  } catch {
    return SALES_LOOK_DEFAULT;
  }
}

function storeLook(userId: number, look: SalesLook): void {
  try {
    window.localStorage.setItem(salesLookKey(userId), look);
  } catch {
    // Blocked storage only means the choice is not remembered; the screen still switches.
  }
}

/** Text in the reader's language for the few words the Sales V2 parts show. */
export function useSalesCopy(): (th: string, en: string, jp: string) => string {
  const { lang } = useLanguage();
  return (th, en, jp) => lang === "TH" ? th : lang === "JP" ? jp : en;
}

export function SalesLookScope({ userId, children }: { userId: number; children: ReactNode }) {
  const [look, setLook] = useState<SalesLook>(() => readLook(userId));
  const copy = useSalesCopy();
  const choose = useCallback((next: SalesLook) => { setLook(next); storeLook(userId, next); }, [userId]);
  const label = copy("หน้าตาหน้าจอ", "Screen look", "画面の表示");
  const bar = <div className="sales-look-bar">
    <span className="sales-look-label">{label}</span>
    <div className="sales-look-switch" role="radiogroup" aria-label={label} data-guide="sales.look">
      <button type="button" role="radio" aria-checked={look === "v1"} onClick={() => choose("v1")}
        title={copy("หน้าตาเดิม", "The look you know", "従来の表示")}>V1</button>
      <button type="button" role="radio" aria-checked={look === "v2"} data-guide="sales.lookV2" onClick={() => choose("v2")}
        title={copy("หน้าตาแบบ Pegasus ERP", "The Pegasus ERP look", "Pegasus ERP の表示")}>V2</button>
    </div>
  </div>;
  // The same element in both looks, so switching keeps the screen (an open deal, its tab, a typed draft) mounted. In V1 it is
  // display: contents and the page lays the screen out exactly as before.
  return <SalesLookContext.Provider value={look}>
    <div className={look === "v2" ? "pg-skin pg-screen sales-v2" : "sales-look-v1"} data-sales-look={look}>{bar}{children}</div>
  </SalesLookContext.Provider>;
}
