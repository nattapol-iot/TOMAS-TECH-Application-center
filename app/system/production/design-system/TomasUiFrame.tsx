"use client";

import { PortalContainerProvider, TooltipProvider } from "@tomas-tc/ui";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { TOMAS_UI_FRAME_DOC } from "./config/design-system.constants";
import TOMAS_UI_CSS from "./tomas-ui.css?inline";
import type { TomasUiFrameProps } from "./types/design-system.types";

// The package ships Tailwind preflight and :root tokens (--muted, --border, --canvas) that collide with
// globals.css both ways, so it renders into its own document; its overlays portal there too.
export function TomasUiFrame({ children }: TomasUiFrameProps) {
  const t = useT();
  const [frame, setFrame] = useState<Document | null>(null);
  return (
    <>
      <iframe className="ds-tomas-frame" title={t("DS.tomasFrame")} srcDoc={TOMAS_UI_FRAME_DOC} onLoad={(event) => setFrame(event.currentTarget.contentDocument)} />
      {frame && (
        <>
          {createPortal(<style>{TOMAS_UI_CSS}</style>, frame.head)}
          {createPortal(
            <PortalContainerProvider container={frame.body}>
              <TooltipProvider>{children}</TooltipProvider>
            </PortalContainerProvider>,
            frame.body,
          )}
        </>
      )}
    </>
  );
}
