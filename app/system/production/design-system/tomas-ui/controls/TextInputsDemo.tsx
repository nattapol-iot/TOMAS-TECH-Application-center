"use client";

import { Button, InlineEditTrigger, Input, Label, PhoneInput, TOKEN_PATTERN, TokenTextarea } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { MESSAGE_TOKENS, MESSAGE_TOKEN_VALUES, TOMAS_MESSAGE } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function TextInputsDemo() {
  const t = useT();
  const [phone, setPhone] = useState<string | null>("0812345678");
  const [message, setMessage] = useState(TOMAS_MESSAGE);
  const [title, setTitle] = useState("PLC firmware update");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <TomasUiDemo id="text-inputs">
      <div className="grid gap-1.5">
        <Label htmlFor="tui-phone">PhoneInput</Label>
        <PhoneInput id="tui-phone" className="max-w-56" value={phone} onChange={setPhone} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tui-tokens">TokenTextarea</Label>
        <TokenTextarea id="tui-tokens" value={message} tokens={MESSAGE_TOKENS} maxLength={240} onChange={setMessage} />
      </div>
      <div className="bg-muted/50 rounded-md border p-3 text-sm">
        <p className="text-muted-foreground text-xs">TOKEN_PATTERN: {[...message.matchAll(TOKEN_PATTERN)].map((match) => match[1]).join(", ") || "-"}</p>
        <p className="whitespace-pre-wrap">{message.replace(TOKEN_PATTERN, (token, key: string) => MESSAGE_TOKEN_VALUES[key] ?? token)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">InlineEditTrigger:</span>
        {editing === null ? (
          <InlineEditTrigger hint={t("TUI.clickToEdit")} onClick={() => setEditing(title)}>
            {title}
          </InlineEditTrigger>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setTitle(editing.trim() || title);
              setEditing(null);
            }}
          >
            <Input aria-label={t("TUI.noteTitle")} className="h-8 w-56" value={editing} onChange={(event) => setEditing(event.target.value)} />
            <Button size="sm" type="submit">
              {t("Save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              {t("TUI.cancel")}
            </Button>
          </form>
        )}
      </div>
    </TomasUiDemo>
  );
}
