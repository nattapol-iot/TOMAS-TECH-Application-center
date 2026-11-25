"use client";

import { Label, PageThumbnailRail, PdfViewerToolbar, Switch } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { PDF_PAGE_COUNT } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function PdfControlsDemo() {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);
  const [rail, setRail] = useState(true);
  return (
    <TomasUiDemo id="pdf-controls">
      <PdfViewerToolbar zoom={zoom} current={page} count={PDF_PAGE_COUNT} onZoomChange={setZoom} onJump={setPage} onFit={() => setZoom(1)} />
      <Label>
        <Switch checked={rail} onCheckedChange={setRail} />
        PageThumbnailRail
      </Label>
      <div className="flex h-72 overflow-hidden rounded-lg border">
        <PageThumbnailRail
          count={PDF_PAGE_COUNT}
          current={page}
          open={rail}
          label={t("TUI.docPages")}
          renderThumb={(index) => <div className="flex aspect-[3/4] items-center justify-center text-xs text-gray-500">{index + 1}</div>}
          onSelect={setPage}
        />
        <div className="bg-muted/40 flex flex-1 items-start justify-center overflow-auto p-4">
          <div className="flex aspect-[3/4] items-center justify-center rounded border bg-white text-2xl text-gray-400 shadow-sm" style={{ width: `${Math.round(160 * zoom)}px` }}>
            {page + 1}
          </div>
        </div>
      </div>
    </TomasUiDemo>
  );
}
