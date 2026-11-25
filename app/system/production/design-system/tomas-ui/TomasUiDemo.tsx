"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@tomas-tc/ui";
import { useT } from "../../../i18n";
import { TOMAS_UI_DEMOS } from "./config/tomas-ui.coverage";
import type { TomasUiDemoProps } from "./types/tomas-ui.types";

export function TomasUiDemo({ id, children }: TomasUiDemoProps) {
  const t = useT();
  const spec = TOMAS_UI_DEMOS.find((demo) => demo.id === id);
  if (!spec) throw new Error(`No @tomas-tc/ui demo is catalogued as ${id}`);
  return (
    <Card id={`tui-demo-${id}`} className={cn("min-w-0", spec.wide && "xl:col-span-2")}>
      <CardHeader>
        <CardTitle>{t(spec.title)}</CardTitle>
        <CardDescription className="flex flex-wrap gap-1">
          {spec.entry && <code className="font-mono text-xs">{spec.entry}</code>}
          {spec.exports.map((name) => (
            <code key={name} className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
              {name}
              {spec.drawnInside?.[name] ? ` (${t("TUI.drawnInside")} ${spec.drawnInside[name]})` : null}
            </code>
          ))}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
