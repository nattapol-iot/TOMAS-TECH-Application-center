import type { ComponentType } from "react";
import { DataSection } from "../data/DataSection";
import { FeedbackSection } from "../feedback/FeedbackSection";
import { FormsSection } from "../forms/FormsSection";
import { IconsSection } from "../icons/IconsSection";
import { NavigationSection } from "../navigation/NavigationSection";
import { PagesSection } from "../pages/PagesSection";
import { PrimitivesSection } from "../primitives/PrimitivesSection";
import { RecordsSection } from "../records/RecordsSection";
import type { TomasUiSectionId } from "../types/tomas-ui.types";
import { UtilitiesSection } from "../utilities/UtilitiesSection";
import { VisualsSection } from "../visuals/VisualsSection";

export const TOMAS_UI_SECTION_BODIES: Record<TomasUiSectionId, ComponentType> = {
  primitives: PrimitivesSection,
  forms: FormsSection,
  data: DataSection,
  records: RecordsSection,
  navigation: NavigationSection,
  pages: PagesSection,
  visuals: VisualsSection,
  feedback: FeedbackSection,
  icons: IconsSection,
  utilities: UtilitiesSection,
};
