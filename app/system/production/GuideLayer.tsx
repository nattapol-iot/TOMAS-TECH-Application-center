"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "../api-client";
import { useLanguage, type Lang } from "../i18n";
import { Drawer, Icon, Modal } from "../ui";
import { GUIDES, guideSelector, guideText, guidesFor, type Guide } from "./guide-catalog";
import { GUIDE_PAD, guideCardPosition } from "./guide-geometry";
import "./guide.css";

/*
 * Click-through guides on the real screen (owner request 2026-10-30). The shell's "How-to guides" button opens the
 * list; a running guide lights up one element at a time (guide-catalog.ts names them) and moves on when the person
 * clicks it or presses Next. Nothing here blocks the page: the light is a hole in a dimmed layer that lets clicks
 * through, so the person does the real work while the guide watches.
 *
 * Progress goes to /api/v1/guides/progress (migration 091) so a head can see who has finished what, and a screen
 * that has a guide invites a newcomer once. A run survives a reload in the tab through sessionStorage.
 */

type GuideProgress = { guideId: string; stepReached: number; stepCount: number; startedAt: string | null; completedAt: string | null; inviteClosedAt: string | null };
type GuideEvent = "start" | "step" | "complete" | "invite-closed";
type Run = { guideId: string; index: number };
type TeamProgress = { members: Array<{ id: number; name: string; department: string; role: string }>; progress: Array<GuideProgress & { userId: number }> };

const UI = {
  TH: {
    title: "สอนการใช้งานแบบคลิกตาม",
    intro: "เลือกเรื่องที่อยากเรียน ระบบจะพาคลิกบนหน้าจอจริงทีละขั้น หยุดได้ทุกเมื่อ สิ่งที่ทำระหว่างเรียนเป็นงานจริง ถ้าแค่ฝึกให้กดยกเลิกก่อนบันทึก",
    here: "สำหรับหน้านี้", other: "บทสอนอื่น",
    size: (steps: number, minutes: number) => `${steps} ขั้น · ประมาณ ${minutes} นาที`,
    done: (date: string) => `เรียนจบแล้ว ${date}`, partial: (step: number, count: number) => `ทำถึงขั้น ${step}/${count}`, fresh: "ยังไม่เคยเรียน",
    start: "เริ่มเรียน", again: "เรียนอีกครั้ง", restart: "เริ่มใหม่",
    manual: "อ่านคู่มือฉบับเต็ม (มีภาพหน้าจอ)", team: "ความคืบหน้าของทีม", none: "ยังไม่มีบทสอนสำหรับสิทธิ์ของบัญชีนี้",
    step: (index: number, count: number) => `ขั้นที่ ${index} จาก ${count}`,
    back: "ย้อนกลับ", next: "ถัดไป", skip: "ข้ามขั้นนี้", finish: "จบบทสอน", exit: "ออกจากบทสอน",
    clickHint: "คลิกที่จุดที่ไฮไลต์เพื่อไปต่อ", waiting: "ยังไม่เห็นจุดนี้บนหน้าจอ", go: "ไปที่หน้านี้",
    inviteTitle: "ครั้งแรกในหน้านี้?", invite: (title: string, minutes: number) => `ให้ระบบสอน "${title}" แบบคลิกตามบนหน้าจอจริง ประมาณ ${minutes} นาที`,
    inviteStart: "เริ่มเลย", inviteLater: "ไม่ใช่ตอนนี้", inviteNote: "เปิดบทสอนได้ทุกเมื่อที่ปุ่ม 'สอนการใช้งาน' ด้านบน",
    doneTitle: "เรียนจบแล้ว", doneBody: (title: string) => `จบบท "${title}" แล้ว เลือกบทอื่นได้ที่ปุ่ม 'สอนการใช้งาน' ด้านบน`, more: "ดูบทอื่น", close: "ปิด",
    teamTitle: "ความคืบหน้าบทสอนของทีม", teamSubtitle: "คนที่คุณดูแลใน Team Activity", person: "พนักงาน",
    finished: (done: number, total: number) => `จบแล้ว ${done}/${total} คน`, loading: "กำลังโหลด…", failed: "โหลดไม่สำเร็จ", retry: "ลองใหม่", teamEmpty: "ยังไม่มีคนในทีมที่คุณดูแล",
    noRecord: "ยังไม่เริ่ม",
  },
  EN: {
    title: "Click-through guides",
    intro: "Pick a task to learn. The guide walks you through it on the real screen, one click at a time, and you can stop whenever you like. What you do is real work; when you are only practising, cancel before saving.",
    here: "For this screen", other: "Other guides",
    size: (steps: number, minutes: number) => `${steps} steps · about ${minutes} min`,
    done: (date: string) => `Finished ${date}`, partial: (step: number, count: number) => `Reached step ${step}/${count}`, fresh: "Not started",
    start: "Start", again: "Go through again", restart: "Start again",
    manual: "Read the full manual (with screenshots)", team: "Team progress", none: "No guide fits this account's permissions yet.",
    step: (index: number, count: number) => `Step ${index} of ${count}`,
    back: "Back", next: "Next", skip: "Skip this step", finish: "Finish", exit: "Leave the guide",
    clickHint: "Click the highlighted spot to carry on", waiting: "This part is not on the screen yet", go: "Go to this screen",
    inviteTitle: "New to this screen?", invite: (title: string, minutes: number) => `Let the guide show you "${title}" by clicking through it on the real screen. About ${minutes} min.`,
    inviteStart: "Start now", inviteLater: "Not now", inviteNote: "Guides are always under How-to guides in the top bar.",
    doneTitle: "Guide finished", doneBody: (title: string) => `You have finished "${title}". More are under How-to guides in the top bar.`, more: "More guides", close: "Close",
    teamTitle: "Team guide progress", teamSubtitle: "The people you review in Team Activity", person: "Person",
    finished: (done: number, total: number) => `${done}/${total} finished`, loading: "Loading…", failed: "Could not load", retry: "Try again", teamEmpty: "Nobody on your team yet.",
    noRecord: "Not started",
  },
  JP: {
    title: "クリックで学ぶガイド",
    intro: "学びたい作業を選ぶと、実際の画面で1ステップずつクリックしながら案内します。いつでも中断できます。操作は実際の業務になるため、練習だけの場合は保存前にキャンセルしてください。",
    here: "この画面", other: "その他のガイド",
    size: (steps: number, minutes: number) => `${steps}ステップ・約${minutes}分`,
    done: (date: string) => `${date} 完了`, partial: (step: number, count: number) => `ステップ ${step}/${count} まで`, fresh: "未受講",
    start: "開始", again: "もう一度", restart: "最初から",
    manual: "マニュアル全文を読む(画面付き)", team: "チームの進捗", none: "このアカウントの権限に合うガイドはまだありません。",
    step: (index: number, count: number) => `ステップ ${index} / ${count}`,
    back: "戻る", next: "次へ", skip: "この手順を飛ばす", finish: "完了", exit: "ガイドを終了",
    clickHint: "強調表示の箇所をクリックして進みます", waiting: "この箇所はまだ画面にありません", go: "この画面へ",
    inviteTitle: "この画面は初めてですか?", invite: (title: string, minutes: number) => `「${title}」を実際の画面でクリックしながら案内します。約${minutes}分。`,
    inviteStart: "開始する", inviteLater: "今はしない", inviteNote: "ガイドは上部バーの「使い方ガイド」からいつでも開けます。",
    doneTitle: "ガイド完了", doneBody: (title: string) => `「${title}」を完了しました。他のガイドは上部バーの「使い方ガイド」から。`, more: "他のガイド", close: "閉じる",
    teamTitle: "チームのガイド進捗", teamSubtitle: "チーム利用状況で担当しているメンバー", person: "メンバー",
    finished: (done: number, total: number) => `${done}/${total}人完了`, loading: "読み込み中…", failed: "読み込めませんでした", retry: "再試行", teamEmpty: "担当メンバーはまだいません。",
    noRecord: "未受講",
  },
} as const;

type Copy = (typeof UI)[Lang];

const RUN_KEY = (userId: number) => `tomas-tech-guide-run:${userId}`;
const ANSWERED_KEY = (userId: number) => `tomas-tech-guide-invite:${userId}`;

function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string | null) {
  try { if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, value); } catch { /* private window: the run just does not survive a reload */ }
}
function readRun(userId: number): Run | null {
  try {
    const value = JSON.parse(readSession(RUN_KEY(userId)) ?? "null") as Run | null;
    const guide = GUIDES.find((item) => item.id === value?.guideId);
    return guide && value && Number.isInteger(value.index) && value.index >= 0 && value.index < guide.steps.length ? value : null;
  } catch { return null; }
}

const shortDate = (iso: string, lang: Lang) => new Date(iso).toLocaleDateString(lang === "TH" ? "th-TH" : lang === "JP" ? "ja-JP" : "en-GB", { day: "numeric", month: "short" });

/** The first element a target names that takes up room on the screen; a closed <details> or a hidden menu has none. */
function findVisible(target: string): HTMLElement | null {
  let elements: NodeListOf<HTMLElement>;
  try { elements = document.querySelectorAll<HTMLElement>(guideSelector(target)); } catch { return null; }
  for (const element of elements) {
    if (element.closest(".guide-layer")) continue;
    const rect = element.getBoundingClientRect();
    if ((rect.width > 0 || rect.height > 0) && rect.right > 0 && rect.left < window.innerWidth) return element;
  }
  return null;
}

/** Light the target and put the card next to it (guide-geometry.ts). Written straight to the DOM every frame, not through state. */
function place(spot: HTMLElement | null, card: HTMLElement | null, rect: DOMRect | null) {
  const pad = GUIDE_PAD;
  if (spot) {
    const box = rect ? `translate(${Math.round(rect.left - pad)}px, ${Math.round(rect.top - pad)}px)` : "";
    if (spot.style.transform !== box) spot.style.transform = box;
    const width = rect ? `${Math.round(rect.width + pad * 2)}px` : "0px", height = rect ? `${Math.round(rect.height + pad * 2)}px` : "0px";
    if (spot.style.width !== width) spot.style.width = width;
    if (spot.style.height !== height) spot.style.height = height;
    spot.hidden = !rect;
  }
  if (!card) return;
  const { left, top } = guideCardPosition(rect, { width: card.offsetWidth, height: card.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
  const value = `translate(${left}px, ${top}px)`;
  if (card.style.transform !== value) card.style.transform = value;
}

export function GuideLayer({ view, permissions, userId, open, onOpen, onClose, goTo }: {
  view: string;
  permissions: readonly string[];
  userId: number;
  /** The list of guides, opened by the shell's "How-to guides" button. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  goTo: (view: string) => void;
}) {
  const { lang } = useLanguage();
  const copy = UI[lang];
  const available = useMemo(() => guidesFor(permissions), [permissions]);
  const [progress, setProgress] = useState<Map<string, GuideProgress> | null>(null);
  const [run, setRunState] = useState<Run | null>(() => readRun(userId));
  const [finished, setFinished] = useState<Guide | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [answered, setAnswered] = useState(() => readSession(ANSWERED_KEY(userId)) === "1");
  const [inviteShown, setInviteShown] = useState<string | null>(null);
  const reached = useRef<{ guideId: string; step: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ items: GuideProgress[] }>("/api/v1/guides/progress")
      .then((result) => { if (!cancelled) setProgress(new Map(result.items.map((item) => [item.guideId, item]))); })
      // Without the record, no screen invites anyone: better silent than asking again every visit.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const report = useCallback((guide: Guide, event: GuideEvent, step = 0) => {
    void apiRequest<GuideProgress>("/api/v1/guides/progress", { method: "POST", body: JSON.stringify({ guideId: guide.id, event, step, stepCount: guide.steps.length }) })
      .then((saved) => setProgress((current) => new Map(current ?? []).set(saved.guideId, saved)))
      .catch(() => undefined);
  }, []);

  const setRun = useCallback((next: Run | null) => {
    setRunState(next);
    writeSession(RUN_KEY(userId), next ? JSON.stringify(next) : null);
  }, [userId]);

  const answer = useCallback(() => { setAnswered(true); writeSession(ANSWERED_KEY(userId), "1"); }, [userId]);

  const start = useCallback((guide: Guide) => {
    reached.current = { guideId: guide.id, step: 0 };
    setFinished(null);
    setRun({ guideId: guide.id, index: 0 });
    report(guide, "start");
    answer();
    onClose();
  }, [answer, onClose, report, setRun]);

  const running = run ? GUIDES.find((guide) => guide.id === run.guideId) ?? null : null;

  const moveTo = useCallback((index: number) => {
    if (!running) return;
    setRun({ guideId: running.id, index });
    const best = reached.current?.guideId === running.id ? reached.current.step : 0;
    if (index > best) { reached.current = { guideId: running.id, step: index }; report(running, "step", index); }
  }, [report, running, setRun]);

  const finish = useCallback(() => {
    if (!running) return;
    report(running, "complete");
    setRun(null);
    setFinished(running);
  }, [report, running, setRun]);

  // A screen with a guide the person has never seen invites them once, a moment after it opens; one answer per session.
  const invited = !run && !open && !teamOpen && progress && !answered ? available.find((guide) => guide.invite === view && !progress.has(guide.id)) ?? null : null;
  const inviteKey = invited ? `${view}:${invited.id}` : null;
  useEffect(() => {
    if (!inviteKey) return;
    const timer = window.setTimeout(() => setInviteShown(inviteKey), 1500);
    return () => window.clearTimeout(timer);
  }, [inviteKey]);

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => setFinished(null), 9000);
    return () => window.clearTimeout(timer);
  }, [finished]);

  return <>
    {open ? <GuidePanel copy={copy} lang={lang} view={view} guides={available} progress={progress} canSeeTeam={permissions.includes("performance.manage")}
      onStart={start} onClose={onClose} onTeam={() => { onClose(); setTeamOpen(true); }} onManual={() => { onClose(); goTo("manual"); }} /> : null}
    {teamOpen ? <GuideTeamModal copy={copy} lang={lang} onClose={() => setTeamOpen(false)} /> : null}
    {running && run ? <GuideRunner key={running.id} guide={running} index={run.index} copy={copy} lang={lang} view={view}
      onStep={moveTo} onExit={() => setRun(null)} onFinish={finish} goTo={goTo} /> : null}
    {invited && inviteShown === inviteKey ? createPortal(<aside className="guide-layer guide-card" role="status" aria-label={copy.inviteTitle}>
      <Icon name="play" />
      <div>
        <strong>{copy.inviteTitle}</strong>
        <p>{copy.invite(guideText(invited.title, lang), invited.minutes)}</p>
        <small>{copy.inviteNote}</small>
        <div className="guide-card-actions">
          <button className="btn primary sm" type="button" onClick={() => start(invited)}><Icon name="play" />{copy.inviteStart}</button>
          <button className="btn ghost sm" type="button" onClick={() => { report(invited, "invite-closed"); answer(); }}>{copy.inviteLater}</button>
        </div>
      </div>
    </aside>, document.body) : null}
    {finished ? createPortal(<aside className="guide-layer guide-card done" role="status" aria-label={copy.doneTitle}>
      <Icon name="checkCircle" />
      <div>
        <strong>{copy.doneTitle}</strong>
        <p>{copy.doneBody(guideText(finished.title, lang))}</p>
        <div className="guide-card-actions">
          <button className="btn default sm" type="button" onClick={() => { setFinished(null); onOpen(); }}>{copy.more}</button>
          <button className="btn ghost sm" type="button" onClick={() => setFinished(null)}>{copy.close}</button>
        </div>
      </div>
    </aside>, document.body) : null}
  </>;
}

function GuideStatus({ copy, lang, guide, record }: { copy: Copy; lang: Lang; guide: Guide; record: GuideProgress | undefined }) {
  if (record?.completedAt) return <span className="guide-status done"><Icon name="checkCircle" />{copy.done(shortDate(record.completedAt, lang))}</span>;
  if (record?.startedAt) return <span className="guide-status partial">{copy.partial(Math.min(record.stepReached + 1, guide.steps.length), guide.steps.length)}</span>;
  return <span className="guide-status">{copy.fresh}</span>;
}

function GuidePanel({ copy, lang, view, guides, progress, canSeeTeam, onStart, onClose, onTeam, onManual }: {
  copy: Copy; lang: Lang; view: string; guides: readonly Guide[]; progress: Map<string, GuideProgress> | null; canSeeTeam: boolean;
  onStart: (guide: Guide) => void; onClose: () => void; onTeam: () => void; onManual: () => void;
}) {
  const here = guides.filter((guide) => guide.views.includes(view));
  const other = guides.filter((guide) => !guide.views.includes(view));
  const item = (guide: Guide) => {
    const record = progress?.get(guide.id);
    return <li key={guide.id} className="guide-item">
      <div>
        <strong>{guideText(guide.title, lang)}</strong>
        <p>{guideText(guide.summary, lang)}</p>
        <div className="guide-item-meta"><span>{copy.size(guide.steps.length, guide.minutes)}</span><GuideStatus copy={copy} lang={lang} guide={guide} record={record} /></div>
      </div>
      <button className={record?.completedAt ? "btn default sm" : "btn primary sm"} type="button" onClick={() => onStart(guide)}>
        <Icon name="play" />{record?.completedAt ? copy.again : record?.startedAt ? copy.restart : copy.start}
      </button>
    </li>;
  };
  return <Drawer title={copy.title} onClose={onClose} width={460} footer={<>
    <button className="btn ghost" type="button" onClick={onManual}><Icon name="book" />{copy.manual}</button>
    <span className="spacer" />
    {canSeeTeam ? <button className="btn default" type="button" onClick={onTeam}><Icon name="users" />{copy.team}</button> : null}
  </>}>
    <div className="guide-panel">
      <p className="guide-intro">{copy.intro}</p>
      {!guides.length ? <p className="muted">{copy.none}</p> : null}
      {here.length ? <section><h3>{copy.here}</h3><ul>{here.map(item)}</ul></section> : null}
      {other.length ? <section><h3>{here.length ? copy.other : copy.title}</h3><ul>{other.map(item)}</ul></section> : null}
    </div>
  </Drawer>;
}

function GuideTeamModal({ copy, lang, onClose }: { copy: Copy; lang: Lang; onClose: () => void }) {
  const [state, setState] = useState<{ data: TeamProgress | null; error: boolean }>({ data: null, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<TeamProgress>("/api/v1/guides/team")
      .then((data) => { if (!cancelled) setState({ data, error: false }); })
      .catch(() => { if (!cancelled) setState({ data: null, error: true }); });
    return () => { cancelled = true; };
  }, [attempt]);
  const records = useMemo(() => new Map((state.data?.progress ?? []).map((row) => [`${row.userId}:${row.guideId}`, row])), [state.data]);
  const members = state.data?.members ?? [];
  return <Modal title={copy.teamTitle} subtitle={copy.teamSubtitle} size="xl" onClose={onClose}>
    {state.error ? <div className="info-strip red" role="alert"><Icon name="alertTriangle" /><span>{copy.failed}</span>
      <button className="btn default sm" type="button" onClick={() => { setState({ data: null, error: false }); setAttempt((value) => value + 1); }}>{copy.retry}</button></div>
      : !state.data ? <p className="muted" role="status">{copy.loading}</p>
        : !members.length ? <p className="muted">{copy.teamEmpty}</p>
          : <div className="table-wrap guide-team"><table>
            <thead><tr><th>{copy.person}</th>{GUIDES.map((guide) => <th key={guide.id} className="wrap">{guideText(guide.title, lang)}</th>)}</tr></thead>
            <tbody>{members.map((member) => <tr key={member.id}>
              <td><div className="cell-primary"><strong>{member.name}</strong><span>{member.department} · {member.role}</span></div></td>
              {GUIDES.map((guide) => {
                const record = records.get(`${member.id}:${guide.id}`);
                return <td key={guide.id}>{record?.completedAt
                  ? <span className="guide-status done"><Icon name="checkCircle" />{shortDate(record.completedAt, lang)}</span>
                  : record?.startedAt ? <span className="guide-status partial">{Math.min(record.stepReached + 1, record.stepCount)}/{record.stepCount}</span>
                    : <span className="guide-status">—</span>}</td>;
              })}
            </tr>)}</tbody>
            <tfoot><tr><th>{copy.person}</th>{GUIDES.map((guide) => <th key={guide.id}>{copy.finished(members.filter((member) => records.get(`${member.id}:${guide.id}`)?.completedAt).length, members.length)}</th>)}</tr></tfoot>
          </table></div>}
  </Modal>;
}

function GuideRunner({ guide, index, copy, lang, view, onStep, onExit, onFinish, goTo }: {
  guide: Guide; index: number; copy: Copy; lang: Lang; view: string;
  onStep: (index: number) => void; onExit: () => void; onFinish: () => void; goTo: (view: string) => void;
}) {
  const step = guide.steps[index]!;
  const last = index === guide.steps.length - 1;
  const spotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  // Back to a step whose target has gone (the form was left) must not bounce forward again.
  const steppedBack = useRef<number | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [state, setState] = useState<{ index: number; found: boolean; missing: boolean }>({ index, found: false, missing: false });
  const titleId = useId(), bodyId = useId();

  const advance = useCallback(() => { if (last) onFinish(); else onStep(index + 1); }, [index, last, onFinish, onStep]);

  useEffect(() => {
    let frame = 0, lostAt = performance.now(), scrolled = false, checkedAt = 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tick = (now: number) => {
      const element = step.target ? findVisible(step.target) : null;
      targetRef.current = element;
      // A modal <dialog> sits in the browser's top layer, above any z-index: the guide draws inside it instead.
      const nextHost = element?.closest("dialog[open]") ?? document.querySelector("dialog[open]") ?? document.body;
      setHost((current) => current === nextHost ? current : nextHost);
      let missing = false;
      if (element) {
        lostAt = now;
        if (!scrolled) {
          scrolled = true;
          const rect = element.getBoundingClientRect();
          if (rect.top < 64 || rect.bottom > window.innerHeight - 24) element.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
        }
      } else if (step.target && now - lostAt > 600) {
        missing = true;
        // The person got ahead of the guide (opened the form first, or the copy opened the estimate at once): follow them.
        if (steppedBack.current !== index && now - checkedAt > 300) {
          checkedAt = now;
          const ahead = guide.steps.findIndex((candidate, at) => at > index && at <= index + 4 && candidate.view === view && candidate.target !== undefined && findVisible(candidate.target) !== null);
          if (ahead > index) { onStep(ahead); return; }
        }
      }
      setState((current) => current.index === index && current.found === Boolean(element) && current.missing === missing ? current : { index, found: Boolean(element), missing });
      place(spotRef.current, cardRef.current, element?.getBoundingClientRect() ?? null);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [guide, index, onStep, step, view]);

  // A click step moves on once the page has handled the click (the button may open the next screen).
  useEffect(() => {
    if (step.action !== "click" || !step.target) return;
    const onClick = (event: MouseEvent) => {
      const element = targetRef.current;
      if (!element || !(event.target instanceof Node)) return;
      const zones = step.clickOn ? Array.from(element.querySelectorAll(step.clickOn)) : [element];
      if (zones.some((zone) => zone.contains(event.target as Node))) window.setTimeout(advance, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [advance, step]);

  const current = state.index === index ? state : { index, found: false, missing: false };
  const text = (value: { th: string; en: string; jp: string }) => guideText(value, lang);
  const back = () => { steppedBack.current = index - 1; onStep(index - 1); };
  if (!host) return null;
  return createPortal(<div className="guide-layer">
    <div ref={spotRef} className={`guide-spot${step.action === "click" ? " click" : ""}`} hidden aria-hidden="true" />
    <div ref={cardRef} className="guide-pop" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId}>
      <div className="guide-pop-head">
        <span>{copy.step(index + 1, guide.steps.length)} · {text(guide.title)}</span>
        <button className="icon-btn" type="button" aria-label={copy.exit} title={copy.exit} onClick={onExit}><Icon name="x" /></button>
      </div>
      <div className="guide-pop-bar" aria-hidden="true"><i style={{ width: `${((index + 1) / guide.steps.length) * 100}%` }} /></div>
      <strong id={titleId}>{text(step.title)}</strong>
      <p id={bodyId} aria-live="polite">{text(step.body)}</p>
      {current.missing ? <p className="guide-pop-missing"><Icon name="alertCircle" />{step.missing ? text(step.missing) : copy.waiting}</p>
        : step.action === "click" && current.found && !last ? <p className="guide-pop-hint"><Icon name="arrowRight" />{copy.clickHint}</p> : null}
      <div className="guide-pop-actions">
        {index > 0 ? <button className="btn ghost sm" type="button" onClick={back}><Icon name="arrowLeft" />{copy.back}</button> : null}
        {current.missing && step.canGo ? <button className="btn default sm" type="button" onClick={() => { goTo(step.view); advance(); }}>{copy.go}</button> : null}
        <span className="spacer" />
        {step.action === "click" && !last
          ? <button className="btn ghost sm" type="button" onClick={advance}>{copy.skip}</button>
          : <button className="btn primary sm" type="button" onClick={advance}>{last ? copy.finish : copy.next}{last ? null : <Icon name="arrowRight" />}</button>}
      </div>
    </div>
  </div>, host);
}
