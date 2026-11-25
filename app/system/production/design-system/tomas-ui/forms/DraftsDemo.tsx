"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  clearFormDrafts,
  idbDraftStore,
  readFormDraft,
  toast,
  useDialogDraft,
  useFormDraft,
} from "@tomas-tc/ui";
import { useEffect, useState } from "react";
import { useT } from "../../../../i18n";
import { DIALOG_DRAFT_KEY, DRAFT_SCOPE, EMPTY_DRAFT_NOTE, FORM_DRAFT_KEY } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import type { DraftNote, DraftReply } from "../types/tomas-ui.types";

export function DraftsDemo() {
  const t = useT();
  const [note, setNote] = useState<DraftNote>(EMPTY_DRAFT_NOTE);
  const [stored, setStored] = useState("-");
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const draft = useFormDraft({
    key: FORM_DRAFT_KEY,
    enabled: true,
    dirty: note.title !== "" || note.body !== "",
    snapshot: note,
    onRestore: (data) => {
      setNote(data);
      toast(t("TUI.draftRestored"));
    },
  });
  const { hydrated, dirty } = useDialogDraft<DraftReply>({
    key: DIALOG_DRAFT_KEY,
    open,
    scope: DRAFT_SCOPE,
    snapshot: { reply },
    apply: (data) => setReply(data.reply),
    resume: () => {
      setOpen(true);
      toast(t("TUI.draftResumed"));
    },
  });
  useEffect(() => {
    if (open) hydrated();
  }, [open, hydrated]);
  return (
    <TomasUiDemo id="drafts">
      <p className="text-muted-foreground text-sm">{t("TUI.draftsNote")}</p>
      <div className="grid gap-1.5">
        <Label htmlFor="tui-draft-title">{t("TUI.noteTitle")}</Label>
        <Input id="tui-draft-title" value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} />
        <Label htmlFor="tui-draft-body">{t("TUI.noteBody")}</Label>
        <Textarea id="tui-draft-body" rows={3} value={note.body} onChange={(event) => setNote({ ...note, body: event.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void idbDraftStore.set(FORM_DRAFT_KEY, note).then(() => toast.success(t("TUI.saved")))}>
          idbDraftStore.set
        </Button>
        <Button size="sm" variant="outline" onClick={() => void readFormDraft<DraftNote>(FORM_DRAFT_KEY).then((data) => setStored(data ? JSON.stringify(data) : t("TUI.noDraft")))}>
          readFormDraft
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void draft.clear().then(() => {
              setNote(EMPTY_DRAFT_NOTE);
              setStored(t("TUI.noDraft"));
            })
          }
        >
          {t("TUI.discardDraft")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void clearFormDrafts([FORM_DRAFT_KEY, DIALOG_DRAFT_KEY]).then(() => toast(t("TUI.draftsCleared")))}>
          clearFormDrafts
        </Button>
      </div>
      <code className="bg-muted rounded px-2 py-1 font-mono text-xs break-all">{stored}</code>
      <Button className="self-start" onClick={() => setOpen(true)}>
        {t("TUI.replyToOrder")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("TUI.replyToOrder")}</DialogTitle>
            <DialogDescription>{t("TUI.dialogDraftNote")}</DialogDescription>
          </DialogHeader>
          <Textarea aria-label={t("TUI.replyToOrder")} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} />
          <DialogFooter className="items-center">
            {dirty && <Badge variant="secondary">{t("TUI.unsaved")}</Badge>}
            <Button
              onClick={() => {
                setOpen(false);
                setReply("");
                toast.success(t("TUI.sent"));
              }}
            >
              {t("TUI.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TomasUiDemo>
  );
}
