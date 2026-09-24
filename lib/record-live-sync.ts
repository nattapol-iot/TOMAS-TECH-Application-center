/*
 * When an open Estimate Cost may take in someone else's changes.
 *
 * A beat (POST /api/v1/estimates/:id/sync) says only THAT the estimate changed since a
 * cursor, and who changed it. The screen then reloads the workspace it already trusts.
 * Everything here is about doing that without ever costing the person at the keyboard
 * something they have not saved.
 *
 * The state can only fail safe:
 *   - pending is OR-ed in by beats and cleared only by a completed load, so a beat that
 *     arrives late, out of order, or after a reload can at worst ask for one reload too
 *     many -- it can never mark a change as seen that the screen has not loaded.
 *   - the cursor a beat returns is always safe to adopt: that beat's window began at or
 *     below the cursor it was sent with, so any change it moved past was counted in
 *     `changed`, and counting it set `pending`.
 */

export type RecordViewer = { userId: number; name: string; editingKey: string | null; lastAt: string };
export type SyncBeat = { cursor: string; changed: number; changedBy: string[]; viewers: RecordViewer[] };

export type LiveSyncState = {
  /** Where the next beat counts from. */
  cursor: string;
  /** Something changed that this screen has not loaded yet. */
  pending: boolean;
  /** Who changed it, gathered until the screen catches up. */
  changedBy: string[];
};

/** A freshly loaded workspace is the new baseline. */
export function afterLoad(cursor: string): LiveSyncState {
  return { cursor, pending: false, changedBy: [] };
}

export function afterBeat(state: LiveSyncState, beat: SyncBeat): LiveSyncState {
  if (beat.changed <= 0) return { ...state, cursor: beat.cursor };
  return {
    cursor: beat.cursor,
    pending: true,
    changedBy: [...new Set([...state.changedBy, ...beat.changedBy])],
  };
}

export type EditingContext = {
  /** A line, assignment or workflow dialog is open over the workspace. */
  editorOpen: boolean;
  /** Inline cells holding a value that has not been saved. */
  draftsHeld: number;
  /** The keyboard is inside a field of the workspace right now. */
  typing: boolean;
  /** The screen is itself saving or loading. */
  busy: boolean;
};

/*
 * A reload replaces the workspace object. A dialog keeps its own copy of the line, but
 * an inline cell is keyed by its line's value, so a line someone else changed remounts
 * and whatever was typed into it is gone. Hence: nothing open, nothing held, nothing
 * being typed.
 */
export function canReloadQuietly(context: EditingContext): boolean {
  return !context.editorOpen && context.draftsHeld === 0 && !context.typing && !context.busy;
}

export type ReloadDecision = "none" | "reload" | "wait";

export function reloadDecision(state: LiveSyncState, context: EditingContext): ReloadDecision {
  if (!state.pending) return "none";
  return canReloadQuietly(context) ? "reload" : "wait";
}

/** The line a viewer's editing key points at, in the words the workspace shows it by. */
export type EditingTarget = { kind: "cost" | "manhour" | "expense" | "other" | "assignment"; id: number | "new" };

export function parseEditingKey(key: string | null): EditingTarget | null {
  const match = key?.match(/^(cost|manhour|expense|other|assignment):(\d+|new)$/);
  if (!match) return null;
  return { kind: match[1] as EditingTarget["kind"], id: match[2] === "new" ? "new" : Number(match[2]) };
}

/** Other people editing the very line the caller has open. */
export function collisions(viewers: RecordViewer[], editingKey: string | null): RecordViewer[] {
  if (!editingKey || editingKey.endsWith(":new")) return [];
  return viewers.filter((viewer) => viewer.editingKey === editingKey);
}
