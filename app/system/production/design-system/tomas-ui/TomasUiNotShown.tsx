"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomas-tc/ui";
import { useT } from "../../../i18n";
import { TOMAS_UI_INTERNALS, TOMAS_UI_NOT_SHOWN } from "./config/tomas-ui.coverage";

export function TomasUiNotShown() {
  const t = useT();
  return (
    <section id="tui-not-shown" aria-labelledby="tui-not-shown-title" className="flex scroll-mt-16 flex-col gap-4">
      <header className="flex flex-col gap-1 border-b pb-3">
        <h2 id="tui-not-shown-title" className="text-xl font-semibold">
          {t("TUI.notShown")}
        </h2>
        <p className="text-muted-foreground text-sm">{t(TOMAS_UI_NOT_SHOWN.length === 0 ? "TUI.notShownNone" : "TUI.notShownNote")}</p>
      </header>
      {TOMAS_UI_NOT_SHOWN.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("TUI.exportName")}</TableHead>
              <TableHead>{t("TUI.reason")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TOMAS_UI_NOT_SHOWN.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-mono">{item.name}</TableCell>
                <TableCell className="whitespace-normal">{t(item.reason)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("TUI.internals")}</CardTitle>
          <CardDescription>{t("TUI.internalsNote")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("TUI.internalPart")}</TableHead>
                <TableHead>{t("TUI.seenIn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TOMAS_UI_INTERNALS.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="font-mono whitespace-normal">{item.name}</TableCell>
                  <TableCell className="font-mono whitespace-normal">{item.seenIn}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
