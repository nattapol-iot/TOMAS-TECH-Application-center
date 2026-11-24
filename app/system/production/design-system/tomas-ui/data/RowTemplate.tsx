"use client";

import { useTemplate } from "@tomas-tc/ui";
import type { RowTemplateProps } from "../types/tomas-ui.types";

export function RowTemplate({ text }: RowTemplateProps) {
  return <span className="truncate text-sm font-medium">{useTemplate(text)}</span>;
}
