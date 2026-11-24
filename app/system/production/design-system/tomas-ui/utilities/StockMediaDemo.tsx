"use client";

import { NamedIcon, StockMediaProvider, StockPhotoFrame } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { STOCK_HINT } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function StockMediaDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="stock-media">
      <p className="text-muted-foreground text-sm">{t("TUI.stockNote")}</p>
      <StockMediaProvider endpoint={undefined}>
        <div className="bg-muted h-40 w-64 overflow-hidden rounded-lg">
          <StockPhotoFrame
            hint={STOCK_HINT}
            pickKey="dev-1"
            alt="Gateway A-01"
            fallback={
              <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 text-xs">
                <NamedIcon name="image-off" className="size-6" />
                {t("TUI.stockFallback")}
              </div>
            }
          />
        </div>
      </StockMediaProvider>
    </TomasUiDemo>
  );
}
