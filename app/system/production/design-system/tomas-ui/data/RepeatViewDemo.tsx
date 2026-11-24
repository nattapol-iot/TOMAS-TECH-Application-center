"use client";

import { REPEAT_LAYOUTS, type RepeatLayout } from "@tomas-tc/blueprint";
import { FieldValue, RepeatCell, RepeatView, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { REPEAT_HEADS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import { RowTemplate } from "./RowTemplate";

export function RepeatViewDemo() {
  const t = useT();
  const [layout, setLayout] = useState<RepeatLayout>("list");
  return (
    <TomasUiDemo id="repeat-view">
      <TomasUiStates options={REPEAT_LAYOUTS} value={layout} onChange={setLayout} />
      <RepeatView
        key={layout}
        entity={WORK_ORDER}
        adapters={SAMPLE_ADAPTERS}
        layout={layout}
        columns={3}
        select="picked"
        pageSize={4}
        moves
        bulk={layout === "table"}
        empty={t("DS.emptyTitle")}
        heads={REPEAT_HEADS}
        onOpen={(id) => toast(id)}
        onCreate={() => toast(t("TUI.newWorkOrder"))}
      >
        {layout === "table" ? (
          <>
            <RepeatCell column={0}>
              <RowTemplate text="{{code}}" />
            </RepeatCell>
            <RepeatCell column={1}>
              <RowTemplate text="{{title}}" />
            </RepeatCell>
            <RepeatCell column={2}>
              <FieldValue field="status" label={false} />
            </RepeatCell>
            <RepeatCell column={3}>
              <FieldValue field="assignee" label={false} display="avatar" />
            </RepeatCell>
          </>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <RowTemplate text="{{code}} {{title}}" />
            {layout !== "chips" && <FieldValue field="status" label={false} />}
          </div>
        )}
      </RepeatView>
    </TomasUiDemo>
  );
}
