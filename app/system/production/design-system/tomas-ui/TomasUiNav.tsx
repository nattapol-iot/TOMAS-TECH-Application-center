"use client";

import { Badge, Button } from "@tomas-tc/ui";
import { useT } from "../../../i18n";
import { TOMAS_UI_LOOK_LABELS, TOMAS_UI_LOOKS } from "./config/tomas-ui.constants";
import { TomasUiStates } from "./TomasUiStates";
import type { TomasUiNavProps } from "./types/tomas-ui.types";

export function TomasUiNav({ sections, shown, total, look, onLookChange }: TomasUiNavProps) {
  const t = useT();
  const jump = (target: HTMLElement, id: string) => target.ownerDocument.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <nav aria-label={t("TUI.sections")} className="bg-background/95 sticky top-0 z-40 flex flex-wrap items-center gap-1 border-b px-6 py-2 backdrop-blur">
      {sections.map((section) => (
        <Button key={section.id} type="button" size="xs" variant="ghost" onClick={(event) => jump(event.currentTarget, `tui-${section.id}`)}>
          {t(section.title)}
        </Button>
      ))}
      <Button type="button" size="xs" variant="ghost" onClick={(event) => jump(event.currentTarget, "tui-not-shown")}>
        {t("TUI.notShown")}
      </Button>
      <div className="ml-auto">
        <TomasUiStates options={TOMAS_UI_LOOKS} label="TUI.look" labels={TOMAS_UI_LOOK_LABELS} value={look} onChange={onLookChange} />
      </div>
      <Badge variant="outline">
        {shown} / {total} {t("TUI.exportsShown")}
      </Badge>
    </nav>
  );
}
