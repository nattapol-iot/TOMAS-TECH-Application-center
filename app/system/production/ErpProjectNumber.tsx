"use client";

import { useEffect, useId, useState } from "react";
import { apiRequest } from "../api-client";
import { useT } from "../i18n";
import { Icon } from "../ui";
import { LookupMenu, handleMenuKeys, type MenuKeys } from "./CostItemLookup";
import "./master-data.css";

/*
 * The project number with the Pegasus ERP's projects under it (purchasing_projects_list: a number, project name or customer
 * name, at most 30 a search). The number can still be typed by hand: the ERP may not answer, and a project may be registered
 * under the placeholder before the ERP issues its number. Owner decision 2026-11-06; see docs/PEGASUS_ERP_PROJECTS_TH.md.
 */

export type ErpProjectHit = { number: string; name: string; customerName: string; customerId: number | null; projectId: number | null };
type Search = { enabled: boolean; projects: ErpProjectHit[]; message?: string; kind?: string };
type Found = { query: string; result: Search | null; error: string };

/** PJ000000 and the like: the number a project carries until the ERP issues one (migration 084). */
export const isPlaceholderProjectNumber = (number: string) => number.includes("0") && !/[1-9]/.test(number);

const sameNumber = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

export function ErpProjectNumberField({ value, onChange, onPick, currentProjectId, disabled, required, guide, span }: {
  value: string; onChange: (number: string) => void;
  /** A project chosen from the ERP's list, so the form can fill what it knows from it. */
  onPick?: (project: ErpProjectHit) => void;
  /** The project being edited: its own number is not another project's. */
  currentProjectId?: number;
  disabled?: boolean; required?: boolean; guide?: string; span?: 2;
}) {
  const t = useT();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const typed = value.trim();
  const searchable = !disabled && typed.length >= 2 && !isPlaceholderProjectNumber(typed);

  // One search a moment after typing stops; the ERP allows 120 calls a minute per person.
  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const timer = window.setTimeout(() => {
      apiRequest<Search>(`/api/v1/erp/projects?q=${encodeURIComponent(typed)}`).then(
        (result) => { if (live) setFound({ query: typed, result, error: "" }); },
        (error: unknown) => { if (live) setFound({ query: typed, result: null, error: error instanceof Error ? error.message : String(error) }); });
    }, 400);
    return () => { live = false; window.clearTimeout(timer); };
  }, [typed, searchable]);

  const current = searchable && found?.query === typed ? found : null;
  const hits = current?.result?.projects ?? [];
  const exact = hits.find((hit) => sameNumber(hit.number, typed));
  const takenHere = (hit: ErpProjectHit) => hit.projectId !== null && hit.projectId !== currentProjectId;
  const shown = open && hits.length > 0 && !(exact && hits.length === 1);
  const highlighted = Math.min(active, Math.max(0, hits.length - 1));
  const close = () => setOpen(false);
  const pick = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    onChange(hit.number); onPick?.(hit); close();
  };
  const keys: MenuKeys = { open: shown, count: hits.length, active: highlighted, setActive, pick, close, show: () => { setActive(0); setOpen(true); } };

  const failure = current?.error || current?.result?.message || "";
  const status: { tone: "" | "ok" | "warn"; text: string } | null = !typed ? { tone: "", text: t("ErpProject.hint") }
    : isPlaceholderProjectNumber(typed) ? { tone: "warn", text: t("ErpProject.placeholder") }
    : !searchable ? null
    : !current ? { tone: "", text: t("ErpProject.searching") }
    : current.result && !current.result.enabled ? { tone: "", text: t("ErpProject.off") }
    : failure ? { tone: "warn", text: t("ErpProject.failed").replace("{message}", failure) }
    : exact && takenHere(exact) ? { tone: "warn", text: t("ErpProject.inApp") }
    : exact ? { tone: "ok", text: t("ErpProject.found").replace("{name}", [exact.name, exact.customerName].filter(Boolean).join(" · ") || exact.number) }
    : hits.length ? { tone: "", text: t("ErpProject.pick") }
    : { tone: "warn", text: t("ErpProject.notFound") };

  return <div className={`field erp-project-field${span ? ` span-${span}` : ""}`} data-guide={guide}>
    <span>{t("CRM.projectNoFromErp")}</span>
    <input ref={setAnchor} role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={shown ? menuId : undefined} aria-label={t("CRM.projectNoFromErp")}
      required={required} disabled={disabled} maxLength={30} autoComplete="off" placeholder={t("CRM.projectNoPlaceholder")} value={value}
      onFocus={() => { setActive(0); setOpen(true); }} onBlur={close}
      onChange={(event) => { onChange(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (handleMenuKeys(event, keys)) return;
        if (event.key === "Enter" && shown) event.preventDefault();
      }} />
    {status ? <small className={`erp-project-status${status.tone ? ` ${status.tone}` : ""}`} role="status">
      {status.tone === "ok" ? <Icon name="check" /> : status.tone === "warn" ? <Icon name="alertTriangle" /> : null}<span>{status.text}</span>
    </small> : null}
    {shown && !disabled ? <LookupMenu id={menuId} anchor={anchor} minWidth={360} label={t("ErpProject.listLabel")}>
      {hits.map((hit, index) => <button type="button" key={hit.number} role="option" tabIndex={-1} aria-selected={sameNumber(hit.number, typed)}
        className={`lookup-option${index === highlighted ? " active" : ""}${sameNumber(hit.number, typed) ? " chosen" : ""}`}
        onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(index)}>
        <div className="lookup-main"><strong className="mono">{hit.number}</strong>{hit.name ? <span className="lookup-desc">{hit.name}</span> : null}</div>
        <div className="lookup-meta"><span>{hit.customerName || "—"}</span>{takenHere(hit) ? <span className="erp-project-taken">{t("ErpProject.takenBadge")}</span> : null}</div>
      </button>)}
      {hits.length >= 30 ? <div className="lookup-hint">{t("ErpProject.more")}</div> : null}
    </LookupMenu> : null}
  </div>;
}
