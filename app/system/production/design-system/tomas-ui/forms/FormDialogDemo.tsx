"use client";

import { Button, FormDialog, useFormRows, useFormScreen, type RowsEditing } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { ROWS_EDITING } from "../config/tomas-ui.constants";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { FORM_CHILDREN, WORK_ORDER_FORM } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";

export function FormDialogDemo() {
  const t = useT();
  const [rowsEditing, setRowsEditing] = useState<RowsEditing>("inline");
  const formRows = useFormRows(FORM_CHILDREN);
  const form = useFormScreen(WORK_ORDER, SAMPLE_ADAPTERS, undefined, formRows);
  return (
    <TomasUiDemo id="form-dialog">
      <TomasUiStates options={ROWS_EDITING} value={rowsEditing} onChange={setRowsEditing} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => form.openCreate({ priority: "normal", status: "open" })}>{t("TUI.newWorkOrder")}</Button>
        <Button variant="outline" onClick={() => void form.openEdit("wo-3")}>
          {t("TUI.editWorkOrder")} WO-0103
        </Button>
      </div>
      <FormDialog
        open={form.open}
        screen={WORK_ORDER_FORM}
        entity={WORK_ORDER}
        values={form.values}
        childEntities={formRows.childEntities}
        rows={formRows.rows}
        referenceOptions={form.referenceOptions}
        errors={form.errors}
        processing={form.processing}
        dirty={form.dirty}
        rowsEditing={rowsEditing}
        onOpenChange={(open) => {
          if (!open) form.close();
        }}
        onChange={form.setValue}
        onRowsChange={formRows.setRows}
        onSubmit={() => void form.submit()}
      />
    </TomasUiDemo>
  );
}
