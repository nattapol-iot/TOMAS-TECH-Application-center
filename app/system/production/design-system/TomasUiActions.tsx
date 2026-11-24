"use client";

import { Avatar, AvatarFallback, Badge, Button } from "@tomas-tc/ui";
import { TOMAS_BADGE_VARIANTS, TOMAS_BUTTON_SIZES, TOMAS_BUTTON_VARIANTS } from "./config/design-system.constants";
import { TomasUiSection } from "./TomasUiSection";

export function TomasUiActions() {
  return (
    <TomasUiSection title="DS.tuiActions">
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
        <Button disabled>disabled</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {TOMAS_BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
        <Avatar>
          <AvatarFallback>TT</AvatarFallback>
        </Avatar>
      </div>
    </TomasUiSection>
  );
}
