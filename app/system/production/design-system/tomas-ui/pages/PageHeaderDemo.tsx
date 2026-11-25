"use client";

import { Button, PageActions, PageHeader, toast, type PageMenuAction } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { PAGE_ACTION_COUNTS, PAGE_ACTION_COUNT_LABELS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import type { PageActionCount } from "../types/tomas-ui.types";

export function PageHeaderDemo() {
  const t = useT();
  const [count, setCount] = useState<PageActionCount>("many");
  const [exporting, setExporting] = useState(false);
  const actions: PageMenuAction[] = [
    {
      label: t("TUI.exportCsv"),
      loading: exporting,
      onSelect: () => {
        setExporting(true);
        setTimeout(() => {
          setExporting(false);
          toast.success(t("TUI.done"));
        }, 800);
      },
    },
    { label: t("DS.tuiDuplicate"), onSelect: () => toast(t("DS.tuiDuplicate")) },
    { label: t("DS.tuiDelete"), destructive: true, onSelect: () => toast.error(t("DS.tuiDelete")) },
  ];
  return (
    <TomasUiDemo id="page-header">
      <TomasUiStates options={PAGE_ACTION_COUNTS} labels={PAGE_ACTION_COUNT_LABELS} value={count} onChange={setCount} />
      <div className="rounded-lg border p-4">
        <PageHeader
          actions={
            <PageActions
              more={count === "none" ? [] : count === "one" ? actions.slice(0, 1) : actions}
              primary={<Button onClick={() => toast(t("TUI.newWorkOrder"))}>{t("TUI.newWorkOrder")}</Button>}
            />
          }
        >
          <h3 className="text-lg font-semibold">{t("TUI.workOrders")}</h3>
          <p className="text-muted-foreground text-sm">{t("TUI.pageHeaderNote")}</p>
        </PageHeader>
      </div>
    </TomasUiDemo>
  );
}
