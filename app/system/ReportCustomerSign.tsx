"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { reportUiText } from "./production/report-ui-copy";
import { ReportBodyEditor } from "./production/ReportScreens";
import "./production/report-workspace.css";

type CustomerReport = { number: string; locale: string; reportType: string; revision: number; title: string; reportDate: string; body: Record<string, unknown>; sourceReference: string; sourceTitle: string; customer: string; endUserName?: string | null; snapshotSha256: string; consentText: string; modes: string[] };
type Receipt = { status: string; number: string; revision: number; evidenceSha256: string };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to open this report.";
const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

async function publicRequest<T>(token: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  if (!baseUrl) throw new Error("The report service is not configured.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("This customer link is invalid.");
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch(`${baseUrl}/api/v1/report-acknowledgments/${encodeURIComponent(token)}`, {
    method: input === undefined ? "GET" : "POST", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: "application/json", ...(input === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const result = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "This link is invalid, expired, or has already been used.");
  return result;
}

export default function ReportCustomerSign({ token }: { token: string }) {
  const [report, setReport] = useState<CustomerReport | null>(null), [error, setError] = useState("");
  const t = (text: string) => reportUiText(text, report?.locale === "th" ? "TH" : report?.locale === "ja" ? "JP" : "EN");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Receipt | null>(null);
  const [name, setName] = useState(""), [title, setTitle] = useState(""), [company, setCompany] = useState(""), [date, setDate] = useState(today);
  const [mode, setMode] = useState("ACKNOWLEDGMENT"), [consent, setConsent] = useState(false), [hasInk, setHasInk] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), hasMoved = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try { const value = await publicRequest<CustomerReport>(token, undefined, signal); if (!signal?.aborted) { setReport(value); setConsent(false); } }
    catch (failure) { if (!signal?.aborted) setError(errorText(failure)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [token]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - bounds.left) * event.currentTarget.width / bounds.width, y: (event.clientY - bounds.top) * event.currentTarget.height / bounds.height }; };
  const clearInk = () => { const element = canvas.current; if (element) element.getContext("2d")?.clearRect(0, 0, element.width, element.height); drawing.current = false; setHasInk(false); };
  const submit = async () => {
    if (!report || !consent || busy || mode === "DRAWN_SIGNATURE" && !hasInk) return;
    setBusy(true); setError("");
    try {
      const signatureDataUrl = mode === "DRAWN_SIGNATURE" ? canvas.current?.toDataURL("image/png") : undefined;
      const saved = await publicRequest<Receipt>(token, { snapshotSha256: report.snapshotSha256, consent, name: name.trim(), title: title.trim(), company: company.trim(), date, mode, ...(signatureDataUrl ? { signatureDataUrl } : {}) });
      setReceipt(saved); clearInk();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  if (loading && !report) return <main className="report-public"><p role="status">{t("Opening report…")}</p></main>;
  if (!report) return <main className="report-public"><h1>{t("Customer report")}</h1><p role="alert">{t(error)}</p><button className="btn default" type="button" onClick={() => void load()}>{t("Try again")}</button></main>;
  return <main className="report-public" lang={report.locale} translate="no">
    <header><p>{report.number} · {t("Revision")} {report.revision} · {t(report.reportType)}</p><h1>{report.title}</h1><p>{report.customer} · {report.sourceReference} · {report.sourceTitle}</p>{report.endUserName ? <p>{t("End user:")}{report.endUserName}</p> : null}<p>{t("Report date:")}{report.reportDate}</p></header>
    {receipt ? <section className="callout success" role="status"><div><h2>{t(mode === "DRAWN_SIGNATURE" ? "Thank you. Your signature has been recorded." : "Thank you. Your acknowledgment has been recorded.")}</h2><p>{receipt.number} · {t("Revision")} {receipt.revision} {t("· Complete")}</p><p>{t("You may close this page. This signing link cannot be used again.")}</p></div></section> : <p>{t("Please read the report below before recording your acknowledgment or signature.")}</p>}
    <ReportBodyEditor locale={report.locale} reportType={report.reportType} body={report.body} readOnly />
    {!receipt ? <section className="report-section"><h2>{t("Customer acknowledgment / signature")}</h2><p>{t("Your name, company, stated date and the time of submission will be recorded against this report revision.")}</p><form onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={busy} className="report-public-fields"><div className="report-fields"><label className="field"><span>{t("Full name")}</span><input required maxLength={200} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label><label className="field"><span>{t("Title / position")}</span><input required maxLength={200} autoComplete="organization-title" value={title} onChange={event => setTitle(event.target.value)} /></label><label className="field"><span>{t("Company")}</span><input required maxLength={300} autoComplete="organization" value={company} onChange={event => setCompany(event.target.value)} /></label><label className="field"><span>{t("Date")}</span><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label className="field"><span>{t("How would you like to respond?")}</span><select value={mode} onChange={event => { setMode(event.target.value); setConsent(false); clearInk(); }}>{report.modes.map(value => <option key={value} value={value}>{value === "DRAWN_SIGNATURE" ? t("Draw my signature") : t("Record my acknowledgment")}</option>)}</select></label></div>
      {mode === "DRAWN_SIGNATURE" ? <div><p id="report-signature-help">{t("Draw your signature using your mouse, pen or finger. You can choose acknowledgment above without drawing.")}</p><canvas ref={canvas} width={1000} height={300} className="report-signature-canvas" aria-label={t("Draw customer signature")} aria-describedby="report-signature-help" onPointerDown={event => { if (busy) return; const context = event.currentTarget.getContext("2d"); if (!context) return; event.currentTarget.setPointerCapture(event.pointerId); const start = point(event); context.beginPath(); context.moveTo(start.x, start.y); context.strokeStyle = "#10233f"; context.lineWidth = 3; context.lineCap = "round"; context.lineJoin = "round"; drawing.current = true; hasMoved.current = false; }} onPointerMove={event => { if (!drawing.current || busy) return; const context = event.currentTarget.getContext("2d"); if (!context) return; const position = point(event); context.lineTo(position.x, position.y); context.stroke(); hasMoved.current = true; setHasInk(true); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} /><button type="button" className="btn ghost" onClick={clearInk}>{t("Clear signature")}</button></div> : null}
      <label className="report-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t(report.consentText)}</label>{error ? <div className="callout danger" role="alert">{t(error)}</div> : null}<div className="report-actions"><button type="submit" className="btn primary" disabled={busy || !consent || !name.trim() || !title.trim() || !company.trim() || !date || mode === "DRAWN_SIGNATURE" && !hasInk}>{busy ? t("Recording…") : mode === "DRAWN_SIGNATURE" ? t("Submit my signature") : t("Record my acknowledgment")}</button></div></fieldset></form></section> : null}
  </main>;
}
