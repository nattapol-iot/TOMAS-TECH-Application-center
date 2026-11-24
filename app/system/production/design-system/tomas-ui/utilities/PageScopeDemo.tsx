"use client";

import { PageStateProvider, RowContext, matchesWhen, renderTemplate, resolveRawTemplate } from "@tomas-tc/ui";
import { TOMAS_DEMO_STATE, TOMAS_TEMPLATE } from "../config/tomas-ui.constants";
import { WORK_ORDER_SCOPE, WORK_ORDER_SCOPE_VALUES } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { ScopeProbe } from "./ScopeProbe";

export function PageScopeDemo() {
  return (
    <TomasUiDemo id="page-scope">
      <PageStateProvider state={TOMAS_DEMO_STATE}>
        <RowContext.Provider value={WORK_ORDER_SCOPE}>
          <ScopeProbe />
        </RowContext.Provider>
      </PageStateProvider>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-mono">renderTemplate</dt>
        <dd>{renderTemplate(TOMAS_TEMPLATE, WORK_ORDER_SCOPE_VALUES)}</dd>
        <dt className="font-mono">resolveRawTemplate</dt>
        <dd>{resolveRawTemplate(TOMAS_TEMPLATE, WORK_ORDER_SCOPE_VALUES)}</dd>
        <dt className="font-mono">matchesWhen</dt>
        <dd>{String(matchesWhen({ field: "status", op: "eq", value: "in-progress" }, WORK_ORDER_SCOPE_VALUES))}</dd>
      </dl>
    </TomasUiDemo>
  );
}
