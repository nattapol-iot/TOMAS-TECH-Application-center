"use client";

import { A4_MM, Button, HtmlSheet, PrintToggle, PrintViewer, downloadFile, paginateDocument, pdfFileName, printDocumentHtml, toast } from "@tomas-tc/ui";
import { useMemo, useState } from "react";
import { useT } from "../../../../i18n";
import { SLIP_LINE_STEP } from "../config/tomas-ui.constants";
import { renderPdfOnServer } from "../fixtures/tomas-ui.fake-api";
import { SLIP_CSS, workOrderSlip } from "../fixtures/tomas-ui.print";
import SAMPLE_PDF from "../file-viewer/samples/work-order.pdf?url";
import { TomasUiDemo } from "../TomasUiDemo";

export function PrintViewerDemo() {
  const t = useT();
  const [lines, setLines] = useState(48);
  const [prices, setPrices] = useState(true);
  const pages = useMemo(() => paginateDocument(SLIP_CSS, workOrderSlip("WO-0103", lines)), [lines]);
  const sheet = (index: number) => <HtmlSheet html={pages[index] ?? ""} css={SLIP_CSS} widthMm={A4_MM.width} heightMm={A4_MM.height} rootClass={prices ? "" : "hide-prices"} />;
  return (
    <TomasUiDemo id="print-viewer">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={lines <= SLIP_LINE_STEP} onClick={() => setLines(lines - SLIP_LINE_STEP)}>
          -{SLIP_LINE_STEP}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLines(lines + SLIP_LINE_STEP)}>
          +{SLIP_LINE_STEP}
        </Button>
        <span className="text-muted-foreground">
          paginateDocument: {lines} {t("TUI.lines")}, {pages.length} {t("TUI.docPages")}
        </span>
      </div>
      <div className="h-[36rem] overflow-hidden rounded-lg border">
        <PrintViewer
          count={pages.length}
          widthMm={A4_MM.width}
          heightMm={A4_MM.height}
          pdfName={pdfFileName("WO-0103 PLC firmware update")}
          start={
            <PrintToggle pressed={prices} onPressedChange={setPrices}>
              {t("TUI.showPrices")}
            </PrintToggle>
          }
          renderPage={sheet}
          renderThumb={sheet}
          onSavePdf={async (sheets, fileName) => {
            const pdf = await renderPdfOnServer(await printDocumentHtml(sheets, A4_MM), SAMPLE_PDF);
            if (pdf) await downloadFile(pdf, fileName);
            toast.success(fileName);
          }}
        />
      </div>
    </TomasUiDemo>
  );
}
