"use client";

import { Badge, Button, usePageState, useRowContext, useScope, useStateWrite, useTemplate, useWhen } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_TEMPLATE } from "../config/tomas-ui.constants";

export function ScopeProbe() {
  const t = useT();
  const { values, set, back } = usePageState();
  const row = useRowContext();
  const scope = useScope();
  const text = useTemplate(TOMAS_TEMPLATE);
  const picked = useWhen({ state: "picked", op: "set" });
  const pickPlc = useStateWrite("picked", "wo-3");
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={pickPlc}>
          useStateWrite(picked, wo-3)
        </Button>
        <Button size="sm" variant="outline" onClick={() => set("picked", "wo-4")}>
          set(picked, wo-4)
        </Button>
        <Button size="sm" variant="ghost" onClick={() => back("picked")}>
          {t("TUI.clear")}
        </Button>
        <Badge variant={picked ? "default" : "outline"}>useWhen: {String(picked)}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-mono">usePageState</dt>
        <dd className="font-mono text-xs">{JSON.stringify(values)}</dd>
        <dt className="font-mono">useRowContext</dt>
        <dd>
          {row?.entity.label} {String(row?.row.code)}
        </dd>
        <dt className="font-mono">useScope</dt>
        <dd className="font-mono text-xs">{Object.keys(scope).join(", ")}</dd>
        <dt className="font-mono">useTemplate</dt>
        <dd>{text}</dd>
      </dl>
    </div>
  );
}
