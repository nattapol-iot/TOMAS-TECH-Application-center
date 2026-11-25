"use client";

import { A4_MM, Button, detachedHtmlSheet, printDocumentHtml, toast } from "@tomas-tc/ui";
import { savePdfsAsZip } from "@tomas-tc/ui/file-viewer";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { renderPdfOnServer } from "../fixtures/tomas-ui.fake-api";
import { SLIP_CSS, ZIP_ORDERS, workOrderSlip } from "../fixtures/tomas-ui.print";
import { TomasUiDemo } from "../TomasUiDemo";
import SAMPLE_PDF from "./samples/work-order.pdf?url";

const renderPdf = async (sheets: Element[]) => renderPdfOnServer(await printDocumentHtml(sheets, A4_MM), SAMPLE_PDF);

export function PdfZipDemo() {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const save = async (codes: string[]) => {
    setSaving(true);
    const documents = codes.map((code) => ({ sheets: [detachedHtmlSheet(workOrderSlip(code, 8), SLIP_CSS, A4_MM)], fileName: `${code}.pdf` }));
    await savePdfsAsZip(documents, "work-orders", renderPdf);
    setSaving(false);
    toast.success(t("TUI.downloaded"));
  };
  return (
    <TomasUiDemo id="pdf-zip">
      <p className="text-muted-foreground text-sm">{t("TUI.pdfZipNote")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={saving} onClick={() => void save(ZIP_ORDERS.slice(0, 1))}>
          {t("TUI.onePdf")}
        </Button>
        <Button disabled={saving} aria-busy={saving} onClick={() => void save(ZIP_ORDERS)}>
          {t("TUI.zipOfPdfs")} ({ZIP_ORDERS.length})
        </Button>
      </div>
    </TomasUiDemo>
  );
}
