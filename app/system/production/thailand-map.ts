/*
 * The Command Center map: Thailand's land border as a coarse polygon (about 110 points, roughly 5-15 km accuracy) in
 * longitude / latitude, plus where the neighbouring countries' names sit. It is a hand-simplified outline for a wall
 * display, good enough to place sites, not for navigation; islands are left out.
 *
 * Source and licence: the points were placed by hand along well-known border and coastal towns; no map dataset was
 * copied, so there is nothing to attribute. For exact borders, replace THAILAND with the Thailand polygon of Natural
 * Earth's ne_50m_admin_0_countries (https://www.naturalearthdata.com, public domain, no attribution required).
 *
 * Projection: equirectangular with the x axis scaled by cos(latitude) at the middle of the view, which keeps the
 * country's proportions right at these latitudes without any map library.
 */
export type LonLat = readonly [number, number];

export const THAILAND: readonly LonLat[] = [
  // North: Mae Sai and the Golden Triangle, then down the Laos border to the Mekong at Chiang Khan.
  [99.9, 20.43], [100.09, 20.35], [100.41, 20.26], [100.55, 20.13], [100.47, 19.8], [100.6, 19.53], [100.88, 19.6],
  [101.25, 19.6], [101.28, 19.25], [101.18, 18.95], [101.1, 18.62], [101.02, 18.4], [101.2, 18.0], [101.55, 17.8],
  [101.75, 17.9], [102.05, 18.15], [102.4, 17.98], [102.68, 17.85], [103.0, 17.98], [103.3, 18.35], [103.65, 18.4],
  // Along the Mekong: Nong Khai, Bueng Kan, Nakhon Phanom, Mukdahan, Khong Chiam.
  [104.0, 18.2], [104.45, 17.75], [104.75, 17.45], [104.8, 16.95], [104.75, 16.55], [105.05, 16.1], [105.4, 15.95],
  [105.6, 15.7], [105.5, 15.35], [105.6, 15.05], [105.45, 14.55], [105.2, 14.34],
  // The Dangrek range along Cambodia, then south to Aranyaprathet and the Trat coast.
  [104.8, 14.43], [104.4, 14.38], [103.9, 14.35], [103.4, 14.4], [102.95, 14.25], [102.7, 13.98], [102.55, 13.66],
  [102.35, 13.55], [102.4, 13.15], [102.6, 12.8], [102.75, 12.45], [102.85, 12.1], [102.92, 11.65],
  // The Gulf coast north-west: Trat, Chanthaburi, Rayong, Sattahip, Chonburi, Bangkok, Samut Songkhram.
  [102.6, 12.05], [102.3, 12.2], [102.05, 12.5], [101.7, 12.65], [101.3, 12.67], [100.95, 12.65], [100.88, 12.95],
  [100.95, 13.35], [100.75, 13.5], [100.5, 13.5], [100.25, 13.45], [100.0, 13.35],
  // Down the peninsula's east coast: Phetchaburi, Hua Hin, Prachuap, Chumphon, Surat Thani, Nakhon Si Thammarat.
  [100.05, 13.0], [99.97, 12.55], [99.85, 12.0], [99.75, 11.75], [99.55, 11.2], [99.3, 10.75], [99.2, 10.3],
  [99.22, 9.85], [99.35, 9.3], [99.85, 9.25], [99.95, 8.75], [100.05, 8.4], [100.3, 7.75], [100.55, 7.25],
  // Songkhla, Pattani, Narathiwat to Tak Bai, then the Malaysian border west.
  [100.8, 6.95], [101.3, 6.88], [101.7, 6.6], [102.1, 6.23], [101.85, 5.85], [101.55, 5.85], [101.15, 5.65],
  [100.95, 6.25], [100.6, 6.45], [100.35, 6.6], [100.1, 6.45],
  // The Andaman coast north: Satun, Trang, Krabi, Phang Nga, Khao Lak, Ranong.
  [99.95, 6.85], [99.7, 7.2], [99.45, 7.5], [99.2, 7.85], [98.85, 8.1], [98.55, 8.35], [98.3, 8.2], [98.27, 8.75],
  [98.35, 9.2], [98.5, 9.65], [98.6, 9.95], [98.75, 10.35],
  // The Myanmar border north along the Tenasserim hills to Three Pagodas Pass, Mae Sot and Mae Hong Son.
  [99.05, 10.85], [99.3, 11.25], [99.55, 11.7], [99.6, 12.0], [99.35, 12.5], [99.2, 13.0], [99.15, 13.5],
  [98.75, 14.05], [98.55, 14.65], [98.3, 15.25], [98.55, 15.6], [98.62, 16.05], [98.55, 16.5], [98.4, 16.95],
  [97.95, 17.45], [97.7, 17.9], [97.68, 18.3], [97.4, 18.55], [97.75, 19.0], [97.85, 19.45], [98.05, 19.75],
  [98.5, 19.72], [98.9, 19.75], [99.15, 20.05], [99.45, 20.1], [99.6, 20.3], [99.9, 20.43],
];

export const NEIGHBOURS: readonly { key: string; at: LonLat }[] = [
  { key: "Ops.country.Myanmar", at: [97.4, 16.5] },
  { key: "Ops.country.Laos", at: [102.6, 19.6] },
  { key: "Ops.country.Cambodia", at: [104.6, 13.0] },
  { key: "Ops.country.Vietnam", at: [106.2, 16.6] },
  { key: "Ops.country.Malaysia", at: [101.9, 5.2] },
];

export type MapBounds = { west: number; east: number; south: number; north: number };

/** Thailand with a margin; widened to take in any site outside it (a neighbouring country). */
export const THAILAND_BOUNDS: MapBounds = { west: 96.6, east: 106.6, south: 5.0, north: 20.9 };

export function boundsFor(points: readonly LonLat[]): MapBounds {
  const bounds = { ...THAILAND_BOUNDS };
  for (const [lon, lat] of points) {
    bounds.west = Math.min(bounds.west, lon - 0.8);
    bounds.east = Math.max(bounds.east, lon + 0.8);
    bounds.south = Math.min(bounds.south, lat - 0.8);
    bounds.north = Math.max(bounds.north, lat + 0.8);
  }
  return bounds;
}

export type Projection = { width: number; height: number; project: (point: LonLat) => [number, number] };

/** Projects into a box `height` units tall; the width follows from the bounds. */
export function projection(bounds: MapBounds, height = 1000): Projection {
  const k = Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180);
  const scale = height / (bounds.north - bounds.south);
  const width = (bounds.east - bounds.west) * k * scale;
  return {
    width,
    height,
    project: ([lon, lat]) => [(lon - bounds.west) * k * scale, (bounds.north - lat) * scale],
  };
}

export function outlinePath(points: readonly LonLat[], project: Projection["project"]): string {
  return points.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";
}
