"use client";
/*
 * The plan's view of everyone's time (owner decisions 2026-11-25, lib/capacity-plan.ts): Team overview's board read over
 * the plan's dates, so the Sheet can say for each row how many hours a day it takes and whether its member's free time
 * holds them. Reading the board needs team.board, which everyone holds (migration 085); without it, or when the read
 * fails, the Sheet still works and the two columns stay empty.
 */
import { useEffect, useState } from "react";
import { apiRequest } from "../api-client";
import { FORECAST_HORIZON_DAYS, type BoardCapacity } from "../../../lib/capacity-plan";
import { dateFromDay, dayNumber, type AwaySpan, type Commitment } from "../../../lib/resource-planning";

/** The longest window Team overview's board reads (backend-node/src/routes/team-board.ts MAX_WINDOW_DAYS). */
export const BOARD_MAX_DAYS = 400;

type BoardResponse = {
  items: Commitment[];
  capacities: { userId: number; daysPerWeek: number }[];
  holidays: string[];
  tasks: { kind: string; status: string; assigneeIds: number[]; startDate: string | null; endDate: string | null; slot: string }[];
  away: { userId: number; start: string | null; end: string | null }[];
};

/** The board's time away as awayByDate reads it: days away, and Away team tasks (a morning or an afternoon is half a day). */
export function boardAway(board: Pick<BoardResponse, "tasks" | "away">): AwaySpan[] {
  return [
    ...board.away.map((span) => ({ userId: span.userId, start: span.start, end: span.end, slot: "Day" })),
    ...board.tasks
      .filter((task) => task.kind === "Away" && task.status !== "Cancelled")
      .flatMap((task) => task.assigneeIds.map((userId) => ({ userId, start: task.startDate, end: task.endDate, slot: task.slot }))),
  ];
}

/** The window to read: from the plan's first day (today when it began earlier) to its last day and the forecast horizon, at most 400 days. */
export function boardWindow(first: string | null, last: string | null, today: string): { from: string; to: string } | null {
  if (!first || !last) return null;
  const from = first > today ? first : today;
  const end = dayNumber(last > from ? last : from) + 120;
  const to = Math.min(end, dayNumber(from) + Math.min(BOARD_MAX_DAYS, FORECAST_HORIZON_DAYS));
  return { from, to: dateFromDay(to) };
}

export type PlanCapacity = { status: "loading" | "ready" | "unavailable"; board: BoardCapacity | null };

/** Team overview's board over the plan's dates; read again whenever `version` changes (a saved plan change). */
export function usePlanCapacity(window: { from: string; to: string } | null, version: string): PlanCapacity {
  const [state, setState] = useState<PlanCapacity>({ status: "loading", board: null });
  const from = window?.from ?? null,
    to = window?.to ?? null;
  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    apiRequest<BoardResponse>(`/api/v1/team-board?from=${from}&to=${to}`)
      .then((board) => {
        if (cancelled) return;
        setState({ status: "ready", board: { items: board.items, capacities: board.capacities, holidays: board.holidays, away: boardAway(board) } });
      })
      .catch(() => {
        if (!cancelled) setState((current) => (current.board ? current : { status: "unavailable", board: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, version]);
  // A plan with no dates has nothing to read.
  return from && to ? state : { status: "unavailable", board: null };
}
