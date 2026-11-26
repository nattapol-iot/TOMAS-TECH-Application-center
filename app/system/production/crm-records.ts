"use client";
/*
 * What the CRM screens (CrmScreens.tsx) and their @tomas-tc/ui forms (tomas-ui/CrmForms.tsx) share: the record shapes,
 * the data hooks, the option lists for the pickers and how an API refusal reads on screen. No UI lives here, so both
 * sides import it without pulling the other in.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiRequest, type BootstrapData } from "../api-client";

export type CrmRecord = Record<string, unknown>;
export type CrmPage = { items: CrmRecord[]; total: number; page: number; pageSize: number };
export type CustomerDetail = { service: CrmRecord[]; customer: CrmRecord; sites: CrmRecord[]; contacts: CrmRecord[]; inquiries: CrmRecord[]; estimates: CrmRecord[]; projects: CrmRecord[] };

export const text = (v: unknown) => (v == null ? "" : String(v));
export const date = (v: unknown) => text(v).slice(0, 10);
export const crmRequest = <T>(path: string, method: string, body: unknown) => apiRequest<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The value once it has stopped changing for `ms`, so a lookup runs when typing pauses. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * One GET, refetched when the URL changes. `data` is the answer for this URL only (a late answer for an earlier URL is
 * dropped); `shown` keeps the last answer on screen while the next one loads, so a filter change never flashes "0" or
 * "nothing found" before the result arrives (CRM UX audit CRM-06).
 */
export function useCrmData<T>(url: string | null) {
  const [result, setResult] = useState<{ url: string; value: T } | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(Boolean(url)),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(false);
      void apiRequest<T>(url)
        .then((v) => {
          if (!cancelled) setResult({ url, value: v });
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, revision]);
  const data = result?.url === url ? result.value : null;
  return { data, shown: url ? (result?.value ?? null) : null, error, loading: Boolean(url) && (loading || (!data && !error)), refresh };
}

/**
 * Pages 1..`pages` of a paged list, joined: the board asks for more instead of stopping at the API's 100 rows a page
 * (CRM-05). A change of `base` starts again at page 1.
 */
export function useCrmPages(base: string | null, pages: number) {
  const [state, setState] = useState<{ key: string; items: CrmRecord[]; total: number } | null>(null),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const key = base ? `${base}#${pages}#${revision}` : "";
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setError(false);
      void Promise.all(Array.from({ length: pages }, (_, index) => apiRequest<CrmPage>(`${base}&page=${index + 1}`)))
        .then((answers) => {
          if (!cancelled) setState({ key, items: answers.flatMap((answer) => answer.items), total: answers[0]?.total ?? 0 });
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [base, pages, key]);
  const current = state?.key === key ? state : null;
  return { items: current?.items ?? state?.items ?? [], total: current?.total ?? state?.total ?? 0, loading: Boolean(base) && !current && !error, error, refresh };
}

/** A picker entry: the name, a second line that tells look-alikes apart, and words it is also found by. */
export type CrmOption = { value: string; label: string; detail?: string; keywords?: string };

/** Lower case, one space, full-width forms folded, so "ＩＳＨＩＤＡ  thai" finds "Ishida (Thailand)". */
export const normalizeSearch = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
/** Every word typed must appear, in any order. */
export function matchesSearch(option: CrmOption, typed: string): boolean {
  const words = normalizeSearch(typed).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearch(`${option.label} ${option.detail ?? ""} ${option.keywords ?? ""}`);
  return words.every((word) => haystack.includes(word));
}

/**
 * A customer is found by its Thai, English and Japanese names, its short name, its code and its ERP code (CRM-12); the
 * second line shows the code, the ERP code and the site, so two companies with one name read apart.
 */
export const customerOption = (customer: BootstrapData["customers"][number]): CrmOption => ({
  value: String(customer.id),
  label: customer.name,
  detail: [customer.code, customer.erpCode ? `ERP ${customer.erpCode}` : "", customer.site].filter(Boolean).join(" · "),
  keywords: [customer.nameTh, customer.nameEn, customer.nameJa, customer.shortName, customer.code, customer.erpCode].filter(Boolean).join(" "),
});
export const customerOptions = (bootstrap: BootstrapData): CrmOption[] => bootstrap.customers.map(customerOption);
// People as two-line entries: the name, then the department; found by nickname and email too.
export const teamOptions = (bootstrap: BootstrapData): CrmOption[] =>
  bootstrap.team.map((u) => ({ value: String(u.id), label: u.name, detail: u.department, keywords: `${u.nickname ?? ""} ${u.email}` }));

/** API refusals the CRM forms explain in words, each with the field it points at when there is one. */
const FIELD_OF: Record<string, string> = { crm_lost_reason_required: "lostReason", duplicate_contact: "nameTh" };
const EVIDENCE = ["crm_sales_evidence_required", "crm_proposal_evidence_required", "crm_order_evidence_required"];
const KNOWN = [
  "concurrency_conflict",
  "invalid_reference",
  "permission_denied",
  "duplicate_contact",
  "crm_lost_reason_required",
  "crm_inquiry_exists",
  "crm_already_linked",
  "invalid_transition",
  "customer_in_use",
  "customer_in_erp",
  "contact_in_use",
  "primary_contact_protected",
  "validation_failed",
];
export type CrmFailure = { key: string; field?: string; detail?: string; conflict?: boolean };
export function crmFailure(error: unknown): CrmFailure {
  if (!(error instanceof ApiClientError)) return { key: "CRM.error" };
  if (EVIDENCE.includes(error.code)) return { key: "CRM.evidenceHint" };
  if (error.status === 409 && error.code === "concurrency_conflict") return { key: "CRM.concurrency_conflict", conflict: true };
  if (KNOWN.includes(error.code)) return { key: `CRM.${error.code}`, field: FIELD_OF[error.code], detail: error.code === "validation_failed" ? error.message : undefined };
  if (error.status === 403) return { key: "CRM.permission_denied" };
  return { key: "CRM.error", detail: error.message };
}

const LOCALE: Record<string, string> = { TH: "th-TH", JP: "ja-JP", EN: "en-GB" };
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
/** A calendar date (YYYY-MM-DD) in the reader's language, e.g. "12 ธ.ค. 2569"; empty when there is none. */
export function formatDay(value: unknown, lang: string): string {
  const day = date(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Intl.DateTimeFormat(LOCALE[lang] ?? "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}
/** A moment (an ISO timestamp) at the business's clock, in the reader's language (CRM-17: never raw UTC ISO text). */
export function formatMoment(value: unknown, lang: string): string {
  const moment = new Date(text(value));
  if (!text(value) || Number.isNaN(moment.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[lang] ?? "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }).format(moment);
}

/* Form state the CRM dialogs share (tomas-ui/CrmForms.tsx useCrmForm / useSave). */
const blank = (v: unknown) => v === "" || v === null || v === undefined;
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || JSON.stringify(a) === JSON.stringify(b);
/** Changed once any value differs from where the form started ("" and an absent value are the same). */
export function isDirty(initial: CrmRecord, value: CrmRecord): boolean {
  return [...new Set([...Object.keys(initial), ...Object.keys(value)])].some((key) => !same(initial[key], value[key]));
}
/** Required fields left empty, by key, each with the words shown under it. */
export function missingFields(fields: readonly { key: string; required?: boolean; type?: string }[], value: CrmRecord): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((field) => field.required && field.type !== "checkbox" && blank(typeof value[field.key] === "string" ? text(value[field.key]).trim() : value[field.key]))
      .map((field) => [field.key, "CRM.fieldRequired"]),
  );
}
