"use client";

import { Badge, Skeleton, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_DEVICE_ROWS, TOMAS_SKELETON_ROWS, TOMAS_STATUS_BADGES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function TabsTableDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="tabs-table">
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">{t("DS.tuiTable")}</TabsTrigger>
          <TabsTrigger value="loading">{t("DS.tuiLoading")}</TabsTrigger>
          <TabsTrigger value="locked" disabled>
            {t("TUI.disabled")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          <Table>
            <TableCaption>{t("TUI.tableCaption")}</TableCaption>
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
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>{t("TUI.average")}</TableCell>
                <TableCell className="text-right">89.5%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TabsContent>
        <TabsContent value="loading" className="flex flex-col gap-2">
          {TOMAS_SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </TabsContent>
      </Tabs>
      <Tabs defaultValue="north" orientation="vertical" className="flex-row">
        <TabsList>
          <TabsTrigger value="north">North</TabsTrigger>
          <TabsTrigger value="south">South</TabsTrigger>
        </TabsList>
        <TabsContent value="north" className="text-sm">
          Hillview Depot, Mountain Relay
        </TabsContent>
        <TabsContent value="south" className="text-sm">
          Palm Bay Office, Beach Relay
        </TabsContent>
      </Tabs>
    </TomasUiDemo>
  );
}
