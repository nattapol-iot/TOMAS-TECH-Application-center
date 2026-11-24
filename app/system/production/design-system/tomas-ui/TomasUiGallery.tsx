"use client";

import { useLanguage } from "../../../i18n";
import { Panel } from "../../../ui";
import { TOMAS_UI_SECTION_BODIES } from "./config/tomas-ui.bodies";
import { TOMAS_UI_LOCALES } from "./config/tomas-ui.constants";
import { TOMAS_UI_EXPORT_COUNT, TOMAS_UI_SECTIONS, TOMAS_UI_SHOWN_COUNT } from "./config/tomas-ui.coverage";
import { TomasUiFrame } from "./TomasUiFrame";
import { TomasUiNav } from "./TomasUiNav";
import { TomasUiNotShown } from "./TomasUiNotShown";
import { TomasUiProviders } from "./TomasUiProviders";
import { TomasUiSection } from "./TomasUiSection";

export function TomasUiGallery() {
  const { lang } = useLanguage();
  return (
    <Panel title="DS.tabTomasUi" subtitle="DS.tomasNote">
      <TomasUiFrame>
        <TomasUiProviders locale={TOMAS_UI_LOCALES[lang]}>
          <TomasUiNav sections={TOMAS_UI_SECTIONS} shown={TOMAS_UI_SHOWN_COUNT} total={TOMAS_UI_EXPORT_COUNT} />
          <main className="flex flex-col gap-12 p-6">
            {TOMAS_UI_SECTIONS.map((spec) => {
              const Body = TOMAS_UI_SECTION_BODIES[spec.id];
              return (
                <TomasUiSection key={spec.id} spec={spec}>
                  <Body />
                </TomasUiSection>
              );
            })}
            <TomasUiNotShown />
          </main>
        </TomasUiProviders>
      </TomasUiFrame>
    </Panel>
  );
}
