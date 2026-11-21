"use client";

import type { ReactNode } from "react";
import "./pegasus-skin.css";
import "./pegasus-screens.css";

/**
 * A whole screen in the Pegasus ERP look (owner 2026-11-21: the Team & Knowledge and System menus). pegasus-skin.css draws the
 * shared components and pegasus-screens.css sets the app's tokens to Pegasus values, both only inside this wrapper. Dialogs and
 * side panels are not portalled in this app, so one opened from inside takes the look too.
 * A screen with a root element of its own puts "pg-skin pg-screen" on that element instead and imports the two stylesheets.
 */
export function PegasusScreen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `pg-skin pg-screen ${className}` : "pg-skin pg-screen"}>{children}</div>;
}
