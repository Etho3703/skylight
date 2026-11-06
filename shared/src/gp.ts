// Satellite orbits as CelesTrak's GP (general perturbations) data, in the OMM
// keywords its CSV and JSON formats use. TLEs can't carry catalog numbers past
// 99999, which ran out in July 2026, so CelesTrak leaves every newer object out
// of its TLE answers. satellite.js reads these records with json2satrec.

/** One satellite's orbit. A type, not an interface, so it fits satellite.js's
 *  open-ended OMM type. */
export type GpElements = {
  OBJECT_NAME: string;
  /** International designator, e.g. 1998-067A. */
  OBJECT_ID: string;
  /** ISO 8601 UTC. */
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE?: 0;
  CLASSIFICATION_TYPE?: "U" | "C";
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH?: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
};

const NUMERIC = [
  "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER",
  "MEAN_ANOMALY", "NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH", "BSTAR",
  "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT",
] as const;

/** One row of CelesTrak's GP CSV (header → value), or null if it isn't one. */
export function gpFromCsvRow(row: Record<string, string>): GpElements | null {
  if (!row.OBJECT_NAME || !row.EPOCH) return null;
  const out: Record<string, string | number> = {
    OBJECT_NAME: row.OBJECT_NAME.trim(),
    OBJECT_ID: (row.OBJECT_ID ?? "").trim(),
    EPOCH: row.EPOCH.trim(),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: row.CLASSIFICATION_TYPE === "C" ? "C" : "U",
  };
  for (const k of NUMERIC) {
    const cell = row[k]?.trim();
    const v = cell ? Number(cell) : NaN; // Number("") is 0
    if (!Number.isFinite(v)) {
      if (k === "REV_AT_EPOCH") continue; // optional in OMM
      return null;
    }
    out[k] = v;
  }
  return out as unknown as GpElements;
}

/** "-11606-4" → -0.11606e-4: the TLE's assumed-decimal exponent fields. */
function tleExp(field: string): number {
  const m = field.trim().match(/^([+-]?)(\d+)([+-]\d)$/);
  return m ? Number(`${m[1]}0.${m[2]}e${m[3]}`) : 0;
}

/** A two-line element set as GP elements. For orbits cached before the switch
 *  away from TLEs, and a custom TLE_URL source. Five-digit catalog numbers only. */
export function tleToGp(name: string, line1: string, line2: string): GpElements | null {
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) return null;
  const norad = Number(line1.slice(2, 7));
  const yy = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  if (!Number.isFinite(norad) || !Number.isFinite(yy) || !Number.isFinite(day)) return null;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const epoch = new Date(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000);
  const intl = line1.slice(9, 17).trim(); // 98067A
  const launchYy = Number(intl.slice(0, 2));
  return {
    OBJECT_NAME: name.trim(),
    OBJECT_ID: intl
      ? `${launchYy < 57 ? 2000 + launchYy : 1900 + launchYy}-${intl.slice(2, 5)}${intl.slice(5)}`
      : "",
    EPOCH: epoch.toISOString().replace(/Z$/, ""),
    MEAN_MOTION: Number(line2.slice(52, 63)),
    ECCENTRICITY: Number(`0.${line2.slice(26, 33).trim()}`),
    INCLINATION: Number(line2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(line2.slice(17, 25)),
    ARG_OF_PERICENTER: Number(line2.slice(34, 42)),
    MEAN_ANOMALY: Number(line2.slice(43, 51)),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: line1[7] === "C" ? "C" : "U",
    NORAD_CAT_ID: norad,
    ELEMENT_SET_NO: Number(line1.slice(64, 68)) || 999,
    REV_AT_EPOCH: Number(line2.slice(63, 68)) || 0,
    BSTAR: tleExp(line1.slice(53, 61)),
    MEAN_MOTION_DOT: Number(line1.slice(33, 43)),
    MEAN_MOTION_DDOT: tleExp(line1.slice(44, 52)),
  };
}

/** Why CelesTrak downloads stopped, as the control panel shows it. */
export interface CelestrakStatus {
  /** A non-200 answer (status 0: stopped by hand, e.g. while firewalled):
   *  nothing more is asked until a person resumes. */
  halt?: { at: number; url: string; status: number; message: string };
  /** CelesTrak didn't answer at all: when the next try is allowed (epoch ms). */
  retryAt?: number;
}
