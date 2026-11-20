/**
 * A project's purchase Units (migration 113): a Unit sits under a Module of the estimate and takes a share of its budget.
 * Shapes of GET /api/v1/projects/:id/purchase-units, and the sums the screens show from them.
 */
export const PURCHASE_DISCIPLINES = ["ME", "EE", "SW", "IN"] as const;
export const DISCIPLINE_NAME: Record<string, string> = { ME: "Mechanical", EE: "Electrical", SW: "Software", IN: "Installation" };

/** One live request raised for a Unit. `waitingLines`: lines the ERP has no PO for yet, as last synced. */
/** `needBy`: the earliest date a line still waiting is needed by (a line's own date, else the request's). */
export type PurchaseUnitRequest = { id: number; number: string; status: string; requiredDate: string | null; needBy?: string | null; amount: number; lines: number; waitingLines: number };
export type PurchaseUnit = { id: number; module: string; discipline: string; drawingNo: string; unitName: string; isGeneral: boolean; budget: number;
  requests: number; requested: number; approved: number; ordered: number; remaining: number;
  /** Lines still waiting to be ordered, and the earliest date one of them is needed by. */
  waitingLines?: number; nearestNeedBy?: string | null; requestList?: PurchaseUnitRequest[]; rowVersion: string };
export type PurchaseUnitModule = { module: string; budget: number; given: number; ungiven: number };
export type PurchaseUnitDiscipline = { discipline: string; units: number; budget: number; requested: number; approved: number; ordered: number; remaining: number;
  waitingLines?: number; nearestNeedBy?: string | null };
export type PurchaseUnits = { projectId: number; units: PurchaseUnit[]; modules: PurchaseUnitModule[]; disciplines: PurchaseUnitDiscipline[] };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** "ME · MZ08-U001 MASTER VALVE UNIT": the discipline, the drawing number, the name. The general Unit has no drawing number. */
export const unitLabel = (unit: Pick<PurchaseUnit, "discipline" | "drawingNo" | "unitName">): string =>
  `${unit.discipline} · ${[unit.drawingNo, unit.unitName].filter(Boolean).join(" ")}`;

/**
 * A Unit's budget while a request for it is on the sheet. `requested` is every live request for the Unit; a draft being
 * edited is one of them, so what it had saved (`ownSaved`) is taken out before the sheet's own total is counted.
 */
export function unitOnSheet(unit: Pick<PurchaseUnit, "budget" | "requested">, thisRequest: number, ownSaved = 0): { budget: number; requestedElsewhere: number; thisRequest: number; remaining: number; over: boolean } {
  const requestedElsewhere = round2(Math.max(0, unit.requested - ownSaved));
  const remaining = round2(unit.budget - requestedElsewhere - thisRequest);
  return { budget: unit.budget, requestedElsewhere, thisRequest: round2(thisRequest), remaining, over: thisRequest > 0 && remaining < 0 };
}

/** What a Module can still give a Unit: its budget less what its other Units already have. A Unit being edited gets its own share back first. */
export function moduleRoom(modules: PurchaseUnitModule[], module: string, ownBudget = 0): number {
  const found = modules.find((item) => item.module.toLowerCase() === module.toLowerCase());
  return found ? round2(found.ungiven + ownBudget) : 0;
}

/** Something still waiting was needed before today (both `YYYY-MM-DD`, in the business time zone). */
export const isOverdue = (nearestNeedBy: string | null | undefined, today: string): boolean => Boolean(nearestNeedBy) && String(nearestNeedBy).slice(0, 10) < today;

/** The project's line under its Units: what every Unit together was given, asked for and has left, and what is still waiting. */
export function unitTotals(units: PurchaseUnit[]): { budget: number; requested: number; approved: number; ordered: number; remaining: number; waitingLines: number; nearestNeedBy: string | null } {
  const sum = (pick: (unit: PurchaseUnit) => number) => round2(units.reduce((total, unit) => total + pick(unit), 0));
  return { budget: sum((unit) => unit.budget), requested: sum((unit) => unit.requested), approved: sum((unit) => unit.approved), ordered: sum((unit) => unit.ordered), remaining: sum((unit) => unit.remaining),
    waitingLines: units.reduce((total, unit) => total + (unit.waitingLines ?? 0), 0),
    nearestNeedBy: units.map((unit) => unit.nearestNeedBy).filter((value): value is string => Boolean(value)).sort()[0] ?? null };
}
