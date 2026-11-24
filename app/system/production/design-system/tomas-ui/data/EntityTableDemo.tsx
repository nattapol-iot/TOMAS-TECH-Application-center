"use client";

import { EntityTable, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_STATE_LABELS, TOMAS_STATES } from "../config/tomas-ui.constants";
import { REST_ADAPTERS, REST_DEVICE, STATE_ADAPTERS, STATE_DEVICES } from "../fixtures/tomas-ui.backend";
import { DEVICE_TABLE_COLUMNS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import type { TomasUiState } from "../types/tomas-ui.types";

export function EntityTableDemo() {
  const t = useT();
  const [state, setState] = useState<TomasUiState>("loaded");
  return (
    <TomasUiDemo id="entity-table">
      <TomasUiStates options={TOMAS_STATES} labels={TOMAS_STATE_LABELS} value={state} onChange={setState} />
      <EntityTable
        key={state}
        entity={STATE_DEVICES[state]}
        adapters={STATE_ADAPTERS[state]}
        columns={DEVICE_TABLE_COLUMNS}
        limit={5}
        onOpen={(id) => toast(id)}
        onCreate={() => toast(t("TUI.newDevice"))}
      />
      <p className="text-muted-foreground text-sm">{t("TUI.restNote")}</p>
      <EntityTable entity={REST_DEVICE} adapters={REST_ADAPTERS} columns={DEVICE_TABLE_COLUMNS} limit={3} />
    </TomasUiDemo>
  );
}
