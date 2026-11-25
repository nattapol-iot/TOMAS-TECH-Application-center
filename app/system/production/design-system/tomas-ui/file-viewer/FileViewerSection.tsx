"use client";

import { GlobalWorkerOptions } from "pdfjs-dist";
import PDF_WORKER from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FilePreviewDemo } from "./FilePreviewDemo";
import { FileViewerDemo } from "./FileViewerDemo";
import { PdfZipDemo } from "./PdfZipDemo";

// Without a worker URL the viewer falls back to parsing PDFs on the main thread.
GlobalWorkerOptions.workerSrc = PDF_WORKER;

export function FileViewerSection() {
  return (
    <>
      <FileViewerDemo />
      <FilePreviewDemo />
      <PdfZipDemo />
    </>
  );
}
