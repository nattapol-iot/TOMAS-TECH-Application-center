"use client";

import { COLLECTION_VIEW_LABEL, FieldValue, ProgressValue, RecordView, RepeatView, TruncatedText, useUiIntl } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_LONG_NOTE } from "../config/tomas-ui.constants";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { RowTemplate } from "../data/RowTemplate";
import { TomasUiDemo } from "../TomasUiDemo";

export function RecordViewDemo() {
  const t = useT();
  const intl = useUiIntl();
  return (
    <TomasUiDemo id="record-view">
      <RepeatView entity={WORK_ORDER} adapters={SAMPLE_ADAPTERS} layout="chips" select="picked">
        <RowTemplate text="{{code}}" />
      </RepeatView>
      <RecordView entity={WORK_ORDER} adapters={SAMPLE_ADAPTERS} rowId="{{state.picked}}" empty={t("TUI.pickWorkOrder")}>
        <h3 className="text-lg font-semibold">
          <RowTemplate text="{{code}} {{title}}" />
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          <FieldValue field="status" />
          <FieldValue field="priority" />
          <FieldValue field="assignee" display="avatar" />
          <FieldValue field="due" display="relative-date" />
          <FieldValue field="status" display="stepper" adapters={SAMPLE_ADAPTERS} />
          <FieldValue field="cost" />
        </dl>
        <ProgressValue label={t("TUI.progress")} value="{{progress}}" max={100} tone="info" />
        <ProgressValue label={t("TUI.budgetUsed")} value={0.82} max={1} tone="warning" />
      </RecordView>
      <TruncatedText text={TOMAS_LONG_NOTE} lines={2} className="max-w-md text-sm" />
      <TruncatedText text={TOMAS_LONG_NOTE} lines={1} className="max-w-xs text-sm" />
      <div className="flex flex-wrap gap-1">
        {Object.entries(COLLECTION_VIEW_LABEL).map(([view, label]) => (
          <code key={view} className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
            {view}: {intl.formatMessage(label)}
          </code>
        ))}
      </div>
    </TomasUiDemo>
  );
}
