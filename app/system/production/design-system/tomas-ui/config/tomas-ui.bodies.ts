import { lazy, type ComponentType } from "react";
import type { TomasUiSectionId } from "../types/tomas-ui.types";

// Each section is its own chunk, so opening the tab loads only the first section and a section's samples
// (and the optional peers of the subpath entries) load when it is picked.
export const TOMAS_UI_SECTION_BODIES: Record<TomasUiSectionId, ComponentType> = {
  primitives: lazy(() => import("../primitives/PrimitivesSection").then((module) => ({ default: module.PrimitivesSection }))),
  forms: lazy(() => import("../forms/FormsSection").then((module) => ({ default: module.FormsSection }))),
  controls: lazy(() => import("../controls/ControlsSection").then((module) => ({ default: module.ControlsSection }))),
  data: lazy(() => import("../data/DataSection").then((module) => ({ default: module.DataSection }))),
  records: lazy(() => import("../records/RecordsSection").then((module) => ({ default: module.RecordsSection }))),
  navigation: lazy(() => import("../navigation/NavigationSection").then((module) => ({ default: module.NavigationSection }))),
  pages: lazy(() => import("../pages/PagesSection").then((module) => ({ default: module.PagesSection }))),
  visuals: lazy(() => import("../visuals/VisualsSection").then((module) => ({ default: module.VisualsSection }))),
  feedback: lazy(() => import("../feedback/FeedbackSection").then((module) => ({ default: module.FeedbackSection }))),
  print: lazy(() => import("../print/PrintSection").then((module) => ({ default: module.PrintSection }))),
  "file-viewer": lazy(() => import("../file-viewer/FileViewerSection").then((module) => ({ default: module.FileViewerSection }))),
  "route-map": lazy(() => import("../route-map/RouteMapSection").then((module) => ({ default: module.RouteMapSection }))),
  icons: lazy(() => import("../icons/IconsSection").then((module) => ({ default: module.IconsSection }))),
  utilities: lazy(() => import("../utilities/UtilitiesSection").then((module) => ({ default: module.UtilitiesSection }))),
};
