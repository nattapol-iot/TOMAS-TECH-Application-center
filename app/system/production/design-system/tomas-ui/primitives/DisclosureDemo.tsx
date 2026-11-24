"use client";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  NamedIcon,
  ScrollArea,
  ScrollBar,
} from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { SAMPLE_HREF, TOMAS_DEVICE_ROWS, TOMAS_LOG_LINES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { stayOnPage } from "../utils/stay-on-page";

export function DisclosureDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="disclosure">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={SAMPLE_HREF} onClick={stayOnPage}>
              Sites
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={SAMPLE_HREF} onClick={stayOnPage}>
              Riverside Plant
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Gateway A-01</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Collapsible className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("TUI.devicesAtSite")}</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("TUI.toggle")}>
              <NamedIcon name="chevrons-up-down" />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="flex flex-col gap-1 text-sm">
          {TOMAS_DEVICE_ROWS.map((row) => (
            <span key={row.name}>{row.name}</span>
          ))}
        </CollapsibleContent>
      </Collapsible>
      <div className="grid gap-4 sm:grid-cols-2">
        <ScrollArea className="h-40 rounded-md border">
          <div className="flex flex-col gap-1 p-3 font-mono text-xs">
            {TOMAS_LOG_LINES.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </ScrollArea>
        <ScrollArea className="w-full rounded-md border whitespace-nowrap">
          <div className="flex w-max gap-3 p-3">
            {TOMAS_LOG_LINES.map((line) => (
              <span key={line} className="bg-muted rounded px-2 py-6 font-mono text-xs">
                {line}
              </span>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </TomasUiDemo>
  );
}
