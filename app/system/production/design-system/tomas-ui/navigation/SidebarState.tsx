"use client";

import { Badge, Button, useSidebar } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";

export function SidebarState() {
  const t = useT();
  const sidebar = useSidebar();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>useSidebar()</span>
      <Badge variant="outline">{sidebar.state}</Badge>
      <Button size="xs" variant="outline" onClick={sidebar.toggleSidebar}>
        {t("TUI.toggle")}
      </Button>
    </div>
  );
}
