"use client";

import { FilePreview } from "@tomas-tc/ui";
import { FileViewer } from "@tomas-tc/ui/file-viewer";
import { TomasUiDemo } from "../TomasUiDemo";
import { FILE_SAMPLES } from "./file-samples";

export function FilePreviewDemo() {
  return (
    <TomasUiDemo id="file-preview">
      <FilePreview name={FILE_SAMPLES.md.name} src={FILE_SAMPLES.md.src} viewer={FileViewer} className="max-h-72 overflow-auto" />
      <div className="grid gap-3 sm:grid-cols-2">
        <FilePreview name={FILE_SAMPLES.docx.name} />
        <FilePreview name={FILE_SAMPLES.xlsx.name} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <FilePreview name={FILE_SAMPLES.image.name} thumbnail="lg" />
        <FilePreview name={FILE_SAMPLES.image.name} thumbnail="sm" />
        <FilePreview name={FILE_SAMPLES.pdf.name} thumbnail="sm" />
      </div>
    </TomasUiDemo>
  );
}
