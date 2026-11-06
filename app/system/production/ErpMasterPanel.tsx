/*
 * Customers and suppliers from Pegasus ERP (owner decision 2026-11-05, migration 099). Opening a customer or supplier
 * screen asks the server to read the ERP's register with the viewer's TMT ID sign-in; the server reads at most once per
 * 15 minutes for the whole app, adds what the app lacks and links what matches. An Admin confirms the records that match
 * more than one app record, or one only doubtfully. Server side: backend-node/src/erp-master-sync.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { Badge, Icon, Modal } from "../ui";
import "./master-data.css";

export type ErpMasterKind = "customers" | "suppliers";
type Register = { kind: ErpMasterKind; finishedAt: string | null; running: boolean; continuing: boolean; error: string | null; linked: number; appOnly: number; review: number };
type Overview = { enabled: boolean; canSettle: boolean; registers: Register[] };
type Outcome = { state: "synced" | "partial" | "fresh" | "busy" | "failed" | "signed_out" | "off"; changed: boolean; message?: string };
type ReviewItem = { key: string; code: string; nameTh: string; nameEn: string; taxId: string; address: string; candidateIds: number[] };
type Candidate = { id: number; code: string; name: string; taxId: string; address: string; erpKey: string | null; erpCode?: string | null };

const when = (value: string) => new Date(value).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });
const count = (value: number) => value.toLocaleString(currentLocale());
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export function ErpMasterPanel({ kind, onChanged }: { kind: ErpMasterKind; onChanged?: () => unknown }) {
  const t = useT();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reviewing, setReviewing] = useState(false);
  // The latest callback, so a parent that passes a new function on every render does not start another read.
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; });

  const load = useCallback(() => apiRequest<Overview>("/api/v1/erp/master-data").then(setOverview, () => setOverview(null)), []);
  const sync = useCallback(async (force: boolean) => {
    setSyncing(true);
    try {
      const result = await apiRequest<Outcome>(`/api/v1/erp/master-data/${kind}/sync`, { method: "POST", body: JSON.stringify({ force }) }, 180_000);
      setOutcome(result);
      if (result.changed) await changed.current?.();
    } catch (error) {
      setOutcome({ state: "failed", changed: false, message: messageOf(error) });
    } finally {
      setSyncing(false);
      await load();
    }
  }, [kind, load]);

  // Opening the screen asks once; the server decides whether the ERP is due to be read.
  useEffect(() => {
    const timer = setTimeout(() => { void load(); void sync(false); }, 0);
    return () => clearTimeout(timer);
  }, [load, sync]);

  const register = overview?.registers.find((item) => item.kind === kind);
  if (!overview?.enabled || !register) return null;
  const failure = outcome?.state === "failed" ? outcome.message ?? "" : register.error;
  const busy = syncing || register.running;
  return <>
    <div className={`info-strip erp-master-strip${failure ? " amber" : ""}`} role="status" data-guide="erp.status">
      <Icon name={failure ? "alertTriangle" : "database"} />
      <span className="erp-master-text">
        <strong>{t("ErpMaster.from")}</strong>
        {" · "}{busy ? t("ErpMaster.syncing") : register.finishedAt ? t("ErpMaster.updated").replace("{time}", when(register.finishedAt)) : t("ErpMaster.never")}
        {" · "}{t("ErpMaster.linked").replace("{n}", count(register.linked))}
        {" · "}{t("ErpMaster.appOnly").replace("{n}", count(register.appOnly))}
        {register.continuing && !busy ? <>{" · "}{t("ErpMaster.continuing")}</> : null}
        {outcome?.state === "signed_out" ? <>{" · "}{t("ErpMaster.signedOut")}</> : null}
        {failure ? <>{" · "}{t("ErpMaster.failed").replace("{message}", failure)}</> : null}
      </span>
      {overview.canSettle && register.review > 0 ? <button className="btn default sm" type="button" data-guide="erp.review" onClick={() => setReviewing(true)}>
        <Icon name="link" />{t("ErpMaster.review").replace("{n}", count(register.review))}</button> : null}
      {overview.canSettle ? <button className="btn ghost sm" type="button" disabled={busy} onClick={() => { void sync(true); }}>
        <Icon name="refresh" />{t("ErpMaster.syncNow")}</button> : null}
    </div>
    {reviewing ? <ErpReviewModal kind={kind} onClose={() => setReviewing(false)} onSettled={async () => { await load(); await changed.current?.(); }} /> : null}
  </>;
}

function ErpReviewModal({ kind, onClose, onSettled }: { kind: ErpMasterKind; onClose: () => void; onSettled: () => Promise<void> }) {
  const t = useT();
  const [data, setData] = useState<{ items: ReviewItem[]; candidates: Candidate[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const load = useCallback(() => apiRequest<{ items: ReviewItem[]; candidates: Candidate[] }>(`/api/v1/erp/master-data/${kind}/review`)
    .then(setData, (failure: unknown) => setError(messageOf(failure))), [kind]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const settle = async (item: ReviewItem, body: { action: "link"; id: number } | { action: "create" }) => {
    setBusy(item.key); setError("");
    try {
      await apiRequest(`/api/v1/erp/master-data/${kind}/review/${encodeURIComponent(item.key)}`, { method: "POST", body: JSON.stringify(body) });
      await onSettled();
      await load();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
  };
  const byId = new Map((data?.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  return <Modal title={`ErpMaster.reviewTitle.${kind}`} size="lg" onClose={onClose}>
    <p className="muted">{t("ErpMaster.reviewHint")}</p>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {!data ? <div className="empty"><span className="spinner" /></div> : !data.items.length ? <p>{t("ErpMaster.nothingToReview")}</p> :
      <div className="table-wrap"><table>
        <thead><tr><th>{t("ErpMaster.inErp")}</th><th>{t("ErpMaster.inApp")}</th><th><span className="sr-only">{t("Actions")}</span></th></tr></thead>
        <tbody>{data.items.map((item) => {
          const options = item.candidateIds.map((id) => byId.get(id)).filter((candidate): candidate is Candidate => Boolean(candidate));
          const picked = chosen[item.key] ?? options.find((candidate) => !candidate.erpKey)?.id;
          return <tr key={item.key}>
            <td className="wrap">
              <strong>{item.nameEn || item.nameTh}</strong>
              {item.nameEn && item.nameTh ? <div className="muted">{item.nameTh}</div> : null}
              <div className="muted"><span className="mono">{item.code || item.key}</span>{item.taxId ? ` · ${t("ErpMaster.taxId").replace("{id}", item.taxId)}` : ""}</div>
              {item.address ? <div className="muted">{item.address}</div> : null}
            </td>
            <td className="wrap"><div className="erp-review-options" role="radiogroup" aria-label={t("ErpMaster.inApp")}>
              {options.map((candidate) => <label key={candidate.id}>
                <input type="radio" name={`erp-${kind}-${item.key}`} checked={picked === candidate.id} disabled={Boolean(candidate.erpKey)}
                  onChange={() => setChosen((current) => ({ ...current, [item.key]: candidate.id }))} />
                <span><strong>{candidate.name}</strong> <span className="mono muted">{candidate.code}</span>
                  {candidate.taxId ? <span className="muted"> · {t("ErpMaster.taxId").replace("{id}", candidate.taxId)}</span> : null}
                  {candidate.erpKey ? <> <Badge tone="slate">{t("ErpMaster.linkedElsewhere").replace("{code}", candidate.erpCode || candidate.erpKey)}</Badge></> : null}
                  {candidate.address ? <div className="muted">{candidate.address}</div> : null}</span>
              </label>)}
            </div></td>
            <td><div className="row-actions">
              <button className="btn primary sm" type="button" disabled={picked === undefined || busy !== null}
                onClick={() => { if (picked !== undefined) void settle(item, { action: "link", id: picked }); }}>{t("ErpMaster.linkTo")}</button>
              <button className="btn default sm" type="button" disabled={busy !== null} onClick={() => { void settle(item, { action: "create" }); }}>{t("ErpMaster.addNew")}</button>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
  </Modal>;
}
