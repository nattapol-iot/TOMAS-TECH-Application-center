"use client";

import { Badge, Button, NamedIcon, badgeVariants, buttonVariants } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { SAMPLE_HREF, TOMAS_BADGE_VARIANTS, TOMAS_BUTTON_SIZES, TOMAS_BUTTON_VARIANTS, TOMAS_ICON_BUTTON_SIZES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { stayOnPage } from "../utils/stay-on-page";

export function ButtonsDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="buttons">
      <div className="flex flex-wrap items-center gap-2">
        {TOMAS_BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {TOMAS_BUTTON_SIZES.map((size) => (
          <Button key={size} variant="outline" size={size}>
            {size}
          </Button>
        ))}
        {TOMAS_ICON_BUTTON_SIZES.map((size) => (
          <Button key={size} variant="outline" size={size} aria-label={size}>
            <NamedIcon name="settings" />
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button>
          <NamedIcon name="plus" />
          {t("TUI.withIcon")}
        </Button>
        <Button disabled>{t("TUI.disabled")}</Button>
        <Button asChild variant="secondary">
          <a href={SAMPLE_HREF} onClick={stayOnPage}>
            asChild
          </a>
        </Button>
        <a href={SAMPLE_HREF} onClick={stayOnPage} className={buttonVariants({ variant: "link" })}>
          buttonVariants()
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {TOMAS_BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
        <span className={badgeVariants({ variant: "outline" })}>badgeVariants()</span>
      </div>
    </TomasUiDemo>
  );
}
