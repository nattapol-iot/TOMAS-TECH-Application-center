/*
 * One plan change in words, for every place that lists them: a project's Overview, My Work's history and a row's history
 * on the plan (QA and UX audit 2026-11-26: they showed actual_finish, percent_complete and a whole plan row as JSON).
 * What changed, and what it was and became when that reads as a value. A plan row stored as JSON says which of its parts
 * changed; ids (the row above, the row it follows) only say that they changed.
 */
import type { Lang } from "../i18n";

type Words = [th: string, en: string, jp: string];
const say = (lang: Lang, words: Words) => (lang === "TH" ? words[0] : lang === "JP" ? words[2] : words[1]);

/** The field names dbo.schedule_updates holds. */
export const CHANGE_FIELDS: Record<string, Words> = {
  percent_complete: ["ความคืบหน้า", "Progress", "進捗"],
  status: ["สถานะ", "Status", "状態"],
  actual_start: ["วันเริ่มจริง", "Actual start", "実開始日"],
  actual_finish: ["วันเสร็จจริง", "Actual finish", "実完了日"],
  forecast_finish: ["วันที่คาดว่าจะเสร็จ", "Forecast finish", "完了見込み"],
  blocked_reason: ["เหตุที่ติดขัด", "Blocked reason", "停止理由"],
  remark: ["หมายเหตุ", "Remark", "備考"],
  progress: ["รายงานความคืบหน้า", "Progress report", "進捗報告"],
  people: ["ปรับจำนวนคน", "People changed", "人員を変更"],
  plan: ["ปรับแผน", "Plan changed", "計画を変更"],
  plan_days: ["จำนวนวันในแผน", "Plan days", "計画日数"],
  created: ["เพิ่มแถว", "Row added", "行を追加"],
  deleted: ["ลบแถว", "Row removed", "行を削除"],
  request: ["ขอเลื่อนวัน", "Day request", "日程変更依頼"],
  request_answer: ["ตอบคำขอเลื่อนวัน", "Day request answered", "日程変更依頼に回答"],
  assign: ["มอบหมายคน", "Assigned", "担当を割当"],
  baseline: ["บันทึก Baseline", "Baseline saved", "ベースラインを保存"],
};

/** The parts of a plan row (the API's plan input, schedule-service.ts planInput) in the order a change names them. */
const PLAN_PARTS: [key: string, words: Words][] = [
  ["name", ["ชื่องาน", "name", "名称"]],
  ["planStart", ["วันเริ่ม", "start", "開始日"]],
  ["planDays", ["จำนวนวัน", "days", "日数"]],
  ["planManDays", ["ชั่วโมงแผน", "plan hours", "計画時間"]],
  ["picUserIds", ["ผู้ทำ", "member", "担当"]],
  ["picExternal", ["ฝ่าย (PIC)", "PIC", "PIC"]],
  ["discipline", ["สาขา", "discipline", "分野"]],
  ["startMode", ["วิธีเริ่ม", "start mode", "開始方法"]],
  ["predecessorId", ["งานที่ต่อจาก", "follows", "先行作業"]],
  ["lagDays", ["เว้นวัน", "gap days", "間隔日数"]],
  ["isMilestone", ["จุดสำคัญ", "milestone", "マイルストーン"]],
  ["visibility", ["การมองเห็น", "visibility", "表示範囲"]],
  ["parentId", ["ย้ายไปใต้หัวข้ออื่น", "moved under another row", "別の行の下へ移動"]],
  ["sortOrder", ["ลำดับ", "order", "順序"]],
];
/** Parts whose value is an id or a place in the list: the change is named, its value is not. */
const NAMED_ONLY = new Set(["predecessorId", "parentId", "sortOrder"]);
const DATES = new Set(["actual_start", "actual_finish", "forecast_finish"]);

export type ChangeContext = {
  lang: Lang;
  /** The app's dictionary, for statuses and disciplines. */
  t: (key: string) => string;
  /** A day as the screen shows dates. */
  day: (iso: string) => string;
  /** People's names by id, for a plan row's members; without it, a count. */
  personName?: (id: number) => string | undefined;
};

const parsed = (text: string | null | undefined): Record<string, unknown> | null => {
  if (!text || !/^\s*\{/.test(text)) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function planPart(key: string, value: unknown, context: ChangeContext): string {
  const { lang, t } = context;
  if (value === null || value === undefined || value === "") return "–";
  switch (key) {
    case "planStart":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? context.day(value.slice(0, 10)) : String(value);
    case "planDays":
    case "lagDays":
      return `${Number(value)} ${say(lang, ["วัน", "d", "日"])}`;
    case "planManDays":
      return `${Math.round(Number(value) * 8 * 10) / 10} ${say(lang, ["ชม.", "h", "時間"])}`;
    case "picUserIds": {
      const ids = Array.isArray(value) ? value.map(Number) : [];
      if (!ids.length) return "–";
      const names = context.personName ? ids.map((id) => context.personName!(id)) : [];
      return names.length && names.every(Boolean) ? names.join(", ") : `${ids.length} ${say(lang, ["คน", "people", "人"])}`;
    }
    case "isMilestone":
      return value ? say(lang, ["ใช่", "yes", "はい"]) : say(lang, ["ไม่ใช่", "no", "いいえ"]);
    case "startMode":
      return value === "linked" ? say(lang, ["ต่อจากงานก่อน", "after another row", "先行作業の後"]) : say(lang, ["กำหนดวันเอง", "own date", "日付を指定"]);
    case "discipline":
      return t(`Discipline.${String(value)}`);
    default:
      return String(value).length > 40 ? `${String(value).slice(0, 40)}…` : String(value);
  }
}

/** What changed in a plan row stored as JSON, part by part; null when the two cannot be read or nothing readable changed. */
export function planChanges(from: string | null | undefined, to: string | null | undefined, context: ChangeContext): string | null {
  const before = parsed(from),
    after = parsed(to);
  if (!before || !after) return null;
  const parts = PLAN_PARTS.filter(([key]) => !same(before[key], after[key])).map(([key, words]) =>
    NAMED_ONLY.has(key) ? say(context.lang, words) : `${say(context.lang, words)} ${planPart(key, before[key], context)} → ${planPart(key, after[key], context)}`,
  );
  return parts.length ? parts.join(" · ") : null;
}

/** A single value as it reads: a date, a percentage, a translated status; null for a value that is not one (JSON). */
function fieldValue(field: string, raw: string | null | undefined, context: ChangeContext): string | null {
  const text = (raw ?? "").trim();
  if (!text || text === "null") return "–";
  if (/^[[{]/.test(text)) return null;
  if (DATES.has(field) && /^\d{4}-\d{2}-\d{2}/.test(text)) return context.day(text.slice(0, 10));
  if (field === "percent_complete" && Number.isFinite(Number(text))) return `${Math.round(Number(text))}%`;
  if (field === "status") return context.t(text);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export const changeLabel = (field: string, lang: Lang) => (CHANGE_FIELDS[field] ? say(lang, CHANGE_FIELDS[field]) : field.replace(/_/g, " "));

/** The change in words: its name, then what changed ("วันเสร็จจริง: – → 25 พ.ย.", "ปรับแผน: วันเริ่ม 23 พ.ย. → 26 พ.ย."). */
export function changeText(entry: { field: string; from?: string | null; to?: string | null }, context: ChangeContext): string {
  const label = changeLabel(entry.field, context.lang);
  const plan = planChanges(entry.from, entry.to, context);
  if (plan) return `${label}: ${plan}`;
  const before = fieldValue(entry.field, entry.from, context),
    after = fieldValue(entry.field, entry.to, context);
  return before !== null && after !== null && before !== after ? `${label}: ${before} → ${after}` : label;
}
