"use client";

import { Skeleton } from "@tomas-tc/ui";
import { memo, Suspense } from "react";
import { TOMAS_UI_SECTION_BODIES } from "./config/tomas-ui.bodies";
import { TOMAS_UI_SECTIONS } from "./config/tomas-ui.coverage";
import { TomasUiNotShown } from "./TomasUiNotShown";
import { TomasUiSection } from "./TomasUiSection";
import type { TomasUiPageProps } from "./types/tomas-ui.types";

// Only the picked section is mounted, and memo keeps a look switch from rendering its samples again.
export const TomasUiPage = memo(function TomasUiPage({ view }: TomasUiPageProps) {
  const spec = TOMAS_UI_SECTIONS.find((section) => section.id === view);
  if (!spec) return <TomasUiNotShown />;
  const Body = TOMAS_UI_SECTION_BODIES[spec.id];
  return (
    <TomasUiSection spec={spec}>
      <Suspense fallback={<Skeleton className="h-64 xl:col-span-2" />}>
        <Body />
      </Suspense>
    </TomasUiSection>
  );
});
