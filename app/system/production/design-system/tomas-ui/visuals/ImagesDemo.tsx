"use client";

import { FallbackImage, ImageCard } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { BROKEN_IMAGE, SITE_IMAGE, TOMAS_AVATAR_IMAGE } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function ImagesDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="images">
      <div className="grid gap-3 sm:grid-cols-3">
        <ImageCard src={SITE_IMAGE} title="Riverside Plant" subtitle={t("TUI.pumpRoom")} overlay />
        <ImageCard src={null} title="Hillview Depot" subtitle={t("TUI.noPhoto")} />
        <ImageCard src={BROKEN_IMAGE} title="Harbour Warehouse" subtitle={t("TUI.brokenPhoto")} />
      </div>
      <ImageCard src={SITE_IMAGE} natural className="max-w-xs" />
      <div className="flex items-center gap-3">
        <div className="size-16 overflow-hidden rounded border">
          <FallbackImage src={TOMAS_AVATAR_IMAGE} className="size-full object-cover" />
        </div>
        <div className="size-16 overflow-hidden rounded border">
          <FallbackImage src={BROKEN_IMAGE} className="size-full object-cover" />
        </div>
        <span className="text-muted-foreground text-sm">FallbackImage</span>
      </div>
    </TomasUiDemo>
  );
}
