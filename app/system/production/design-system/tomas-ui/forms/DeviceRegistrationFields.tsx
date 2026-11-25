"use client";

import { ComboboxControl, Input, Label, ServerErrorAnchor, ValidationMirror } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { DEVICE_CODE_PATTERN } from "../config/tomas-ui.constants";
import { SITE_OPTIONS } from "../fixtures/tomas-ui.screens";
import type { DeviceRegistrationFieldsProps } from "../types/tomas-ui.types";

export function DeviceRegistrationFields({ idPrefix, values, onChange, codeRef, onEmailInput }: DeviceRegistrationFieldsProps) {
  const t = useT();
  return (
    <>
      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-code`}>{t("TUI.deviceCode")}</Label>
        <div className="relative grid">
          <Input ref={codeRef} id={`${idPrefix}-code`} required pattern={DEVICE_CODE_PATTERN} value={values.code} onChange={(event) => onChange({ ...values, code: event.target.value })} />
          <ServerErrorAnchor field="code" />
        </div>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-email`}>{t("TUI.contactEmail")}</Label>
        <div className="relative grid">
          <Input
            id={`${idPrefix}-email`}
            type="email"
            required
            value={values.email}
            onChange={(event) => {
              onChange({ ...values, email: event.target.value });
              onEmailInput?.(event.currentTarget);
            }}
          />
          <ServerErrorAnchor field="email" />
        </div>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-site`}>{t("TUI.site")}</Label>
        <div className="relative grid">
          <ComboboxControl id={`${idPrefix}-site`} value={values.site} options={SITE_OPTIONS} placeholder={t("TUI.pickOne")} onChange={(site) => onChange({ ...values, site })} />
          <ValidationMirror value={values.site ?? ""} />
          <ServerErrorAnchor field="site" />
        </div>
      </div>
    </>
  );
}
