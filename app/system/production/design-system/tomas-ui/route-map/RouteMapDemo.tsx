"use client";

import { placeLink, RouteMap, type RoutePick, type SavedPlace } from "@tomas-tc/ui/route-map";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { MAP_PLACES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { resolvePlaceLink } from "./resolve-place-link";

export function RouteMapDemo() {
  const t = useT();
  const [route, setRoute] = useState<RoutePick | null>(null);
  const [saved, setSaved] = useState<SavedPlace[]>(MAP_PLACES.slice(2).map((place, index) => ({ ...place, id: index + 1, shared: index === 0 })));
  return (
    <TomasUiDemo id="route-map">
      <p className="text-muted-foreground text-sm">{t("TUI.routeMapDemoNote")}</p>
      <div className="h-[30rem]">
        <RouteMap
          initial={{ from: MAP_PLACES[0], to: MAP_PLACES[1] }}
          summary={route ? `${route.from.name} - ${route.to.name}: ${route.km.toFixed(1)} km` : undefined}
          notice={route && route.km > 100 ? { text: t("TUI.longTrip"), error: false } : null}
          required
          saved={saved}
          lead={<span className="text-sm font-medium">{t("TUI.siteVisitRoute")}</span>}
          resolveLink={resolvePlaceLink}
          onRoute={setRoute}
          onClear={() => setRoute(null)}
          onSave={(place) => setSaved((current) => [...current, { ...place, id: Math.max(0, ...current.map((item) => item.id)) + 1, shared: false }])}
          onRemove={(place) => setSaved((current) => current.filter((item) => item.id !== place.id))}
        />
      </div>
      <p className="text-muted-foreground font-mono text-xs break-all">placeLink: {placeLink((route?.to ?? MAP_PLACES[1]).point)}</p>
    </TomasUiDemo>
  );
}
