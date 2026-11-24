"use client";

import { Checkbox, Input, Label, RadioGroup, RadioGroupItem, Switch, Textarea } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_PRIORITIES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function InputsDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="inputs">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="tui-text">{t("DS.textField")}</Label>
          <Input id="tui-text" placeholder={t("DS.placeholder")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tui-invalid">{t("TUI.invalid")}</Label>
          <Input id="tui-invalid" aria-invalid defaultValue="GW-??" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tui-disabled">{t("TUI.disabled")}</Label>
          <Input id="tui-disabled" disabled defaultValue="GW-A01" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tui-file">{t("TUI.file")}</Label>
          <Input id="tui-file" type="file" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="tui-note">{t("DS.noteField")}</Label>
          <Textarea id="tui-note" rows={3} placeholder={t("DS.placeholder")} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <Label>
          <Checkbox defaultChecked />
          {t("DS.tuiNotify")}
        </Label>
        <Label>
          <Checkbox checked="indeterminate" />
          {t("TUI.indeterminate")}
        </Label>
        <Label>
          <Checkbox disabled />
          {t("TUI.disabled")}
        </Label>
        <Label>
          <Switch defaultChecked />
          {t("DS.tuiActive")}
        </Label>
        <Label>
          <Switch size="sm" />
          sm
        </Label>
        <Label>
          <Switch disabled />
          {t("TUI.disabled")}
        </Label>
      </div>
      <RadioGroup defaultValue={TOMAS_PRIORITIES[0].value} className="flex gap-4">
        {TOMAS_PRIORITIES.map((priority) => (
          <Label key={priority.value}>
            <RadioGroupItem value={priority.value} />
            {t(priority.label)}
          </Label>
        ))}
      </RadioGroup>
    </TomasUiDemo>
  );
}
