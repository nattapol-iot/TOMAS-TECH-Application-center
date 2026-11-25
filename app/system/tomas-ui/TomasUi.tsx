"use client";
/*
 * A root for @tomas-tc/ui on the app's own page (owner 2026-11-25: "ใช้ Componance UI @tomas-tc/ui เป็นหลัก").
 *
 * tomas-ui-island.css holds the package's styles under .tui only (scripts/postcss-tomas-ui-scope.mjs), so:
 * - every part built on the package renders inside <TomasUi>;
 * - its dialogs, sheets, menus and tooltips portal into a second .tui root at the end of <body>, never to <body> itself;
 * - the platform look is Pegasus (data-platform="pegasus"), the look the ERP and the Projects screens wear;
 * - the package's words follow the app's language.
 * An old app component is never rendered inside a .tui root: the package's reset and utilities would reach it.
 */
import { PortalContainerProvider, TooltipProvider, UiIntlProvider } from "@tomas-tc/ui";
import { useSyncExternalStore, type ReactNode } from "react";
import { useLanguage, type Lang } from "../i18n";
import "./tomas-ui-island.css";

export const TOMAS_UI_LOCALE: Record<Lang, "th" | "en" | "ja"> = { TH: "th", EN: "en", JP: "ja" };

/**
 * One portal root for every island on the page: made when the first island subscribes, removed when the last one goes.
 * React reads it through an external store, so no island sets state in an effect to learn it.
 */
let portalRoot: HTMLElement | null = null;
let portalUsers = 0;
function subscribePortal(): () => void {
  if (!portalRoot) {
    const outer = document.createElement("div");
    outer.className = "tui tui-portal";
    const inner = document.createElement("div");
    inner.setAttribute("data-platform", "pegasus");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    portalRoot = inner;
  }
  portalUsers += 1;
  return () => {
    portalUsers -= 1;
    if (portalUsers > 0 || !portalRoot) return;
    portalRoot.parentElement?.remove();
    portalRoot = null;
  };
}
const readPortal = () => portalRoot;
const readNoPortal = () => null;

export function TomasUi({ children, className }: { children: ReactNode; className?: string }) {
  const { lang } = useLanguage();
  const portal = useSyncExternalStore(subscribePortal, readPortal, readNoPortal);
  return (
    <div className={className ? `tui ${className}` : "tui"}>
      <div data-platform="pegasus" style={{ display: "contents" }}>
        <UiIntlProvider locale={TOMAS_UI_LOCALE[lang]}>
          <PortalContainerProvider container={portal}>
            <TooltipProvider>{children}</TooltipProvider>
          </PortalContainerProvider>
        </UiIntlProvider>
      </div>
    </div>
  );
}
