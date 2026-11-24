"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_SHEET_SIDES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function DialogsDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="dialogs">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("DS.sampleDialog")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("TUI.renameDevice")}</DialogTitle>
              <DialogDescription>{t("DS.sampleBody")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="tui-dialog-name">{t("TUI.name")}</Label>
              <Input id="tui-dialog-name" defaultValue="Gateway A-01" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("Cancel")}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>{t("Save")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost">{t("TUI.noCloseButton")}</Button>
          </DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t("TUI.noCloseButton")}</DialogTitle>
              <DialogDescription>{t("DS.sampleBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
        {TOMAS_SHEET_SIDES.map((side) => (
          <Sheet key={side}>
            <SheetTrigger asChild>
              <Button variant="outline">Sheet {side}</Button>
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>{t("DS.sampleDrawer")}</SheetTitle>
                <SheetDescription>{t("DS.sampleBody")}</SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <SheetClose asChild>
                  <Button>{t("Close")}</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </div>
    </TomasUiDemo>
  );
}
