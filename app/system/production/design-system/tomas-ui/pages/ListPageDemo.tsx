"use client";

import { ConfirmDialog, FormDialog, ListPage, RecordSheet, useFormRows, useFormScreen, useListActions, useListScreen, useOpenRecord, type RowActionsLayout } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { ROW_ACTION_LAYOUTS, TOMAS_LIST_OPTIONS } from "../config/tomas-ui.constants";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { SAMPLE_ENTITIES, WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { FORM_CHILDREN, WORK_ORDER_FORM, WORK_ORDER_LIST } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";

export function ListPageDemo() {
  const t = useT();
  const [layout, setLayout] = useState<RowActionsLayout>("icons");
  const list = useListScreen(WORK_ORDER_LIST, WORK_ORDER, SAMPLE_ADAPTERS, TOMAS_LIST_OPTIONS);
  const formRows = useFormRows(FORM_CHILDREN);
  const form = useFormScreen(WORK_ORDER, SAMPLE_ADAPTERS, () => void list.reload(), formRows);
  const actions = useListActions(list, WORK_ORDER, { openEdit: (id) => void form.openEdit(id) });
  const record = useOpenRecord(WORK_ORDER);
  return (
    <TomasUiDemo id="list-page">
      <TomasUiStates options={ROW_ACTION_LAYOUTS} value={layout} onChange={setLayout} />
      <div className="rounded-lg border p-4">
        <ListPage
          screen={WORK_ORDER_LIST}
          entity={WORK_ORDER}
          rows={list.rows}
          total={list.total}
          query={list.query}
          selected={list.selected}
          loading={list.loading}
          referenceLabels={list.referenceLabels}
          rowActionsLayout={layout}
          onQueryChange={list.setQuery}
          onSelectedChange={list.setSelected}
          onRowAction={(action, row) => actions.runAction(action, [row.id])}
          onBulkAction={actions.runAction}
          onRowOpen={(row) => record.open(row.id)}
          onCreate={() => form.openCreate({ status: "open", priority: "normal" })}
        />
      </div>
      {list.moveDialog}
      {actions.pending && (
        <ConfirmDialog
          open
          title={actions.pending.message}
          description={t("TUI.confirmNote")}
          destructive={actions.pending.action.kind === "delete"}
          onOpenChange={(open) => {
            if (!open) actions.cancelPending();
          }}
          onConfirm={() => void actions.confirmPending()}
        />
      )}
      <FormDialog
        open={form.open}
        screen={WORK_ORDER_FORM}
        entity={WORK_ORDER}
        values={form.values}
        childEntities={formRows.childEntities}
        rows={formRows.rows}
        referenceOptions={form.referenceOptions}
        errors={form.errors}
        processing={form.processing}
        dirty={form.dirty}
        onOpenChange={(open) => {
          if (!open) form.close();
        }}
        onChange={form.setValue}
        onRowsChange={formRows.setRows}
        onSubmit={() => void form.submit()}
      />
      <RecordSheet entities={SAMPLE_ENTITIES} adapters={SAMPLE_ADAPTERS} target={record.target} onClose={record.close} onEdit={(id) => void form.openEdit(id)} />
    </TomasUiDemo>
  );
}
