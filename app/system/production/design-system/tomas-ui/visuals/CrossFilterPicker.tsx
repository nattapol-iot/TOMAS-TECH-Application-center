"use client";

import { Badge, Button, CrossFilterContext, useCrossFilter } from "@tomas-tc/ui";
import { useContext } from "react";
import { useT } from "../../../../i18n";
import { URGENT_PICK } from "../fixtures/tomas-ui.screens";

export function CrossFilterPicker() {
  const t = useT();
  const { toggle, reset, changed } = useContext(CrossFilterContext);
  const { filters } = useCrossFilter("work-order");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Button size="sm" variant="outline" onClick={() => toggle(URGENT_PICK)}>
        {t("TUI.pickUrgent")}
      </Button>
      <Button size="sm" variant="ghost" disabled={!changed} onClick={reset}>
        {t("TUI.reset")}
      </Button>
      <span>useCrossFilter:</span>
      <Badge variant="secondary">
        {filters.length} {t("TUI.filters")}
      </Badge>
    </div>
  );
}
