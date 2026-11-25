"use client";

import { Button } from "@tomas-tc/ui";
import { PinMap, type LatLng } from "@tomas-tc/ui/route-map";
import { useState } from "react";
import { MAP_PLACES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

const PINS = MAP_PLACES.map((place) => ({ point: place.point, title: place.name }));

export function PinMapDemo() {
  const [focus, setFocus] = useState<LatLng | null>(null);
  return (
    <TomasUiDemo id="pin-map">
      <div className="flex flex-wrap gap-1">
        {MAP_PLACES.map((place) => (
          <Button key={place.name} size="xs" variant={focus === place.point ? "secondary" : "outline"} onClick={() => setFocus(place.point)}>
            {place.name}
          </Button>
        ))}
      </div>
      <PinMap pins={PINS} focus={focus} className="h-72 rounded-lg border" />
    </TomasUiDemo>
  );
}
