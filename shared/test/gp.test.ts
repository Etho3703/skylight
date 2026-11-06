import { describe, expect, it } from "vitest";
import * as satellite from "satellite.js";
import { gpFromCsvRow, tleToGp } from "../src/gp.js";

const ISS_L1 = "1 25544U 98067A   26305.53114906  .00006056  00000+0  11739-3 0  9995";
const ISS_L2 = "2 25544  51.6332 340.4448 0007086 335.8887  24.1768 15.49140542593046";

/** Distance in km between where two satellite records put the satellite. */
function apartKm(a: satellite.SatRec, b: satellite.SatRec, date: Date): number {
  const pa = satellite.propagate(a, date)?.position;
  const pb = satellite.propagate(b, date)?.position;
  if (!pa || !pb) throw new Error("propagation failed");
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

describe("tleToGp", () => {
  it("reads every field of a TLE", () => {
    expect(tleToGp("ISS (ZARYA)", ISS_L1, ISS_L2)).toMatchObject({
      OBJECT_NAME: "ISS (ZARYA)",
      OBJECT_ID: "1998-067A",
      NORAD_CAT_ID: 25544,
      INCLINATION: 51.6332,
      ECCENTRICITY: 0.0007086,
      MEAN_MOTION: 15.49140542,
      BSTAR: 0.00011739,
      REV_AT_EPOCH: 59304,
    });
  });

  it("puts the satellite where the TLE does", () => {
    const fromTle = satellite.twoline2satrec(ISS_L1, ISS_L2);
    const fromGp = satellite.json2satrec(tleToGp("ISS (ZARYA)", ISS_L1, ISS_L2)!);
    for (const h of [0, 6, 24]) {
      const date = new Date(Date.UTC(2026, 10, 1, 12 + h, 44, 51));
      expect(apartKm(fromTle, fromGp, date)).toBeLessThan(0.1);
    }
  });
});

describe("gpFromCsvRow", () => {
  // CelesTrak's GP CSV columns, for an object past the old 5-digit limit.
  const header =
    "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
  const line =
    "STARLINK-99999,2026-140A,2026-11-01T12:44:51.000000,15.0612,.0001421,53.1601,120.4421,90.1234,269.9912,0,U,101074,999,812,.00012345,.00001234,0";
  const row = Object.fromEntries(header.split(",").map((h, i) => [h, line.split(",")[i]]));

  it("reads a 6-digit catalog number, which TLEs can't carry", () => {
    const gp = gpFromCsvRow(row)!;
    expect(gp).toMatchObject({ NORAD_CAT_ID: 101074, ECCENTRICITY: 0.0001421, CLASSIFICATION_TYPE: "U" });
    const rec = satellite.json2satrec(gp);
    expect(satellite.propagate(rec, new Date(Date.UTC(2026, 10, 1, 13)))?.position).toBeTruthy();
  });

  it("rejects a row with a missing number", () => {
    expect(gpFromCsvRow({ ...row, MEAN_MOTION: "" })).toBeNull();
    expect(gpFromCsvRow({ ...row, REV_AT_EPOCH: "" })).not.toBeNull(); // optional
  });
});
