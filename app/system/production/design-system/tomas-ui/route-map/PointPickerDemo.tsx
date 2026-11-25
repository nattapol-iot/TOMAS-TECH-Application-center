"use client";

import { PointPicker, type Place } from "@tomas-tc/ui/route-map";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { MAP_PLACES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { resolvePlaceLink } from "./resolve-place-link";

export function PointPickerDemo() {
  const t = useT();
  const [place, setPlace] = useState<Place | null>(MAP_PLACES[3]);
  return (
    <TomasUiDemo id="point-picker">
      <p className="text-muted-foreground text-sm">{t("TUI.pointPickerNote")}</p>
      <PointPicker value={place} required resolveLink={resolvePlaceLink} onChange={setPlace} />
      <p className="font-mono text-xs">{place ? `${place.name} (${place.point.lat.toFixed(5)}, ${place.point.lng.toFixed(5)})` : "-"}</p>
    </TomasUiDemo>
  );
}
