"use client";

import type { SplitRatio } from "@tomas-tc/blueprint";
import { Button, HeaderActionsMenu, NamedIcon, PAGE_CARD_CLASS, PageFrame, SplitPanes, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_SPLIT_RATIOS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";

export function LayoutDemo() {
  const t = useT();
  const [ratio, setRatio] = useState<SplitRatio>("1:2");
  return (
    <TomasUiDemo id="layout">
      <TomasUiStates options={TOMAS_SPLIT_RATIOS} value={ratio} onChange={setRatio} />
      <div className="rounded-lg border p-4">
        <PageFrame
          title="Riverside Plant"
          description={t("TUI.pageFrameNote")}
          actions={
            <>
              <Button size="sm">
                <NamedIcon name="plus" />
                {t("TUI.newWorkOrder")}
              </Button>
              <HeaderActionsMenu>
                <Button variant="ghost" size="sm" onClick={() => toast(t("TUI.export"))}>
                  {t("TUI.export")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toast(t("TUI.archive"))}>
                  {t("TUI.archive")}
                </Button>
              </HeaderActionsMenu>
            </>
          }
        >
          <SplitPanes
            ratio={ratio}
            className="h-56"
            panes={[
              <div key="list" className={PAGE_CARD_CLASS}>
                {t("TUI.devices")}
              </div>,
              <div key="detail" className={PAGE_CARD_CLASS}>
                {t("TUI.details")}
              </div>,
            ]}
          />
        </PageFrame>
      </div>
    </TomasUiDemo>
  );
}
