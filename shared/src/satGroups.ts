// CelesTrak element groups the sky layer can draw. The id is CelesTrak's
// GROUP= query value; the server only ever fetches ids from this list.

export interface SatelliteGroup {
  id: string;
  name: string;
  hint?: string;
}

export const SATELLITE_GROUPS: SatelliteGroup[] = [
  { id: "visual", name: "Brightest", hint: "~150 naked-eye satellites, incl. the ISS" },
  { id: "stations", name: "Space stations", hint: "ISS, Tiangong and visiting craft" },
  { id: "starlink", name: "Starlink", hint: "thousands - heavy on a Pi" },
  { id: "oneweb", name: "OneWeb" },
  { id: "gps-ops", name: "GPS" },
  { id: "galileo", name: "Galileo" },
  { id: "weather", name: "Weather" },
  { id: "science", name: "Science" },
  { id: "geo", name: "Geostationary" },
  { id: "amateur", name: "Amateur radio" },
];

const KNOWN = new Set(SATELLITE_GROUPS.map((g) => g.id));

export function isSatelliteGroup(id: unknown): id is string {
  return typeof id === "string" && KNOWN.has(id);
}
