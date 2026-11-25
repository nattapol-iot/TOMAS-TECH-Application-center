"use client";

import { FileViewer, fileViewerKind } from "@tomas-tc/ui/file-viewer";
import { useState } from "react";
import { FILE_SAMPLE_KINDS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import type { FileSampleKind } from "../types/tomas-ui.types";
import { FILE_SAMPLES, UNSUPPORTED_SAMPLE } from "./file-samples";

export function FileViewerDemo() {
  const [kind, setKind] = useState<FileSampleKind>("pdf");
  const sample = FILE_SAMPLES[kind];
  return (
    <TomasUiDemo id="file-viewer">
      <TomasUiStates options={FILE_SAMPLE_KINDS} value={kind} onChange={setKind} />
      <FileViewer key={kind} src={sample.src} fileName={sample.name} className="h-[28rem] overflow-hidden rounded-lg border" />
      <p className="text-muted-foreground font-mono text-xs">
        fileViewerKind: {[...Object.values(FILE_SAMPLES).map((item) => item.name), UNSUPPORTED_SAMPLE].map((name) => `${name} = ${fileViewerKind(name) ?? "null"}`).join(", ")}
      </p>
      <FileViewer src={UNSUPPORTED_SAMPLE} downloadable={false} toolbar={false} className="rounded-lg border" />
    </TomasUiDemo>
  );
}
