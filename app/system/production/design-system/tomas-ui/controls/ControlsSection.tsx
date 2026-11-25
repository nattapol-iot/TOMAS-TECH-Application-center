"use client";

import { FileInputsDemo } from "./FileInputsDemo";
import { MonthPickersDemo } from "./MonthPickersDemo";
import { StandaloneControlsDemo } from "./StandaloneControlsDemo";
import { TextInputsDemo } from "./TextInputsDemo";

export function ControlsSection() {
  return (
    <>
      <StandaloneControlsDemo />
      <MonthPickersDemo />
      <TextInputsDemo />
      <FileInputsDemo />
    </>
  );
}
