"use client";

import { fieldErrors, type RowValues } from "@tomas-tc/blueprint";
import { Button, FormAside, FormFields, FormRowsSection, Label, Switch, ValidatedForm, toast, type FormRows } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { WORK_ORDER, WORK_PART } from "../fixtures/tomas-ui.entities";
import { FORM_CHILDREN, PARTS_SECTION, REFERENCE_OPTIONS, WORK_ORDER_ASIDE, WORK_ORDER_DRAFT, WORK_ORDER_DRAFT_ROWS, WORK_ORDER_FORM } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function FormFieldsDemo() {
  const t = useT();
  const [values, setValues] = useState<RowValues>(WORK_ORDER_DRAFT);
  const [rows, setRows] = useState<FormRows>(WORK_ORDER_DRAFT_ROWS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const parts = rows[WORK_PART.key] ?? [];
  const partsTotal = parts.reduce((sum, row) => sum + Number(row.qty ?? 0) * Number(row["unit-cost"] ?? 0), 0);
  const save = () => {
    const next = fieldErrors(WORK_ORDER, values);
    setErrors(next);
    if (Object.keys(next).length === 0) toast.success(t("TUI.saved"));
  };
  return (
    <TomasUiDemo id="form-fields">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setValues({})}>
          {t("TUI.clear")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setValues(WORK_ORDER_DRAFT)}>
          {t("TUI.reset")}
        </Button>
        <Label>
          <Switch checked={processing} onCheckedChange={setProcessing} />
          {t("TUI.saving")}
        </Label>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <ValidatedForm id="tui-validated-form" screen={WORK_ORDER_FORM} errors={errors} onSubmit={save}>
          <FormFields
            screen={WORK_ORDER_FORM}
            entity={WORK_ORDER}
            values={values}
            childEntities={FORM_CHILDREN}
            rows={rows}
            referenceOptions={REFERENCE_OPTIONS}
            errors={errors}
            processing={processing}
            onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
            onRowsChange={(entity, next) => setRows((current) => ({ ...current, [entity]: next }))}
          />
        </ValidatedForm>
        <FormAside aside={WORK_ORDER_ASIDE} entity={WORK_ORDER} values={values} referenceOptions={REFERENCE_OPTIONS} />
      </div>
      <Button type="submit" form="tui-validated-form" className="self-start">
        {t("Save")}
      </Button>
      <FormRowsSection
        section={PARTS_SECTION}
        child={WORK_PART}
        rows={parts}
        totals={[{ column: "unit-cost", label: t("TUI.total"), value: partsTotal }]}
        disabled={processing}
        onChange={(next) => setRows((current) => ({ ...current, [WORK_PART.key]: next }))}
      />
    </TomasUiDemo>
  );
}
