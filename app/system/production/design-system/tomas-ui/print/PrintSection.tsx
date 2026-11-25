"use client";

import { PdfControlsDemo } from "./PdfControlsDemo";
import { PrintHelpersDemo } from "./PrintHelpersDemo";
import { PrintViewerDemo } from "./PrintViewerDemo";

export function PrintSection() {
  return (
    <>
      <PrintViewerDemo />
      <PrintHelpersDemo />
      <PdfControlsDemo />
    </>
  );
}
