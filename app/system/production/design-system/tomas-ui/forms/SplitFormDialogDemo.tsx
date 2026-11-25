"use client";

import { Button, NamedIcon, SplitFormDialog, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { NEW_DEVICE } from "../config/tomas-ui.constants";
import { registerDevice } from "../fixtures/tomas-ui.fake-api";
import { TomasUiDemo } from "../TomasUiDemo";
import { DeviceRegistrationFields } from "./DeviceRegistrationFields";

export function SplitFormDialogDemo() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(NEW_DEVICE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const next = await registerDevice(values);
    setSaving(false);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    toast.success(t("TUI.saved"));
    setOpen(false);
  };
  return (
    <TomasUiDemo id="split-form-dialog">
      <p className="text-muted-foreground text-sm">{t("TUI.splitFormNote")}</p>
      <Button
        className="self-start"
        onClick={() => {
          setErrors({});
          setOpen(true);
        }}
      >
        {t("TUI.registerDevice")}
      </Button>
      <SplitFormDialog
        open={open}
        title={t("TUI.registerDevice")}
        processing={saving}
        errors={errors}
        aside={
          <div className="flex flex-col gap-2 text-sm">
            <NamedIcon name="router" className="text-primary size-8" />
            <p className="text-muted-foreground">{t("TUI.registerDeviceNote")}</p>
          </div>
        }
        onOpenChange={setOpen}
        onSubmit={() => void submit()}
      >
        <DeviceRegistrationFields idPrefix="tui-split" values={values} onChange={setValues} />
      </SplitFormDialog>
    </TomasUiDemo>
  );
}
