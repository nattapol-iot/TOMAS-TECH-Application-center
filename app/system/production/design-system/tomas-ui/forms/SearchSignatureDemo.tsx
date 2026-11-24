"use client";

import { Badge, SearchInput, SignaturePad } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { DEVICE_ROWS } from "../fixtures/tomas-ui.rows";
import { TomasUiDemo } from "../TomasUiDemo";

export function SearchSignatureDemo() {
  const t = useT();
  const [search, setSearch] = useState("");
  const found = DEVICE_ROWS.filter((row) => String(row.name).toLowerCase().includes(search.toLowerCase()));
  return (
    <TomasUiDemo id="search-signature">
      <SearchInput value={search} onValueChange={setSearch} placeholder={t("DS.placeholder")} aria-label={t("TUI.searchDevices")} />
      <div className="flex min-h-6 flex-wrap gap-1">
        {found.length === 0 ? (
          <span className="text-muted-foreground text-sm">{t("TUI.noMatch")}</span>
        ) : (
          found.map((row) => (
            <Badge key={row.id} variant="secondary">
              {String(row.name)}
            </Badge>
          ))
        )}
      </div>
      <SignaturePad id="tui-signature" ariaLabel={t("TUI.signHere")} className="h-40" />
    </TomasUiDemo>
  );
}
