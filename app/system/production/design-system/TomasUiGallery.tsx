"use client";

import { Panel } from "../../ui";
import { TomasUiActions } from "./TomasUiActions";
import { TomasUiData } from "./TomasUiData";
import { TomasUiForms } from "./TomasUiForms";
import { TomasUiFrame } from "./TomasUiFrame";
import { TomasUiOverlays } from "./TomasUiOverlays";

export function TomasUiGallery() {
  return (
    <Panel title="DS.tabTomasUi" subtitle="DS.tomasNote">
      <TomasUiFrame>
        <main className="flex flex-col gap-6 p-6">
          <TomasUiActions />
          <TomasUiForms />
          <TomasUiData />
          <TomasUiOverlays />
        </main>
      </TomasUiFrame>
    </Panel>
  );
}
