"use client";

import { Badge, Skeleton, selectRows, useViewRows } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { WORK_ORDER_ROWS } from "../fixtures/tomas-ui.rows";
import { NEXT_DUE_ROWS, URGENT_ROWS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function ViewRowsDemo() {
  const t = useT();
  const { rows } = useViewRows(WORK_ORDER, SAMPLE_ADAPTERS, NEXT_DUE_ROWS);
  const urgent = selectRows(WORK_ORDER_ROWS, URGENT_ROWS);
  return (
    <TomasUiDemo id="view-rows">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">useViewRows: {t("TUI.nextDue")}</span>
          {rows ? (
            rows.map((row) => (
              <Badge key={row.id} variant="secondary" className="justify-start">
                {String(row.code)} {String(row.due)}
              </Badge>
            ))
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">selectRows: {t("TUI.urgentOnly")}</span>
          {urgent.map((row) => (
            <Badge key={row.id} variant="destructive" className="justify-start">
              {String(row.code)} {String(row.title)}
            </Badge>
          ))}
        </div>
      </div>
    </TomasUiDemo>
  );
}
