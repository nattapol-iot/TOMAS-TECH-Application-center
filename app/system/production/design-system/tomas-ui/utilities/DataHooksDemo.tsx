"use client";

import { Button, ConfirmActionsContext, Label, RowContext, Switch, WriteReachProvider, createValues, dataKeys, toast, useInvalidateWrite, useRecordCreate, useRowMove } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { DEVICE, WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { NEW_ORDER_VALUES, SAMPLE_WRITE_REACH, WORK_ORDER_SCOPE, WORK_ORDER_SCOPE_VALUES } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { ClassTable } from "./ClassTable";
import { TransitionButton } from "./TransitionButton";

export function DataHooksDemo() {
  const t = useT();
  const [confirm, setConfirm] = useState(true);
  const invalidate = useInvalidateWrite();
  const create = useRecordCreate(WORK_ORDER, SAMPLE_ADAPTERS);
  const move = useRowMove(DEVICE, SAMPLE_ADAPTERS);
  const values = createValues(WORK_ORDER, NEW_ORDER_VALUES, WORK_ORDER_SCOPE_VALUES);
  return (
    <TomasUiDemo id="data-hooks">
      <ClassTable
        rows={[
          ["dataKeys.list", JSON.stringify(dataKeys.lists(WORK_ORDER.key))],
          ["dataKeys.record", JSON.stringify(dataKeys.record(WORK_ORDER.key, "wo-3"))],
          ["createValues", JSON.stringify(values)],
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void create(values).then((saved) => saved && toast.success(t("TUI.saved")))}>
          useRecordCreate
        </Button>
        <Button size="sm" variant="outline" onClick={() => void move("dev-3", "status", "online").then((result) => toast(`${result?.moved ?? 0} ${t("TUI.moved")}`))}>
          useRowMove dev-3 online
        </Button>
        <Button size="sm" variant="outline" onClick={() => void invalidate([WORK_ORDER.key, DEVICE.key]).then(() => toast(t("TUI.reloaded")))}>
          useInvalidateWrite
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Label>
          <Switch checked={confirm} onCheckedChange={setConfirm} />
          ConfirmActionsContext
        </Label>
        <WriteReachProvider reach={SAMPLE_WRITE_REACH}>
          <ConfirmActionsContext.Provider value={confirm}>
            <RowContext.Provider value={WORK_ORDER_SCOPE}>
              <TransitionButton field="status" to="done" />
              <TransitionButton field="status" to="cancelled" />
            </RowContext.Provider>
          </ConfirmActionsContext.Provider>
        </WriteReachProvider>
      </div>
    </TomasUiDemo>
  );
}
