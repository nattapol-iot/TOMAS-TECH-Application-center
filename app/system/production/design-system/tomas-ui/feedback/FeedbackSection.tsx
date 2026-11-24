"use client";

import { CommandDemo } from "./CommandDemo";
import { ConfirmDemo } from "./ConfirmDemo";
import { ContextMenuDemo } from "./ContextMenuDemo";
import { DialogsDemo } from "./DialogsDemo";
import { DropdownMenuDemo } from "./DropdownMenuDemo";
import { PopoverTooltipDemo } from "./PopoverTooltipDemo";
import { ToastDemo } from "./ToastDemo";

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
    </>
  );
}
