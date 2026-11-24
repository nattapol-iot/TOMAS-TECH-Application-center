"use client";

import { DataTableDemo } from "./DataTableDemo";
import { EntityTableDemo } from "./EntityTableDemo";
import { FieldCellDemo } from "./FieldCellDemo";
import { RepeatViewDemo } from "./RepeatViewDemo";
import { ViewRowsDemo } from "./ViewRowsDemo";

export function DataSection() {
  return (
    <>
      <DataTableDemo />
      <FieldCellDemo />
      <EntityTableDemo />
      <RepeatViewDemo />
      <ViewRowsDemo />
    </>
  );
}
