"use client";

import { Input, Label, OpenLinkButton, PageJump } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { REPORT_PAGE_COUNT, SAMPLE_LINK } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function PageJumpLinksDemo() {
  const t = useT();
  const [page, setPage] = useState(2);
  const [url, setUrl] = useState(SAMPLE_LINK);
  return (
    <TomasUiDemo id="page-jump-links">
      <div className="flex flex-wrap items-center gap-3">
        <PageJump current={page} count={REPORT_PAGE_COUNT} onJump={setPage} />
        <span className="text-muted-foreground text-sm">
          {t("TUI.reportPage")} {page + 1} / {REPORT_PAGE_COUNT}
        </span>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tui-open-link">{t("TUI.manualLink")}</Label>
        <div className="flex items-center gap-2">
          <Input id="tui-open-link" value={url} onChange={(event) => setUrl(event.target.value)} />
          <OpenLinkButton url={url} />
          <OpenLinkButton url="" />
        </div>
      </div>
    </TomasUiDemo>
  );
}
