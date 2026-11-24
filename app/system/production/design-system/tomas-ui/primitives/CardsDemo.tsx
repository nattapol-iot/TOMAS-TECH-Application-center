"use client";

import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Separator, Skeleton } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_SKELETON_ROWS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function CardsDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="cards">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gateway A-01</CardTitle>
            <CardDescription>Riverside Plant</CardDescription>
            <CardAction>
              <Badge>Online</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex h-6 items-center gap-3 text-sm">
            <span>99.9%</span>
            <Separator orientation="vertical" />
            <span>FW 4.2.1</span>
            <Separator orientation="vertical" />
            <span>3 sensors</span>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" size="sm">
              {t("TUI.details")}
            </Button>
          </CardFooter>
        </Card>
        <Card aria-busy="true">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {TOMAS_SKELETON_ROWS.map((row) => (
              <Skeleton key={row} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
      <Separator />
    </TomasUiDemo>
  );
}
