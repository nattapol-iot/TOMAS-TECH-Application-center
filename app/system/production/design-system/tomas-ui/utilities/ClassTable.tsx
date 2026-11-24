"use client";

import type { ClassTableProps } from "../types/tomas-ui.types";

export function ClassTable({ rows }: ClassTableProps) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="font-mono">{name}</dt>
          <dd className="text-muted-foreground font-mono break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
