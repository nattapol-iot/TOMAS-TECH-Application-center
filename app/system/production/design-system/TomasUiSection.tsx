"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@tomas-tc/ui";
import { useT } from "../../i18n";
import type { TomasUiSectionProps } from "./types/design-system.types";

export function TomasUiSection({ title, children }: TomasUiSectionProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(title)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
