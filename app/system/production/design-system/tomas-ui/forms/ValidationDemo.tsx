"use client";

import { AnchoredBubble, Button, Notice, ValidatedForm, claimServerErrors, resetServerErrorClaims, takeUnclaimedServerErrors, toast, useUiIntl, validationMessage } from "@tomas-tc/ui";
import { useEffect, useState } from "react";
import { useT } from "../../../../i18n";
import { NEW_DEVICE } from "../config/tomas-ui.constants";
import { registerDevice } from "../fixtures/tomas-ui.fake-api";
import { TomasUiDemo } from "../TomasUiDemo";
import { DeviceRegistrationFields } from "./DeviceRegistrationFields";

export function ValidationDemo() {
  const t = useT();
  const intl = useUiIntl();
  const [values, setValues] = useState(NEW_DEVICE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [emailCheck, setEmailCheck] = useState("");
  const [codeField, setCodeField] = useState<HTMLInputElement | null>(null);
  const [bubble, setBubble] = useState(false);
  // Runs after ValidatedForm has claimed the errors it anchored, so only the ones nothing shows are left.
  useEffect(() => {
    if (errors.installer) claimServerErrors(["installer"]);
    for (const message of Object.values(takeUnclaimedServerErrors(errors))) toast.error(message);
  }, [errors]);
  const submit = async () => {
    setSaving(true);
    const next = await registerDevice(values);
    setSaving(false);
    setErrors(next);
    if (Object.keys(next).length === 0) toast.success(t("TUI.saved"));
  };
  return (
    <TomasUiDemo id="validation">
      <Notice tone="info" message={t("TUI.validationNote")} />
      <ValidatedForm id="tui-validation-form" className="grid gap-4 sm:grid-cols-3" errors={errors} onSubmit={() => void submit()}>
        <DeviceRegistrationFields
          idPrefix="tui-validation"
          values={values}
          codeRef={setCodeField}
          onChange={setValues}
          onEmailInput={(input) => setEmailCheck(input.validity.valid ? "" : validationMessage(input, intl))}
        />
      </ValidatedForm>
      <p className="text-muted-foreground text-sm">
        validationMessage: <span className="text-foreground">{emailCheck || "-"}</span>
      </p>
      {errors.installer && <p className="text-destructive text-sm">{errors.installer}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" form="tui-validation-form" disabled={saving} aria-busy={saving}>
          {t("Save")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            resetServerErrorClaims();
            setErrors({});
            setValues(NEW_DEVICE);
          }}
        >
          {t("TUI.reset")}
        </Button>
        <Button variant="outline" disabled={!codeField} onClick={() => setBubble(true)}>
          AnchoredBubble
        </Button>
      </div>
      {bubble && codeField && <AnchoredBubble target={codeField} message={t("TUI.bubbleNote")} primary={false} onDismiss={() => setBubble(false)} />}
    </TomasUiDemo>
  );
}
