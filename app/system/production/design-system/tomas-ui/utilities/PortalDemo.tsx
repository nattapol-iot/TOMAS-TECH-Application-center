"use client";

import { Button, Popover, PopoverContent, PopoverTrigger, PortalContainerProvider, usePortalContainer } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TomasUiDemo } from "../TomasUiDemo";

export function PortalDemo() {
  const t = useT();
  const frameBody = usePortalContainer();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <TomasUiDemo id="portal">
      <p className="text-sm">
        usePortalContainer: <code className="font-mono text-xs">{frameBody ? `${frameBody.tagName.toLowerCase()} (${t("TUI.insideFrame")})` : "document.body"}</code>
      </p>
      <PortalContainerProvider container={box}>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="self-start">
              {t("TUI.portalHere")}
            </Button>
          </PopoverTrigger>
          <PopoverContent>{t("TUI.portalNote")}</PopoverContent>
        </Popover>
      </PortalContainerProvider>
      <div ref={setBox} className="relative min-h-24 rounded-lg border border-dashed p-2 text-xs" />
    </TomasUiDemo>
  );
}
