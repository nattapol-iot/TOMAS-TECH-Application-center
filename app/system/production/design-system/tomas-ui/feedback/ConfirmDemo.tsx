"use client";

import { Button, ConfirmDialog, UnsavedChangesDialog, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TomasUiDemo } from "../TomasUiDemo";
import type { ConfirmSample } from "../types/tomas-ui.types";

export function ConfirmDemo() {
  const t = useT();
  const [confirm, setConfirm] = useState<ConfirmSample | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  return (
    <TomasUiDemo id="confirm">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setConfirm("plain")}>
          {t("TUI.confirmPlain")}
        </Button>
        <Button variant="destructive" onClick={() => setConfirm("destructive")}>
          {t("DS.tuiDelete")}
        </Button>
        <Button variant="outline" onClick={() => setConfirm("processing")}>
          {t("TUI.saving")}
        </Button>
        <Button variant="outline" onClick={() => setUnsaved(true)}>
          {t("TUI.leaveForm")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={t(confirm === "destructive" ? "TUI.confirmDelete" : "TUI.confirmStart")}
        description={t("TUI.confirmNote")}
        confirmLabel={confirm === "destructive" ? t("DS.tuiDelete") : undefined}
        destructive={confirm === "destructive"}
        processing={confirm === "processing"}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        onConfirm={() => {
          toast.success(t("TUI.done"));
          setConfirm(null);
        }}
      />
      <UnsavedChangesDialog
        open={unsaved}
        onStay={() => setUnsaved(false)}
        onDiscard={() => {
          setUnsaved(false);
          toast(t("TUI.discarded"));
        }}
      />
    </TomasUiDemo>
  );
}
