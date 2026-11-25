"use client";

import { FileDropControl, FileInput, ImageInput, Label, formatFileSize, toast, type StoredFile } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { STORED_FILES, TOMAS_AVATAR_IMAGE } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function FileInputsDemo() {
  const t = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState<StoredFile[]>(STORED_FILES);
  const [drop, setDrop] = useState<string | null>("wiring-diagram.pdf");
  const [image, setImage] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const total = [...files, ...existing].reduce((sum, file) => sum + (file.size ?? 0), 0);
  return (
    <TomasUiDemo id="file-inputs">
      <div className="grid gap-1.5">
        <Label htmlFor="tui-files">FileInput</Label>
        <FileInput
          id="tui-files"
          value={files}
          multiple
          accept=".pdf,.png,.jpg,.csv"
          maxSizeKb={2048}
          hint={t("TUI.fileHint")}
          existing={existing}
          onRemoveExisting={(index) => setExisting((current) => current.filter((_, at) => at !== index))}
          onChange={setFiles}
        />
        <p className="text-muted-foreground text-xs">
          formatFileSize: {formatFileSize(total)} ({files.length + existing.length})
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tui-file-drop">FileDropControl</Label>
        <FileDropControl id="tui-file-drop" value={drop} accept=".pdf" maxSizeKb={1024} onChange={setDrop} onFile={(file) => toast(`${file.name} ${formatFileSize(file.size)}`)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tui-image">ImageInput</Label>
        <ImageInput
          id="tui-image"
          src={TOMAS_AVATAR_IMAGE}
          accept="image/*"
          maxSizeKb={1024}
          emptyText={t("TUI.noPhoto")}
          removeLabel={t("TUI.removePhoto")}
          imageClassName="size-24 rounded-full"
          file={image}
          removed={removed}
          onFileChange={setImage}
          onRemovedChange={setRemoved}
        />
      </div>
    </TomasUiDemo>
  );
}
