"use client";

import { TableBuilder, type TableBuilderColumn, type TableBuilderRow } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { INSPECTION_COLUMNS, INSPECTION_ROWS } from "../fixtures/tomas-ui.sheets";
import { TomasUiDemo } from "../TomasUiDemo";

export function TableBuilderDemo() {
  const t = useT();
  const [columns, setColumns] = useState<TableBuilderColumn[]>(INSPECTION_COLUMNS);
  const [rows, setRows] = useState<TableBuilderRow[]>(INSPECTION_ROWS);
  return (
    <TomasUiDemo id="table-builder">
      <p className="text-muted-foreground text-sm">
        {t("TUI.tableBuilderNote")} {rows.length} x {columns.length}
      </p>
      <TableBuilder columns={columns} rows={rows} onColumnsChange={setColumns} onRowsChange={setRows} />
    </TomasUiDemo>
  );
}
