"use client";

import { Button, ReasonDialog, TYPED_CONFIRM_FIELD, TypedConfirmField, toast, typedConfirmMatches } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { REASON_DRAFT_KEY, REASON_RECORDS, TYPED_WORD } from "../config/tomas-ui.constants";
import { submitReason } from "../fixtures/tomas-ui.fake-api";
import { TomasUiDemo } from "../TomasUiDemo";

export function ReasonDialogDemo() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [optional, setOptional] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typedConfirmMatches(TYPED_WORD, typed);
  const submit = async (reason: string) => {
    setProcessing(true);
    const next = optional ? {} : await submitReason(reason);
    setProcessing(false);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setOpen(false);
    toast.success(optional ? t("TUI.noteAdded") : t("TUI.orderCancelled"));
  };
  const openWith = (asNote: boolean) => {
    setOptional(asNote);
    setErrors({});
    setOpen(true);
  };
  return (
    <TomasUiDemo id="reason-dialog">
      <p className="text-muted-foreground text-sm">{t("TUI.reasonNote")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" onClick={() => openWith(false)}>
          {t("TUI.cancelOrder")}
        </Button>
        <Button variant="outline" onClick={() => openWith(true)}>
          {t("TUI.addNote")}
        </Button>
      </div>
      <ReasonDialog
        open={open}
        title={optional ? t("TUI.addNote") : t("TUI.cancelOrder")}
        description={optional ? undefined : t("TUI.cancelOrderNote")}
        label={optional ? t("TUI.note") : t("TUI.reason")}
        confirmLabel={optional ? t("Save") : t("TUI.cancelOrder")}
        processing={processing}
        errors={errors}
        draftKey={REASON_DRAFT_KEY}
        recordIds={REASON_RECORDS}
        destructive={!optional}
        optional={optional}
        maxLength={200}
        onOpenChange={setOpen}
        onSubmit={(reason) => void submit(reason)}
        onResume={(ids) => {
          openWith(false);
          toast(`${t("TUI.draftResumed")} ${ids.join(", ")}`);
        }}
      />
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <TypedConfirmField className="min-w-56 flex-1" word={TYPED_WORD} value={typed} error={typed && !matches ? t("TUI.typeTheWord") : undefined} onValueChange={setTyped} />
        <Button
          variant="destructive"
          disabled={!matches}
          onClick={() => {
            setTyped("");
            toast(t("DS.tuiDelete"));
          }}
        >
          {t("DS.tuiDelete")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        TYPED_CONFIRM_FIELD: <code className="font-mono">{TYPED_CONFIRM_FIELD}</code>
      </p>
    </TomasUiDemo>
  );
}
