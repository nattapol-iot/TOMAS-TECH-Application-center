"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TomasUiDemo } from "../TomasUiDemo";

export function ResizableDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="resizable">
      <ResizablePanelGroup orientation="horizontal" className="min-h-48 rounded-lg border">
        <ResizablePanel defaultSize="35%" minSize="20%">
          <div className="flex h-full items-center justify-center p-4 text-sm">{t("TUI.devices")}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="65%">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="60%">
              <div className="flex h-full items-center justify-center p-4 text-sm">{t("TUI.details")}</div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="40%">
              <div className="flex h-full items-center justify-center p-4 text-sm">{t("TUI.activity")}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </TomasUiDemo>
  );
}
