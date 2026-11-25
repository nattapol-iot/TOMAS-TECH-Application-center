"use client";

import { AppNavDemo } from "./AppNavDemo";
import { LayoutDemo } from "./LayoutDemo";
import { LocaleSwitcherDemo } from "./LocaleSwitcherDemo";
import { NavigationMenuDemo } from "./NavigationMenuDemo";
import { PageJumpLinksDemo } from "./PageJumpLinksDemo";
import { SidebarDemo } from "./SidebarDemo";

export function NavigationSection() {
  return (
    <>
      <SidebarDemo />
      <AppNavDemo />
      <NavigationMenuDemo />
      <LayoutDemo />
      <PageJumpLinksDemo />
      <LocaleSwitcherDemo />
    </>
  );
}
