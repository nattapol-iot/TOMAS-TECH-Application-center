import type { PlaceLinkResult } from "@tomas-tc/ui/route-map";
import { PLACE_LINK_POINT } from "../config/tomas-ui.constants";

// Stands in for the server endpoint that expands a shared map link; this one only reads coordinates in the link itself.
export async function resolvePlaceLink(link: string): Promise<PlaceLinkResult> {
  const match = PLACE_LINK_POINT.exec(link);
  if (!match) return { error: "This sample only reads links that carry coordinates, like ...@13.72,100.51 or ?q=13.72,100.51." };
  const point = { lat: Number(match[1]), lng: Number(match[2]) };
  return { place: { name: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`, detail: link, point } };
}
