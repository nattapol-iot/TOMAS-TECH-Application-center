"use client";

import { Button, installDiagnostics, recordClientError, recordDiagnostic, showServerError, toast } from "@tomas-tc/ui";
import { useEffect } from "react";
import { useT } from "../../../../i18n";
import { DIAGNOSTICS_OPTIONS, SAMPLE_FETCH_URL } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function DiagnosticsDemo() {
  const t = useT();
  // The uninstall function it returns is the effect cleanup, so the trail stops when the section closes.
  useEffect(() => installDiagnostics(DIAGNOSTICS_OPTIONS), []);
  return (
    <TomasUiDemo id="diagnostics">
      <p className="text-muted-foreground text-sm">{t("TUI.diagnosticsNote")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            recordDiagnostic("form", "inspection draft saved");
            toast(t("TUI.recorded"));
          }}
        >
          recordDiagnostic
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            recordClientError(new RangeError("Gauge reading 140 is above 100"), "InspectionForm");
            toast(t("TUI.recorded"));
          }}
        >
          recordClientError
        </Button>
        <Button size="sm" variant="outline" onClick={() => void fetch(SAMPLE_FETCH_URL).then(() => toast(t("TUI.recorded")))}>
          fetch
        </Button>
        <Button size="sm" onClick={() => showServerError({ message: t("TUI.diagnosticsShown"), status: 0 })}>
          {t("TUI.showTrail")}
        </Button>
      </div>
    </TomasUiDemo>
  );
}
