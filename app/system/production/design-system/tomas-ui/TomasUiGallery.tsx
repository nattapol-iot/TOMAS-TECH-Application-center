"use client";

import { startTransition, useState } from "react";
import { useLanguage } from "../../../i18n";
import { Panel } from "../../../ui";
import { TOMAS_UI_LOCALES } from "./config/tomas-ui.constants";
import { TOMAS_UI_EXPORT_COUNT, TOMAS_UI_SHOWN_COUNT, TOMAS_UI_VIEWS } from "./config/tomas-ui.coverage";
import { TomasUiFrame } from "./TomasUiFrame";
import { TomasUiNav } from "./TomasUiNav";
import { TomasUiPage } from "./TomasUiPage";
import { TomasUiProviders } from "./TomasUiProviders";
import type { TomasUiView } from "./types/tomas-ui.types";
import { useTomasUiLook } from "./utils/use-tomas-ui-look";

export function TomasUiGallery() {
  const { lang } = useLanguage();
  const [look, setLook] = useTomasUiLook();
  const [view, setView] = useState<TomasUiView>(TOMAS_UI_VIEWS[0].id);
  return (
    <Panel title="DS.tabTomasUi" subtitle="DS.tomasNote">
      <TomasUiFrame look={look}>
        <TomasUiProviders locale={TOMAS_UI_LOCALES[lang]}>
          <TomasUiNav
            views={TOMAS_UI_VIEWS}
            view={view}
            onViewChange={(next) => startTransition(() => setView(next))}
            shown={TOMAS_UI_SHOWN_COUNT}
            total={TOMAS_UI_EXPORT_COUNT}
            look={look}
            onLookChange={setLook}
          />
          <main className="p-6">
            <TomasUiPage view={view} />
          </main>
        </TomasUiProviders>
      </TomasUiFrame>
    </Panel>
  );
}
