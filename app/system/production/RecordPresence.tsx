"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { RecordViewer } from "../../../lib/record-live-sync";
import { LocalizedText } from "../LocalizedText";
import { useT } from "../i18n";
import { Avatar } from "../ui";

/* --------------------------------------------------------------------------
 * Unsaved inline values.
 *
 * A background reload remounts any cell whose line someone else changed -- the cells
 * are keyed by their line's value -- and a remount discards what was typed into it.
 * A cell that is holding a value it has not saved says so here, and the workspace
 * waits for it rather than reloading underneath it.
 * ------------------------------------------------------------------------ */

type DraftHolds = { hold(token: symbol): void; release(token: symbol): void; count(): number };

const DraftHoldContext = createContext<DraftHolds | null>(null);
export const DraftHoldProvider = DraftHoldContext.Provider;

function createDraftHolds(): DraftHolds {
  const held = new Set<symbol>();
  return { hold: (token) => { held.add(token); }, release: (token) => { held.delete(token); }, count: () => held.size };
}

/** One registry for the lifetime of a workspace. */
export function useDraftHolds(): DraftHolds {
  const [holds] = useState(createDraftHolds);
  return holds;
}

/** Called by an inline cell with whether it currently holds an unsaved value. */
export function useDraftHold(dirty: boolean): void {
  const holds = useContext(DraftHoldContext);
  useEffect(() => {
    if (!dirty || !holds) return;
    const token = Symbol("draft");
    holds.hold(token);
    return () => holds.release(token);
  }, [dirty, holds]);
}

/**
 * Any modal or drawer open anywhere -- including one a child component opened itself,
 * whose state the workspace never sees. Both render role="dialog" aria-modal="true".
 */
export function anyDialogOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** Whether the keyboard is in a field inside `root` right now. */
export function typingInside(root: HTMLElement | null): boolean {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (!root || !active || !root.contains(active)) return false;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    || active instanceof HTMLSelectElement || (active as HTMLElement).isContentEditable;
}

/* --------------------------------------------------------------------------
 * The heartbeat.
 *
 * Beats while the tab is visible, not at all while it is hidden -- a backgrounded tab
 * is not someone "here" and should not cost the server a request -- and once at once
 * when it becomes visible again. A beat never overlaps the previous one.
 * ------------------------------------------------------------------------ */

export function useHeartbeat(enabled: boolean, intervalMs: number, beat: () => Promise<void>, leave?: () => void): void {
  const latest = useRef({ beat, leave });
  useEffect(() => { latest.current = { beat, leave }; });
  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    let stopped = false;
    const run = () => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      latest.current.beat().catch(() => undefined).finally(() => { inFlight = false; });
    };
    const first = window.setTimeout(run, 0);
    const timer = window.setInterval(run, intervalMs);
    const visible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      latest.current.leave?.();
    };
  }, [enabled, intervalMs]);
}

/* --------------------------------------------------------------------------
 * Who else is here.
 * ------------------------------------------------------------------------ */

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

const SHOWN = 4;

/**
 * The people who have this record open besides the viewer. Renders nothing when the
 * viewer is alone: "only you" is not news, and a permanent empty strip is noise.
 */
export function RecordViewers({ viewers, describe }: {
  viewers: RecordViewer[];
  /** The line a viewer's editing key points at, in the words the screen uses for it. */
  describe?: (editingKey: string) => string | null;
}) {
  const t = useT();
  if (!viewers.length) return null;
  const titleOf = (viewer: RecordViewer) => {
    const target = viewer.editingKey && describe ? describe(viewer.editingKey) : null;
    return target ? `${viewer.name} · ${t("editing now")} ${target}` : viewer.name;
  };
  const shown = viewers.slice(0, SHOWN);
  return <div className="record-viewers" role="status" aria-live="polite">
    <span className="record-viewers-label"><LocalizedText text={"Also here now"} /></span>
    <span className="record-viewers-faces">
      {shown.map((viewer) => <span key={viewer.userId} className={viewer.editingKey ? "record-viewer editing" : "record-viewer"}>
        <Avatar initials={initialsOf(viewer.name)} name={titleOf(viewer)} />
      </span>)}
      {viewers.length > SHOWN ? <span className="record-viewer more" title={viewers.slice(SHOWN).map(titleOf).join("\n")}>+{viewers.length - SHOWN}</span> : null}
    </span>
    <span className="record-viewers-names">{shown.map((viewer) => viewer.name).join(", ")}</span>
  </div>;
}
