"use client";

import { Badge, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger } from "@tomas-tc/ui";
import { useT } from "../../i18n";
import { TOMAS_DEVICE_ROWS, TOMAS_SKELETON_ROWS, TOMAS_STATUS_BADGES } from "./config/design-system.constants";
import { TomasUiSection } from "./TomasUiSection";

export function TomasUiData() {
  const t = useT();
  return (
    <TomasUiSection title="DS.tuiData">
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">{t("DS.tuiTable")}</TabsTrigger>
          <TabsTrigger value="loading">{t("DS.tuiLoading")}</TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("DS.tuiDevice")}</TableHead>
                <TableHead>{t("DS.tuiStatus")}</TableHead>
                <TableHead className="text-right">{t("DS.tuiUptime")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TOMAS_DEVICE_ROWS.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Badge variant={TOMAS_STATUS_BADGES[row.status].variant}>{t(TOMAS_STATUS_BADGES[row.status].label)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{row.uptime}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="loading" className="flex flex-col gap-2">
          {TOMAS_SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </TabsContent>
      </Tabs>
    </TomasUiSection>
  );
}
