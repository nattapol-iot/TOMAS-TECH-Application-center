import type { Tone } from "../../../ui";
import type { DesignSystemTab, ModalSize, TokenKind } from "../types/design-system.types";

export const TOKEN_KIND_ORDER: readonly TokenKind[] = ["color", "font", "type", "radius", "shadow", "size"];

export const TOKEN_PREFIX_KINDS: readonly (readonly [string, TokenKind])[] = [
  ["--font-", "font"],
  ["--fs-", "type"],
  ["--r-", "radius"],
  ["--shadow-", "shadow"],
];

export const TOKEN_KIND_TITLES: Record<Exclude<TokenKind, "color">, string> = {
  font: "DS.fonts",
  type: "DS.typeScale",
  radius: "DS.radius",
  shadow: "DS.shadows",
  size: "DS.layoutSizes",
};

export const CHART_SERIES_TOKEN = /^--c\d+$/;

export const DESIGN_SYSTEM_TABS: { id: DesignSystemTab; label: string }[] = [
  { id: "tokens", label: "DS.tabTokens" },
  { id: "components", label: "DS.tabComponents" },
  { id: "tomas-ui", label: "DS.tabTomasUi" },
];

export const SPECIMEN = "Aa Bb 123 กขค ภาษาไทย 日本語";

export const TONES = ["slate", "blue", "green", "amber", "red", "violet"] as const satisfies readonly Tone[];

export const BUTTON_VARIANTS = ["primary", "default", "ghost", "success", "warn", "danger", "teal"] as const;

export const BUTTON_SIZES = ["sm", "big"] as const;

export const PROGRESS_SAMPLES = [0, 35, 70, 100] as const;

export const MODAL_SIZES: readonly ModalSize[] = ["sm", "md", "lg", "xl"];

export const SELECT_SAMPLE = ["DS.optionAll", "DS.optionOpen", "DS.optionClosed"];

export const BAR_SAMPLE = [
  { label: "Jan", value: 12 },
  { label: "Feb", value: 18 },
  { label: "Mar", value: 9 },
  { label: "Apr", value: 22 },
  { label: "May", value: 15 },
];

export const LEGEND_SAMPLE = [{ label: "Draft" }, { label: "In Progress" }, { label: "Approved" }, { label: "Rejected" }];

export const PAGE_SAMPLE = { pageCount: 8, pageSize: 25, total: 190 };
