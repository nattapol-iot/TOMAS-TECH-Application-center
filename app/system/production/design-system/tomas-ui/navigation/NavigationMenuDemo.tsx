"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "@tomas-tc/ui";
import { SAMPLE_HREF } from "../config/tomas-ui.constants";
import { NAV_MENU } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { stayOnPage } from "../utils/stay-on-page";

export function NavigationMenuDemo() {
  return (
    <TomasUiDemo id="navigation-menu">
      <div className="relative min-h-64">
        <NavigationMenu viewport={false}>
          <NavigationMenuList>
            {NAV_MENU.map((menu) => (
              <NavigationMenuItem key={menu.label}>
                <NavigationMenuTrigger>{menu.label}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-80 gap-1 p-2">
                    {menu.links.map((link) => (
                      <li key={link.title}>
                        <NavigationMenuLink href={SAMPLE_HREF} onClick={stayOnPage}>
                          <span className="text-sm font-medium">{link.title}</span>
                          <span className="text-muted-foreground text-xs">{link.note}</span>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}
            <NavigationMenuItem>
              <NavigationMenuLink href={SAMPLE_HREF} onClick={stayOnPage} className={navigationMenuTriggerStyle()}>
                Reports
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuIndicator />
          </NavigationMenuList>
          <NavigationMenuViewport />
        </NavigationMenu>
      </div>
    </TomasUiDemo>
  );
}
