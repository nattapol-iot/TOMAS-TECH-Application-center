"use client";

import type { RowValues } from "@tomas-tc/blueprint";
import { Button, FieldControl, Label, Switch } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { INSPECTION } from "../fixtures/tomas-ui.entities";
import { INSPECTION_VALUES } from "../fixtures/tomas-ui.rows";
import { DEVICE_OPTIONS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function FieldControlDemo() {
  const t = useT();
  const [values, setValues] = useState<RowValues>(INSPECTION_VALUES);
  const [disabled, setDisabled] = useState(false);
  return (
    <TomasUiDemo id="field-control">
      <div className="flex flex-wrap items-center gap-4">
        <Label>
          <Switch checked={disabled} onCheckedChange={setDisabled} />
          {t("TUI.disabled")}
        </Label>
        <Button size="sm" variant="outline" onClick={() => setValues({})}>
          {t("TUI.clear")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setValues(INSPECTION_VALUES)}>
          {t("TUI.reset")}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {INSPECTION.fields.map((field) => (
          <div key={field.key} className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor={`tui-fc-${field.key}`}>
              {field.label}
              <code className="text-muted-foreground font-mono text-xs">{field.type}</code>
            </Label>
            <FieldControl
              id={`tui-fc-${field.key}`}
              field={field}
              value={values[field.key] ?? null}
              referenceOptions={DEVICE_OPTIONS}
              disabled={disabled}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            />
          </div>
        ))}
      </div>
    </TomasUiDemo>
  );
}
