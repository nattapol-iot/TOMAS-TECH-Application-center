"use client";

import {
  NamedIcon,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { SAMPLE_HREF, TOMAS_SKELETON_ROWS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { stayOnPage } from "../utils/stay-on-page";
import { SidebarFrame } from "./SidebarFrame";
import { SidebarState } from "./SidebarState";

export function SidebarDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="sidebar">
      <SidebarFrame>
        <SidebarProvider remember={false} className="min-h-0 h-full">
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <SidebarInput placeholder={t("DS.placeholder")} aria-label={t("TUI.searchDevices")} />
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Work</SidebarGroupLabel>
                <SidebarGroupAction aria-label={t("TUI.newWorkOrder")}>
                  <NamedIcon name="plus" />
                </SidebarGroupAction>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive tooltip="Overview">
                        <NamedIcon name="house" />
                        <span>Overview</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton tooltip="Work orders">
                        <NamedIcon name="clipboard-list" />
                        <span>Work orders</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>4</SidebarMenuBadge>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton tooltip="Devices">
                        <NamedIcon name="cpu" />
                        <span>Devices</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction showOnHover aria-label={t("TUI.more")}>
                        <NamedIcon name="ellipsis" />
                      </SidebarMenuAction>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton href={SAMPLE_HREF} onClick={stayOnPage} isActive>
                            Gateways
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton href={SAMPLE_HREF} onClick={stayOnPage} size="sm">
                            Sensors
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupLabel>{t("DS.tuiLoading")}</SidebarGroupLabel>
                <SidebarMenu>
                  {TOMAS_SKELETON_ROWS.map((row) => (
                    <SidebarMenuItem key={row}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton size="lg" variant="outline">
                    <NamedIcon name="settings" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="min-h-0 p-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <SidebarState />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </SidebarFrame>
    </TomasUiDemo>
  );
}
