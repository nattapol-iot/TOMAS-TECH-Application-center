"use client";

import { AppNavDemo } from "./AppNavDemo";
import { LayoutDemo } from "./LayoutDemo";
import { NavigationMenuDemo } from "./NavigationMenuDemo";
import { SidebarDemo } from "./SidebarDemo";

export function NavigationSection() {
  return (
    <>
      <SidebarDemo />
      <AppNavDemo />
      <NavigationMenuDemo />
      <LayoutDemo />
    </>
  );
}
