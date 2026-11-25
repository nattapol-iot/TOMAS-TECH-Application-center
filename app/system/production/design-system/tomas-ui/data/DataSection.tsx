"use client";

import { DataTableDemo } from "./DataTableDemo";
import { EntityTableDemo } from "./EntityTableDemo";
import { FieldCellDemo } from "./FieldCellDemo";
import { GridCellsDemo } from "./GridCellsDemo";
import { NumbersDemo } from "./NumbersDemo";
import { PivotTableDemo } from "./PivotTableDemo";
import { RepeatViewDemo } from "./RepeatViewDemo";
import { TableBuilderDemo } from "./TableBuilderDemo";
import { ViewRowsDemo } from "./ViewRowsDemo";

export function DataSection() {
  return (
    <>
      <DataTableDemo />
      <FieldCellDemo />
      <EntityTableDemo />
      <RepeatViewDemo />
      <ViewRowsDemo />
      <NumbersDemo />
      <PivotTableDemo />
      <GridCellsDemo />
      <TableBuilderDemo />
    </>
  );
}
