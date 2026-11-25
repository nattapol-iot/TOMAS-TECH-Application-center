"use client";

import { A4_MM, Button, detachedHtmlSheet, downloadFile, printDocumentHtml, printWhenReady } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { SLIP_CSS, workOrderSlip } from "../fixtures/tomas-ui.print";
import { TomasUiDemo } from "../TomasUiDemo";

export function PrintHelpersDemo() {
  const t = useT();
  const [html, setHtml] = useState("");
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const build = () => printDocumentHtml([detachedHtmlSheet(workOrderSlip("WO-0104", 6), SLIP_CSS, A4_MM)], A4_MM);
  return (
    <TomasUiDemo id="print-helpers">
      <p className="text-muted-foreground text-sm">{t("TUI.printHelpersNote")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void build().then(setHtml)}>
          detachedHtmlSheet + printDocumentHtml
        </Button>
        <Button size="sm" variant="outline" onClick={() => void build().then((page) => downloadFile(new Blob([page], { type: "text/html" }), "WO-0104.html"))}>
          downloadFile
        </Button>
        <Button size="sm" variant="outline" disabled={!area} onClick={() => void printWhenReady(area?.ownerDocument)}>
          printWhenReady
        </Button>
      </div>
      <div ref={setArea}>
        <pre className="bg-muted/50 max-h-48 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap break-all">
          {html ? `${html.length.toLocaleString()} chars\n${html.slice(0, 600)}` : "printDocumentHtml"}
        </pre>
      </div>
    </TomasUiDemo>
  );
}
