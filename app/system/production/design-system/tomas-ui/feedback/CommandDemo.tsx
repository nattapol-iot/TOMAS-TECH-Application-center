"use client";

import { Button, Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut, toast } from "@tomas-tc/ui";
import { Fragment, useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_COMMANDS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function CommandDemo() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const items = TOMAS_COMMANDS.map((group, index) => (
    <Fragment key={group.group}>
      {index > 0 && <CommandSeparator />}
      <CommandGroup heading={group.group}>
        {group.items.map((item) => (
          <CommandItem
            key={item.label}
            onSelect={() => {
              setOpen(false);
              toast(item.label);
            }}
          >
            {item.label}
            <CommandShortcut>{item.shortcut}</CommandShortcut>
          </CommandItem>
        ))}
      </CommandGroup>
    </Fragment>
  ));
  return (
    <TomasUiDemo id="command">
      <Command className="rounded-lg border">
        <CommandInput placeholder={t("DS.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("TUI.noMatch")}</CommandEmpty>
          {items}
        </CommandList>
      </Command>
      <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
        CommandDialog
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("TUI.commandTitle")} description={t("DS.placeholder")}>
        <CommandInput placeholder={t("DS.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("TUI.noMatch")}</CommandEmpty>
          {items}
        </CommandList>
      </CommandDialog>
    </TomasUiDemo>
  );
}
