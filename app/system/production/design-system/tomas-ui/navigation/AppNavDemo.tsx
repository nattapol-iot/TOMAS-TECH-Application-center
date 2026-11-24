"use client";

import {
  Avatar,
  AvatarFallback,
  Badge,
  CountPill,
  DropdownMenuItem,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarNav,
  SidebarProvider,
  SidebarUserMenu,
  TopbarNav,
  filterNavGroups,
  toast,
  useNavCount,
} from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_ROLES } from "../config/tomas-ui.constants";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { DEVICE } from "../fixtures/tomas-ui.entities";
import { NAV_GROUPS, OPEN_ORDER_COUNT } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import { SampleLink } from "./SampleLink";
import { SidebarFrame } from "./SidebarFrame";

export function AppNavDemo() {
  const t = useT();
  const [role, setRole] = useState<string>(TOMAS_ROLES[0]);
  const viewerRoles = [role];
  const visible = filterNavGroups(NAV_GROUPS, viewerRoles);
  const openOrders = useNavCount(OPEN_ORDER_COUNT, SAMPLE_ADAPTERS);
  return (
    <TomasUiDemo id="app-nav">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <TomasUiStates options={TOMAS_ROLES} value={role} onChange={setRole} />
        <span>
          filterNavGroups: {visible.length} / {NAV_GROUPS.length}
        </span>
        <span>
          useNavCount: <Badge variant="secondary">{openOrders ?? "..."}</Badge>
        </span>
        <span className="flex items-center gap-1">
          CountPill: <CountPill entity={DEVICE} adapters={SAMPLE_ADAPTERS} />
        </span>
      </div>
      <div className="rounded-lg border p-2">
        <TopbarNav groups={NAV_GROUPS} adapters={SAMPLE_ADAPTERS} renderLink={SampleLink} viewerRoles={viewerRoles} />
      </div>
      <SidebarFrame>
        <SidebarProvider remember={false} className="min-h-0 h-full">
          <Sidebar collapsible="icon">
            <SidebarContent>
              <SidebarNav groups={NAV_GROUPS} adapters={SAMPLE_ADAPTERS} renderLink={SampleLink} viewerRoles={viewerRoles} folderCounts />
            </SidebarContent>
            <SidebarFooter>
              <SidebarUserMenu
                name="Narin Phonsri"
                subtitle="Field service"
                detail="narin@example.com"
                avatar={
                  <Avatar size="sm">
                    <AvatarFallback>NP</AvatarFallback>
                  </Avatar>
                }
                onLogOut={() => toast(t("TUI.signedOut"))}
              >
                <DropdownMenuItem onSelect={() => toast(t("TUI.profile"))}>{t("TUI.profile")}</DropdownMenuItem>
              </SidebarUserMenu>
            </SidebarFooter>
          </Sidebar>
          <SidebarInset className="min-h-0 p-4 text-sm">{t("TUI.navNote")}</SidebarInset>
        </SidebarProvider>
      </SidebarFrame>
    </TomasUiDemo>
  );
}
