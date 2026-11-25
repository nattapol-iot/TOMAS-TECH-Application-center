"use client";

import LEAFLET_CSS from "leaflet/dist/leaflet.css?inline";
import { PinMapDemo } from "./PinMapDemo";
import { PointPickerDemo } from "./PointPickerDemo";
import { RouteMapDemo } from "./RouteMapDemo";

export function RouteMapSection() {
  return (
    <>
      {/* route-map imports leaflet.css into the host page; the samples draw inside the frame, which needs its own copy. */}
      <style>{LEAFLET_CSS}</style>
      <RouteMapDemo />
      <PinMapDemo />
      <PointPickerDemo />
    </>
  );
}
