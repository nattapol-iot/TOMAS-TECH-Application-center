"use client";
/* A person's open work in the order they mean to do it, with the day each item would be done if it is worked in that
   order (lib/resource-planning.ts projectWork). The person, or a manager, moves items up and down and the order is
   saved as it changes. Plan dates are never changed here: a plan task projected past its finish offers its own PIC the
   day request the PM answers. Used by the Workload drawer and by My Work's "My work order" tab. */

import { useCallback, useEffect, useState } from "react";
import { apiRequest, type BootstrapData } from "../api-client";
import { useLanguage } from "../i18n";
import { Badge, EmptyState, Field, Icon, Modal, Panel, type Tone } from "../ui";
import { loadWorkload, saveWorkOrder, type Workload, type WorkloadEffort } from "../resource-workload-client";
import { orderWork, projectWork, weeklyCapacity, type Commitment } from "../../../lib/resource-planning";
import "./workload.css";

const TONES: Record<Commitment["type"], Tone> = { Inquiry: "blue", Estimate: "violet", Project: "green" };
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** The schedule task behind a plan task's work key (Project-<task id>). */
const scheduleTaskId = (item: Commitment) => (item.type === "Project" ? Number(item.workKey.slice("Project-".length)) : null);

export function WorkQueue({
  items,
  order,
  capacity,
  today,
  holidays,
  editable,
  canRequestDays,
  canPlanEffort,
  onOpen,
  canOpen = () => true,
  onEffort,
  onSaveOrder,
  onRequested,
}: {
  /** This person's work; finished work is left out. */
  items: Commitment[];
  /** Their saved order, as work keys. */
  order: string[];
  /** Working days a week. */
  capacity: number;
  today: string;
  holidays: string[];
  /** The person themself, or a manager, may reorder. */
  editable: boolean;
  /** The viewer is this person and may ask the PM for more days on their own plan tasks. */
  canRequestDays: boolean;
  canPlanEffort: (item: Commitment) => boolean;
  onOpen?: (item: Commitment) => void;
  /** Whether onOpen can show this item's source; otherwise its reference is plain text. */
  canOpen?: (item: Commitment) => boolean;
  onEffort?: (item: Commitment) => void;
  onSaveOrder: (keys: string[]) => Promise<void>;
  onRequested?: () => void;
}) {
  const { t } = useLanguage();
  // The order shown while a save is in flight; a refused save falls back to the saved order.
  const [pending, setPending] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState<{ item: Commitment; days: number; finish: string } | null>(null);
  const ordered = orderWork(items, pending ?? order);
  const projection = projectWork(ordered, capacity, today, holidays);
  const lateCount = ordered.filter((item) => (projection.get(item.key)?.lateDays ?? 0) > 0).length;
  const save = async (keys: string[]) => {
    setPending(keys);
    setError("");
    try {
      await onSaveOrder(keys);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(null);
    }
  };
  const move = (index: number, to: number) => {
    if (pending || to < 0 || to >= ordered.length) return;
    const keys = ordered.map((item) => item.workKey);
    const [moved] = keys.splice(index, 1);
    keys.splice(to, 0, moved!);
    void save(keys);
  };
  if (!ordered.length) return <EmptyState icon="checkCircle" title="Workload.noOpenWork" message="Workload.noOpenWorkHint" />;
  return (
    <div className="work-queue">
      <p className="work-queue-hint">
        {t(editable ? "WorkQueue.hintEditable" : "WorkQueue.hint").replace("{capacity}", fmt(capacity))}
      </p>
      <div className="work-queue-summary">
        {lateCount ? <Badge tone="red">{t("WorkQueue.lateCount").replace("{n}", String(lateCount))}</Badge> : <Badge tone="green">{t("WorkQueue.allOnTime")}</Badge>}
        {editable && order.length ? (
          <button type="button" className="btn ghost sm" disabled={Boolean(pending)} onClick={() => void save([])}>
            <Icon name="calendar" />
            {t("WorkQueue.byDueDate")}
          </button>
        ) : null}
      </div>
      {error ? <div className="callout danger" role="alert">{error}</div> : null}
      <ol className="work-queue-list">
        {ordered.map((item, index) => {
          const projected = projection.get(item.key)!;
          const late = (projected.lateDays ?? 0) > 0;
          const taskId = scheduleTaskId(item);
          return (
            <li key={item.key} className={late ? "late" : undefined}>
              <span className="work-queue-rank">{index + 1}</span>
              <div className="work-queue-body">
                <div className="workload-item-head">
                  <Badge tone={TONES[item.type]}>{t(item.type)}</Badge>
                  {onOpen && canOpen(item) ? (
                    <button type="button" className="workload-item-link" onClick={() => onOpen(item)}>{item.reference}</button>
                  ) : (
                    <span className="mono">{item.reference}</span>
                  )}
                  {item.end && item.end < today ? <Badge tone="red">{t("overdue")}</Badge> : null}
                  {item.tentative ? <Badge tone="amber">{t("Workload.awaitingApproval")}</Badge> : null}
                </div>
                <strong>{item.title}</strong>
                <small>
                  {t("WorkQueue.plan")} {item.start ?? "—"} → {item.end ?? "—"} · {item.manDays ? `${fmt(item.manDays)} MD` : t("Workload.missingEffort")} · {fmt(item.progress)}%
                </small>
                <span className={`work-queue-projection${late ? " late" : projected.finish ? "" : " unknown"}`}>
                  {projected.finish
                    ? t(late ? "WorkQueue.projectedLate" : "WorkQueue.projected")
                        .replace("{date}", projected.finish)
                        .replace("{n}", String(projected.lateDays))
                    : t(projected.reason === "effort" ? "WorkQueue.noEffort" : projected.reason === "capacity" ? "WorkQueue.noCapacity" : "WorkQueue.beyondHorizon")}
                </span>
                {(late && canRequestDays && taskId) || canPlanEffort(item) ? (
                  <div className="workload-item-effort">
                    {late && canRequestDays && taskId ? (
                      <button type="button" className="btn default sm" onClick={() => setRequesting({ item, days: projected.lateDays!, finish: projected.finish! })}>
                        <Icon name="send" />
                        {t("Request more days")}
                      </button>
                    ) : null}
                    {canPlanEffort(item) && onEffort ? (
                      <button type="button" className="btn ghost sm" onClick={() => onEffort(item)}>
                        <Icon name="edit" />
                        {t("Plan effort")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {editable ? (
                <div className="work-queue-move">
                  <button type="button" className="icon-btn" disabled={Boolean(pending) || index === 0} onClick={() => move(index, index - 1)}
                    aria-label={`${t("WorkQueue.moveUp")} ${item.reference}`} title={t("WorkQueue.moveUp")}>
                    <Icon name="arrowUp" />
                  </button>
                  <button type="button" className="icon-btn" disabled={Boolean(pending) || index === ordered.length - 1} onClick={() => move(index, index + 1)}
                    aria-label={`${t("WorkQueue.moveDown")} ${item.reference}`} title={t("WorkQueue.moveDown")}>
                    <Icon name="arrowDown" />
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {requesting ? (
        <DayRequestModal
          item={requesting.item}
          taskId={scheduleTaskId(requesting.item)!}
          days={requesting.days}
          finish={requesting.finish}
          onClose={() => setRequesting(null)}
          onSent={() => {
            setRequesting(null);
            onRequested?.();
          }}
        />
      ) : null}
    </div>
  );
}

/** The day request My Work already sends, filled in from the projection; the dates change only when the PM accepts. */
function DayRequestModal({ item, taskId, days: projectedDays, finish, onClose, onSent }: {
  item: Commitment;
  taskId: number;
  days: number;
  finish: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useLanguage();
  const [days, setDays] = useState(projectedDays);
  const [comment, setComment] = useState(() => t("WorkQueue.requestReason").replace("{date}", finish));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1/schedule/tasks/${taskId}/day-requests`, { method: "POST", body: JSON.stringify({ requestDays: days, comment: comment.trim() }) });
      onSent();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("Request more days")} subtitle={`${item.reference} · ${item.title}`} onClose={onClose} footer={<>
      <span className="muted">{t("The dates change only when the PM accepts.")}</span>
      <span className="spacer" />
      <button className="btn default" type="button" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
      <button className="btn primary" type="button" disabled={busy || days < 1 || !comment.trim()} onClick={() => void send()}>
        <Icon name="send" />
        {t(busy ? "Sending…" : "Send request")}
      </button>
    </>}>
      {error ? <div className="callout danger" role="alert">{error}</div> : null}
      <div className="form-grid">
        <Field label="Extra days needed">
          <input className="num" type="number" min="1" max="3650" value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value)))} />
        </Field>
        <Field label="WorkQueue.requestWhy">
          <textarea value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Plans the effort of a whole inquiry or estimate, or of one estimate section, on the dates the work runs. */
export function EffortModal({ item, current, onClose, onSaved }: {
  item: Commitment & { effort: NonNullable<Commitment["effort"]> };
  current?: WorkloadEffort;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const fallbackDay = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [start, setStart] = useState(current?.start ?? item.start ?? fallbackDay);
  const [end, setEnd] = useState(current?.end ?? item.end ?? fallbackDay);
  const [amount, setAmount] = useState(current ? String(current.manDays) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={t("Plan effort") + " · " + item.reference} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await apiRequest(`/api/v1/resource-planning/${item.effort.kind}/${item.effort.id}`, {
              method: "PUT",
              body: JSON.stringify({ start, end, manDays: Number(amount), rowVersion: current?.rowVersion ?? null }),
            });
            await onSaved();
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{t(item.effort.kind === "EstimateSection" ? "Workload.sectionEffortHint" : "Total estimating effort, not project delivery effort. Shared equally between estimate assignees.")}</p>
        <Field label={t("Start date")}>
          <input required type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label={t("Due date")}>
          <input required type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
        <Field label={t("Man-days")}>
          <input required type="number" min="0" max="100000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        {error ? <p role="alert" className="red-text">{error}</p> : null}
        <button className="btn primary" disabled={busy}>{t("Save")}</button>
      </form>
    </Modal>
  );
}

/** My Work's "My work order": the signed-in person's own queue, read with the Workload's own rules. */
export function MyWorkQueue({ bootstrap, notify, openProjectSchedule, openEstimate }: {
  bootstrap: BootstrapData;
  notify: (message: string) => void;
  openProjectSchedule?: (id: number) => void;
  openEstimate?: (id: number) => void;
}) {
  const { t } = useLanguage();
  const me = bootstrap.user.id;
  const [data, setData] = useState<Workload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<Commitment | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadWorkload({ mine: true }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const open = (item: Commitment) => (item.type === "Project" ? openProjectSchedule?.(item.entityId) : openEstimate?.(item.entityId));
  // My Work opens plans and estimates; an inquiry opens from its own screen.
  const canOpen = (item: Commitment) => (item.type === "Project" ? Boolean(openProjectSchedule) : item.type === "Estimate" && Boolean(openEstimate));
  return (
    <Panel
      title="WorkQueue.myTitle"
      subtitle="WorkQueue.mySubtitle"
      actions={<button type="button" className="btn ghost sm" disabled={loading} onClick={() => void load()}><Icon name="refresh" />{t("Refresh")}</button>}
    >
      {error ? <div className="callout danger" role="alert">{error}</div> : null}
      {!data ? (
        <div className="empty">{loading ? <><span className="spinner" />{t("Loading…")}</> : null}</div>
      ) : (
        <WorkQueue
          items={data.items}
          order={data.priorities.find((entry) => entry.userId === me)?.keys ?? []}
          capacity={weeklyCapacity(data.capacities.find((entry) => entry.userId === me)?.daysPerWeek)}
          today={today}
          holidays={data.holidays}
          editable
          canRequestDays={bootstrap.permissions.includes("schedule.progress")}
          // An engineer plans the effort of their own estimate sections here.
          canPlanEffort={(item) => item.effort?.kind === "EstimateSection"}
          onEffort={setEdit}
          onOpen={open}
          canOpen={canOpen}
          onSaveOrder={async (keys) => {
            await saveWorkOrder(me, keys);
            setData((current) => current && { ...current, priorities: [...current.priorities.filter((entry) => entry.userId !== me), { userId: me, keys }] });
          }}
          onRequested={() => {
            notify(t("WorkQueue.requestSent"));
            void load();
          }}
        />
      )}
      {edit?.effort ? (
        <EffortModal
          item={{ ...edit, effort: edit.effort }}
          current={data?.efforts.find((entry) => entry.entityType === edit.effort!.kind && entry.entityId === edit.effort!.id)}
          onClose={() => setEdit(null)}
          onSaved={async () => { await load(); notify(t("Saved")); }}
        />
      ) : null}
    </Panel>
  );
}
