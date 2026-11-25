"use client";

import { GRID_FRAME_CLASS, GRID_TABLE_CLASS, GridAddButton, GridAddRow, GridFillHeader, GridInsertMenu, GridNumberCell, GridSuggestCell, GridTextCell } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { GRID_KIT_ROWS, GRID_PART_ROWS, NOTE_SNIPPETS, PART_SUGGESTIONS, TECHNICIAN_SUGGESTIONS } from "../fixtures/tomas-ui.sheets";
import { TomasUiDemo } from "../TomasUiDemo";
import type { GridPartRow } from "../types/tomas-ui.types";

const labelOf = (value: string) => PART_SUGGESTIONS.find((suggestion) => suggestion.value === value)?.label ?? value;

const technicianOf = (value: string) => TECHNICIAN_SUGGESTIONS.find((suggestion) => suggestion.value === value)?.label ?? value;

export function GridCellsDemo() {
  const t = useT();
  const [rows, setRows] = useState<GridPartRow[]>(GRID_PART_ROWS);
  const [added, setAdded] = useState(0);
  const edit = (id: string, change: Partial<GridPartRow>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  const add = (more: GridPartRow[]) => {
    setRows((current) => [...current, ...more.map((row) => ({ ...row, id: `${row.id}-added-${added}` }))]);
    setAdded(added + 1);
  };
  return (
    <TomasUiDemo id="grid-cells">
      <div className="overflow-x-auto">
        <div className={GRID_FRAME_CLASS}>
          <table className={GRID_TABLE_CLASS}>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-2 py-1.5">{t("TUI.part")}</th>
                <th className="w-24 px-2 py-1.5">{t("TUI.quantity")}</th>
                <th className="w-48 px-2 py-1.5">
                  <GridFillHeader
                    label={t("TUI.technician")}
                    options={TECHNICIAN_SUGGESTIONS}
                    onFill={(value) => setRows((current) => current.map((row) => ({ ...row, technician: technicianOf(value) })))}
                  />
                </th>
                <th className="px-2 py-1.5">{t("TUI.note")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td>
                    <GridSuggestCell
                      ariaLabel={t("TUI.part")}
                      value={row.part}
                      suggestions={PART_SUGGESTIONS}
                      required
                      onChange={(part) => edit(row.id, { part })}
                      onPick={(value) => edit(row.id, { part: labelOf(value) })}
                    />
                  </td>
                  <td>
                    <GridNumberCell ariaLabel={t("TUI.quantity")} value={row.quantity} min={1} max={999} onChange={(quantity) => edit(row.id, { quantity })} />
                  </td>
                  <td>
                    <GridTextCell ariaLabel={t("TUI.technician")} value={row.technician} onChange={(technician) => edit(row.id, { technician })} />
                  </td>
                  <td>
                    <GridTextCell ariaLabel={t("TUI.note")} value={row.note} multiline maxLength={200} onChange={(note) => edit(row.id, { note })} />
                  </td>
                  <td>
                    <GridInsertMenu label={t("TUI.insertNote")} options={NOTE_SNIPPETS} onPick={(snippet) => edit(row.id, { note: [row.note, snippet].filter(Boolean).join(" ") })} />
                  </td>
                </tr>
              ))}
            </tbody>
            <GridAddRow colSpan={5} label={t("TUI.addLine")} onAdd={() => add([{ id: "line", part: "", quantity: 1, technician: "", note: "" }])}>
              <GridAddButton label={t("TUI.addKit")} onAdd={() => add(GRID_KIT_ROWS)} />
            </GridAddRow>
          </table>
        </div>
      </div>
    </TomasUiDemo>
  );
}
