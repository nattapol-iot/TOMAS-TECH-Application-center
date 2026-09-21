/**
 * Merged ERP lines.
 *
 * A group says how cost lines are written on the ERP sheet and nothing else. The
 * lines keep their own amounts, categories and identities, so the estimate still
 * reconciles line by line — only the sheet shows one row where a group exists.
 */

export type ErpGroupMember = { sourceType: string; sourceId: number };

export type ErpGroup = {
  id: number;
  title: string;
  quantity: number;
  unit: string;
  members: ErpGroupMember[];
  rowVersion: string;
};

export const erpMemberKey = (member: { sourceType: string; sourceId: number | null }) => `${member.sourceType}:${member.sourceId ?? ""}`;

/** Every merged line indexed by the members it holds. */
export function erpGroupsByMember(groups: readonly ErpGroup[]): Map<string, ErpGroup> {
  const index = new Map<string, ErpGroup>();
  for (const group of groups) for (const member of group.members) index.set(erpMemberKey(member), group);
  return index;
}

type FoldableLine = {
  sourceType: string;
  sourceId: number | null;
  description: string;
  amount: number;
  erpCategory: string;
  unitPrice?: number | null;
  quantity?: number | null;
  unit?: string | null;
  remark?: string | null;
  item?: string | number | null;
  modelPartNumber?: string | null;
  supplier?: string | null;
  brand?: string | null;
  leadTime?: string | null;
  quoteRevision?: string | null;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * One row per merged line, in the position of its first member.
 *
 * A group whose members no longer agree on an ERP category is left unfolded: the
 * sheet must never move money between categories to tidy up a name. Fields that
 * belong to a single item — supplier, brand, part number — are dropped rather
 * than guessed from whichever member happened to come first, and the members'
 * own descriptions are kept in the remark so nothing disappears.
 */
export function foldErpGroupLines<T extends FoldableLine>(lines: readonly T[], groups: readonly ErpGroup[]): T[] {
  if (!groups.length) return [...lines];
  const index = erpGroupsByMember(groups);
  const membersOf = new Map<number, T[]>();
  for (const line of lines) {
    const group = index.get(erpMemberKey(line));
    if (!group) continue;
    const collected = membersOf.get(group.id) ?? [];
    collected.push(line);
    membersOf.set(group.id, collected);
  }
  const folded: T[] = [];
  const done = new Set<number>();
  for (const line of lines) {
    const group = index.get(erpMemberKey(line));
    const members = group ? membersOf.get(group.id) ?? [] : [];
    if (!group || members.length < 2 || new Set(members.map((member) => member.erpCategory)).size !== 1) {
      folded.push(line);
      continue;
    }
    if (done.has(group.id)) continue;
    done.add(group.id);
    const amount = members.reduce((total, member) => total + member.amount, 0);
    folded.push({
      ...line,
      description: group.title,
      amount,
      quantity: group.quantity,
      unit: group.unit,
      unitPrice: money(amount / group.quantity),
      item: null,
      modelPartNumber: null,
      supplier: null,
      brand: null,
      leadTime: null,
      quoteRevision: null,
      remark: members.map((member) => member.description).join("; "),
    } as T);
  }
  return folded;
}
