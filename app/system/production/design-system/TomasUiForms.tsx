"use client";

import { Checkbox, Input, Label, RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../i18n";
import { SELECT_SAMPLE, TOMAS_PRIORITIES } from "./config/design-system.constants";
import { TomasUiSection } from "./TomasUiSection";

export function TomasUiForms() {
  const t = useT();
  const [option, setOption] = useState(SELECT_SAMPLE[0]);
  return (
    <TomasUiSection title="DS.tuiForms">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="tui-text">{t("DS.textField")}</Label>
          <Input id="tui-text" placeholder={t("DS.placeholder")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tui-select">{t("DS.selectField")}</Label>
          <Select value={option} onValueChange={setOption}>
            <SelectTrigger id="tui-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECT_SAMPLE.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="tui-note">{t("DS.noteField")}</Label>
          <Textarea id="tui-note" rows={3} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <Label>
          <Checkbox defaultChecked />
          {t("DS.tuiNotify")}
        </Label>
        <Label>
          <Switch defaultChecked />
          {t("DS.tuiActive")}
        </Label>
        <RadioGroup defaultValue={TOMAS_PRIORITIES[0].value} className="flex gap-4">
          {TOMAS_PRIORITIES.map((priority) => (
            <Label key={priority.value}>
              <RadioGroupItem value={priority.value} />
              {t(priority.label)}
            </Label>
          ))}
        </RadioGroup>
      </div>
    </TomasUiSection>
  );
}
