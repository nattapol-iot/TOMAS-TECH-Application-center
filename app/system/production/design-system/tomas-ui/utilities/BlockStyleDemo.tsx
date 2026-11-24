"use client";

import { GRID_COLUMNS_CLASS, HEADING_CLASS, HEIGHT_CLASS, PADDING_CLASS, SPANNING_GRID_COLUMNS, SPAN_CLASS, STICKY_CLASS, SURFACE_CLASS, blockStyleClass, cn } from "@tomas-tc/ui";
import { SAMPLE_BLOCK_STYLE } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { ClassTable } from "./ClassTable";

export function BlockStyleDemo() {
  return (
    <TomasUiDemo id="block-style">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(SURFACE_CLASS).map(([surface, className]) => (
          <div key={surface} className={cn("rounded-md border p-3 text-xs", className)}>
            {surface}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {Object.entries(HEADING_CLASS).map(([level, className]) => (
          <span key={level} className={className}>
            Heading {level}
          </span>
        ))}
      </div>
      <div className={cn("grid", GRID_COLUMNS_CLASS[3], "gap-2")}>
        {SPANNING_GRID_COLUMNS.map((columns) => (
          <div key={columns} className="bg-muted rounded p-2 text-center font-mono text-xs">
            {columns}
          </div>
        ))}
      </div>
      <div className={cn(blockStyleClass(SAMPLE_BLOCK_STYLE), "text-sm")}>
        blockStyleClass(<code className="font-mono text-xs">{JSON.stringify(SAMPLE_BLOCK_STYLE)}</code>)
      </div>
      <ClassTable
        rows={[
          ["STICKY_CLASS", STICKY_CLASS] as const,
          ...Object.entries(PADDING_CLASS).map(([key, value]) => [`PADDING_CLASS.${key}`, value] as const),
          ...Object.entries(HEIGHT_CLASS).map(([key, value]) => [`HEIGHT_CLASS.${key}`, value] as const),
          ...Object.entries(SPAN_CLASS)
            .slice(0, 4)
            .map(([key, value]) => [`SPAN_CLASS.${key}`, value] as const),
        ]}
      />
    </TomasUiDemo>
  );
}
