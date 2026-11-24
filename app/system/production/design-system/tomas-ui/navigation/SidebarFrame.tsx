"use client";

import type { SidebarFrameProps } from "../types/tomas-ui.types";

// The sidebar is position: fixed and as tall as the viewport; a transformed box becomes its containing
// block, so the sample stays inside its card instead of covering the frame.
export function SidebarFrame({ children }: SidebarFrameProps) {
  return <div className="relative h-[26rem] overflow-hidden rounded-lg border [transform:translateZ(0)] [&_[data-slot=sidebar-container]]:h-full">{children}</div>;
}
