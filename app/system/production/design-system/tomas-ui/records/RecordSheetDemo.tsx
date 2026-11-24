"use client";

import { Button, RecordSheet, toast, useOpenRecord } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { SAMPLE_ENTITIES, WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { WORK_ORDER_ROWS } from "../fixtures/tomas-ui.rows";
import { TomasUiDemo } from "../TomasUiDemo";

export function RecordSheetDemo() {
  const t = useT();
  const record = useOpenRecord(WORK_ORDER);
  return (
    <TomasUiDemo id="record-sheet">
      <div className="flex flex-wrap gap-2">
        {WORK_ORDER_ROWS.slice(0, 4).map((row) => (
          <Button key={row.id} size="sm" variant="outline" onClick={() => record.open(row.id)}>
            {String(row.code)}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => record.open("wo-3", "activity")}>
          WO-0103 · {t("TUI.activity")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => record.open("wo-404")}>
          {t("TUI.missingRecord")}
        </Button>
      </div>
      <RecordSheet entities={SAMPLE_ENTITIES} adapters={SAMPLE_ADAPTERS} target={record.target} onClose={record.close} onEdit={(id) => toast(`${t("TUI.editWorkOrder")} ${id}`)} />
    </TomasUiDemo>
  );
}
