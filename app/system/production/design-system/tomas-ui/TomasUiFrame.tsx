"use client";

import { PortalContainerProvider, TooltipProvider } from "@tomas-tc/ui";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../i18n";
import { TOMAS_UI_FRAME_DOC } from "./config/tomas-ui.constants";
import type { TomasUiFrameProps } from "./types/tomas-ui.types";
import { TOMAS_UI_STYLES } from "./utils/tomas-ui-styles";

// The package ships Tailwind preflight and :root tokens (--muted, --border, --canvas) that collide with
// globals.css both ways, so it renders into its own document; its overlays portal there too.
export function TomasUiFrame({ look, children }: TomasUiFrameProps) {
  const t = useT();
  const [frame, setFrame] = useState<Document | null>(null);
  const [lookRoot, setLookRoot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <iframe className="ds-tomas-frame" title={t("DS.tomasFrame")} srcDoc={TOMAS_UI_FRAME_DOC} onLoad={(event) => setFrame(event.currentTarget.contentDocument)} />
      {frame && (
        <>
          {createPortal(<style>{TOMAS_UI_STYLES}</style>, frame.head)}
          {createPortal(
            // The platform look cascades from data-platform, so overlays portal into this root, not the body.
            <div ref={setLookRoot} className="contents" data-platform={look}>
              <PortalContainerProvider container={lookRoot ?? frame.body}>
                <TooltipProvider>{children}</TooltipProvider>
              </PortalContainerProvider>
            </div>,
            frame.body,
          )}
        </>
      )}
    </>
  );
}
