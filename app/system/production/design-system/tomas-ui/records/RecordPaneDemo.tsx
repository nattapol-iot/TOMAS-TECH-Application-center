"use client";

import { RecordPane, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { DEVICE, SAMPLE_ENTITIES } from "../fixtures/tomas-ui.entities";
import { PANE_DEVICE_IDS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";

export function RecordPaneDemo() {
  const t = useT();
  const [rowId, setRowId] = useState("dev-3");
  return (
    <TomasUiDemo id="record-pane">
      <TomasUiStates options={PANE_DEVICE_IDS} value={rowId} onChange={setRowId} />
      <div className="h-96 overflow-auto rounded-lg border">
        <RecordPane entity={DEVICE} entities={SAMPLE_ENTITIES} adapters={SAMPLE_ADAPTERS} rowId={rowId} empty={t("TUI.noSuchDevice")} onEdit={(id) => toast(id)} />
      </div>
    </TomasUiDemo>
  );
}
