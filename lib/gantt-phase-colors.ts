/*
 * The colour of a plan's main heading on the Projects timeline, from what the heading is called (owner 2026-11-26: one
 * line of coloured phases per project, as in the Application team's summary): design blue, building violet, software
 * pink, internal tests crimson, installation green, teaching amber, the customer's tests orange, go live yellow. A name
 * that says none of these takes the next colour of a small palette, so neighbours still differ.
 */
export type PhaseColor = { fill: string; ink: string };

const WHITE = "#ffffff";
const KINDS: [pattern: RegExp, color: PhaseColor][] = [
  [/go[\s-]?live|hand\s?over|ส่งมอบ|ปิดงาน|ปิดโครงการ|close/i, { fill: "#eab308", ink: "#422006" }],
  [/teach|training|อบรม|สอนใช้/i, { fill: "#f59e0b", ink: "#451a03" }],
  [/user\s?test|trial|uat|sat\b|commission|ทดลองใช้|ลูกค้าทดสอบ/i, { fill: "#f97316", ink: WHITE }],
  [/install|ติดตั้ง|on\s?site|หน้างาน/i, { fill: "#16a34a", ink: WHITE }],
  [/internal|final\s?test|fat\b|test|ทดสอบ|ตรวจรับ/i, { fill: "#e11d48", ink: WHITE }],
  [/software|develop|program|coding|โปรแกรม|พัฒนา/i, { fill: "#ec4899", ink: WHITE }],
  [/hardware|order|purchase|procure|manufactur|assembl|fabricat|panel|ผลิต|สั่งซื้อ|ประกอบ/i, { fill: "#8b5cf6", ink: WHITE }],
  [/design|drawing|spec|concept|survey|kick|plan|requirement|ออกแบบ|สำรวจ|แบบ/i, { fill: "#6366f1", ink: WHITE }],
];
const PALETTE: PhaseColor[] = [
  { fill: "#0ea5e9", ink: WHITE },
  { fill: "#14b8a6", ink: WHITE },
  { fill: "#a855f7", ink: WHITE },
  { fill: "#64748b", ink: WHITE },
];

export function phaseColor(name: string, index: number): PhaseColor {
  for (const [pattern, color] of KINDS) if (pattern.test(name)) return color;
  return PALETTE[Math.abs(index) % PALETTE.length]!;
}

/** A customer's name as the timeline's card shows it: without "Co., Ltd." and the like, at most two words, in capitals. */
export function customerShort(name: string | null | undefined): string {
  const cleaned = (name ?? "")
    .replace(/บริษัท|จำกัด(\s*\(มหาชน\))?/g, " ")
    .replace(/\b(public\s+)?(company|co\.?)\s*,?\s*(limited|ltd\.?)?|\blimited\b|\bltd\.?|\binc\.?|\bcorp(oration)?\.?|\(thailand\)|\bthailand\b/gi, " ")
    .replace(/[.,()]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return cleaned.slice(0, 2).join(" ").toUpperCase();
}
