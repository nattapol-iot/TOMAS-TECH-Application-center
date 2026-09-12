export type MyWorkExpansion = Record<string, boolean>;

export function parseMyWorkExpansion(stored: string | null): MyWorkExpansion {
  if (!stored) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return {};
  }
}

export const canFinishWork = (initialStatus: string): boolean => initialStatus !== "Blocked";

export const needsZeroProgressFinishConfirmation = (initialPercent: number, nextStatus: string): boolean =>
  initialPercent === 0 && nextStatus === "Done";

type SortMode = "priority" | "due" | "project";

type SortableWorkGroup = {
  urgency: number;
  nearestDue: string | null;
  updatedAt: string;
};

export function sortMyWorkGroups<T extends { group: SortableWorkGroup }>(
  groups: readonly T[],
  mode: SortMode,
  projectKey: (entry: T) => string,
): T[] {
  const result = [...groups];
  if (mode === "project") return result.sort((left, right) => projectKey(left).localeCompare(projectKey(right), undefined, { numeric: true }));
  if (mode === "due") return result.sort((left, right) => (left.group.nearestDue ?? "9999-12-31").localeCompare(right.group.nearestDue ?? "9999-12-31"));
  return result.sort((left, right) => left.group.urgency - right.group.urgency
    || (left.group.nearestDue ?? "9999-12-31").localeCompare(right.group.nearestDue ?? "9999-12-31")
    || Date.parse(left.group.updatedAt) - Date.parse(right.group.updatedAt));
}
