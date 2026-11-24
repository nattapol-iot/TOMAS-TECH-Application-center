"use client";

import { RecordActivity, RecordDetail, toast } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { SAMPLE_ENTITIES } from "../fixtures/tomas-ui.entities";
import { PLC_UPDATE } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function RecordDetailDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="record-detail">
      <div className="h-[28rem] overflow-auto rounded-lg border">
        <RecordDetail target={PLC_UPDATE} entities={SAMPLE_ENTITIES} adapters={SAMPLE_ADAPTERS} onEdit={() => toast(t("TUI.editWorkOrder"))} onOpenRecord={(target) => toast(target.id)} />
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border p-4">
        <RecordActivity target={PLC_UPDATE} entities={SAMPLE_ENTITIES} adapters={SAMPLE_ADAPTERS} feed="work-note" />
      </div>
    </TomasUiDemo>
  );
}
