"use client";

import { PivotTable, useUiIntl, type PivotOrientation } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { PIVOT_STORAGE_KEY } from "../config/tomas-ui.constants";
import { PIVOT_PERIODS, PIVOT_SERIES, PIVOT_TOTALS, pivotCost } from "../fixtures/tomas-ui.sheets";
import { TomasUiDemo } from "../TomasUiDemo";

export function PivotTableDemo() {
  const t = useT();
  const intl = useUiIntl();
  const [orientation, setOrientation] = useState<PivotOrientation>("series-rows");
  return (
    <TomasUiDemo id="pivot-table">
      <p className="text-muted-foreground text-sm">
        {t("TUI.pivotNote")} <code className="font-mono text-xs">{orientation}</code>
      </p>
      <PivotTable
        series={PIVOT_SERIES}
        periods={PIVOT_PERIODS}
        value={pivotCost}
        totals={PIVOT_TOTALS}
        format={(amount) => intl.formatNumber(amount)}
        seriesHeader={t("TUI.costLine")}
        periodHeader={t("TUI.month")}
        totalLabel={t("TUI.grandTotal")}
        storageKey={PIVOT_STORAGE_KEY}
        swappable
        orientation={orientation}
        onOrientationChange={setOrientation}
      />
    </TomasUiDemo>
  );
}
