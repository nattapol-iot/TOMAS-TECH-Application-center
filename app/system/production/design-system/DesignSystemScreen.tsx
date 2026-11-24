"use client";

import { useState } from "react";
import { PageHeader, Tabs } from "../../ui";
import { ComponentGallery } from "./ComponentGallery";
import { DESIGN_SYSTEM_TABS } from "./config/design-system.constants";
import "./design-system.css";
import { TokenCatalog } from "./TokenCatalog";
import { TomasUiGallery } from "./TomasUiGallery";
import type { DesignSystemTab, NotifyProps } from "./types/design-system.types";

export function DesignSystemScreen({ notify }: NotifyProps) {
  const [tab, setTab] = useState<DesignSystemTab>("tokens");
  return (
    <div className="ds-screen">
      <PageHeader eyebrow="DS.eyebrow" title="Design System" subtitle="DS.subtitle" />
      <Tabs tabs={DESIGN_SYSTEM_TABS} active={tab} onChange={setTab} />
      {tab === "tokens" ? <TokenCatalog notify={notify} /> : tab === "components" ? <ComponentGallery /> : <TomasUiGallery />}
    </div>
  );
}
