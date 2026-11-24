"use client";

import { NamedIcon } from "@tomas-tc/ui";
import { TOMAS_ICON_NAMES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function IconsSection() {
  return (
    <TomasUiDemo id="named-icon">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
        {TOMAS_ICON_NAMES.map((name) => (
          <div key={name} className="flex flex-col items-center gap-2 rounded-md border p-3">
            <NamedIcon name={name} className="size-6" />
            <code className="text-muted-foreground font-mono text-xs">{name}</code>
          </div>
        ))}
      </div>
    </TomasUiDemo>
  );
}
