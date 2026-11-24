"use client";

import { FieldCell, TONE_BADGE_CLASS, TONE_FILL_CLASS, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn, columnScales } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { WORK_ORDER_ROWS } from "../fixtures/tomas-ui.rows";
import { COST_SCALE_SCREEN, FIELD_CELL_SAMPLES } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function FieldCellDemo() {
  const t = useT();
  const scales = columnScales(COST_SCALE_SCREEN, WORK_ORDER, WORK_ORDER_ROWS);
  return (
    <TomasUiDemo id="field-cell">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">{t("TUI.fieldType")}</TableHead>
            <TableHead className="w-32">display</TableHead>
            <TableHead>FieldCell</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {FIELD_CELL_SAMPLES.map((sample, index) => (
            <TableRow key={index}>
              <TableCell className="font-mono text-xs">{sample.field.type}</TableCell>
              <TableCell className="font-mono text-xs">
                {sample.display}
                {sample.labelsPending ? " (pending)" : null}
              </TableCell>
              <TableCell className="min-w-0">
                <FieldCell {...sample} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TONE_BADGE_CLASS).map(([tone, className]) => (
          <span key={tone} className={cn("rounded-md px-2 py-0.5 text-xs font-medium", className)}>
            {tone}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TONE_FILL_CLASS).map(([tone, className]) => (
          <span key={tone} className="flex items-center gap-1 text-xs">
            <span className={cn("block h-2 w-10 rounded-full", className)} />
            {tone}
          </span>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        columnScales:{" "}
        {[...scales].map(([key, max]) => (
          <code key={key} className="bg-muted mr-2 rounded px-1.5 py-0.5 font-mono text-xs">
            {key} = {max}
          </code>
        ))}
      </p>
    </TomasUiDemo>
  );
}
