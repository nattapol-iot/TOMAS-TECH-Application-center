"use client";

import { CommandDemo } from "./CommandDemo";
import { ConfirmDemo } from "./ConfirmDemo";
import { ContextMenuDemo } from "./ContextMenuDemo";
import { DiagnosticsDemo } from "./DiagnosticsDemo";
import { DialogsDemo } from "./DialogsDemo";
import { DropdownMenuDemo } from "./DropdownMenuDemo";
import { PopoverTooltipDemo } from "./PopoverTooltipDemo";
import { ReasonDialogDemo } from "./ReasonDialogDemo";
import { ServerErrorsDemo } from "./ServerErrorsDemo";
import { StatesDemo } from "./StatesDemo";
import { ToastDemo } from "./ToastDemo";
import { TooltipHintDemo } from "./TooltipHintDemo";

export function FeedbackSection() {
  return (
    <>
      <DialogsDemo />
      <ConfirmDemo />
      <DropdownMenuDemo />
      <ContextMenuDemo />
      <PopoverTooltipDemo />
      <CommandDemo />
      <ToastDemo />
      <StatesDemo />
      <ReasonDialogDemo />
      <ServerErrorsDemo />
      <DiagnosticsDemo />
      <TooltipHintDemo />
    </>
  );
}
