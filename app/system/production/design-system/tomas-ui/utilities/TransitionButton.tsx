"use client";

import { Button, useRowTransition } from "@tomas-tc/ui";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import type { TransitionButtonProps } from "../types/tomas-ui.types";

export function TransitionButton({ field, to }: TransitionButtonProps) {
  const move = useRowTransition(field, to, SAMPLE_ADAPTERS);
  return (
    <>
      <Button size="sm" variant={move.allowed ? "default" : "outline"} disabled={!move.allowed} onClick={move.run}>
        useRowTransition: {to}
      </Button>
      {move.dialog}
    </>
  );
}
