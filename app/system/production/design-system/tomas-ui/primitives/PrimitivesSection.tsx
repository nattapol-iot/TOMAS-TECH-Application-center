"use client";

import { AvatarsDemo } from "./AvatarsDemo";
import { ButtonsDemo } from "./ButtonsDemo";
import { CalendarDemo } from "./CalendarDemo";
import { CardsDemo } from "./CardsDemo";
import { DisclosureDemo } from "./DisclosureDemo";
import { InputsDemo } from "./InputsDemo";
import { ResizableDemo } from "./ResizableDemo";
import { SelectDemo } from "./SelectDemo";
import { TabsTableDemo } from "./TabsTableDemo";

export function PrimitivesSection() {
  return (
    <>
      <ButtonsDemo />
      <AvatarsDemo />
      <CardsDemo />
      <InputsDemo />
      <SelectDemo />
      <TabsTableDemo />
      <DisclosureDemo />
      <ResizableDemo />
      <CalendarDemo />
    </>
  );
}
