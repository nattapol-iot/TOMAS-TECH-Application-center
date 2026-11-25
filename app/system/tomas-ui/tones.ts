/** The app's tones (Badge, health, chips) as @tomas-tc/ui badge colours, for parts built on the kit. */
export type KitTone = "green" | "amber" | "red" | "slate" | "blue" | "violet";

export const TONE_BADGE: Record<KitTone, string> = {
  red: "border-transparent bg-red-100 text-red-700",
  amber: "border-transparent bg-amber-100 text-amber-800",
  blue: "border-transparent bg-sky-100 text-sky-800",
  green: "border-transparent bg-emerald-100 text-emerald-800",
  slate: "border-transparent bg-muted text-muted-foreground",
  violet: "border-transparent bg-violet-100 text-violet-800",
};

/** A figure's colour in a summary cell. */
export const TONE_TEXT: Record<KitTone, string> = {
  red: "text-red-700",
  amber: "text-amber-700",
  blue: "text-sky-700",
  green: "text-emerald-700",
  slate: "text-muted-foreground",
  violet: "text-violet-700",
};

/** The small square before a summary cell's label. */
export const TONE_DOT: Record<KitTone, string> = {
  red: "bg-red-600",
  amber: "bg-amber-500",
  blue: "bg-sky-600",
  green: "bg-emerald-600",
  slate: "bg-slate-400",
  violet: "bg-violet-600",
};
