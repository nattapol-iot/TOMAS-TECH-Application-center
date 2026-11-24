"use client";

import { Button } from "@tomas-tc/ui";
import { useT } from "../../../i18n";
import type { TomasUiStatesProps } from "./types/tomas-ui.types";

export function TomasUiStates<State extends string>({ options, labels, value, onChange }: TomasUiStatesProps<State>) {
  const t = useT();
  return (
    <div role="group" aria-label={t("TUI.variant")} className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <Button key={option} type="button" size="xs" variant={option === value ? "default" : "outline"} aria-pressed={option === value} onClick={() => onChange(option)}>
          {t(labels?.[option] ?? option)}
        </Button>
      ))}
    </div>
  );
}
