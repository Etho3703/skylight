import { describe, expect, it } from "vitest";
import * as satellite from "satellite.js";
import { computeSky, satSunlit } from "../src/celestial.js";
import { CONSTELLATION_FIGURES, STARFIELD } from "../src/skyCatalog.js";
import { visibleAsterisms, CONSTELLATIONS } from "../src/stars.js";

const SFO = { lat: 37.6213, lon: -122.379 };
// 2026-01-15 22:00 PST: dark, Orion high in the south.
const WINTER_NIGHT = new Date("2026-01-16T06:00:00Z");

const base = {
  sun: false, moon: false, stars: true, satellites: false, planets: false, tles: [],
};

describe("star field", () => {
  it("is sorted brightest first and stops at the naked-eye limit", () => {
    const mags = STARFIELD.filter((_, i) => i % 3 === 2);
    expect(mags.length).toBeGreaterThan(5000);
    expect(mags.every((m, i) => i === 0 || m >= mags[i - 1])).toBe(true);
    expect(Math.max(...mags)).toBeLessThanOrEqual(6);
  });

  it("draws far more stars at mag 6 than at the old bright limit, without doubling named ones", () => {
    const bright = computeSky(WINTER_NIGHT, SFO.lat, SFO.lon, { ...base, magLimit: 2.6 });
    const full = computeSky(WINTER_NIGHT, SFO.lat, SFO.lon, { ...base, magLimit: 6 });
    expect(full.stars.length).toBeGreaterThan(bright.stars.length * 20);
    // Betelgeuse appears once, as the named star.
    const near = full.stars.filter((s) => {
      const b = full.stars.find((x) => x.id === "betelgeuse")!;
      return Math.abs(s.az - b.az) < 0.3 && Math.abs(s.alt - b.alt) < 0.3;
    });
    expect(near).toHaveLength(1);
  });
});

describe("constellation figures", () => {
  it("covers all 88 IAU constellations (Serpens in two parts)", () => {
    expect(CONSTELLATION_FIGURES.length).toBe(89);
    expect(CONSTELLATION_FIGURES.find((f) => f.id === "Ori")?.name).toBe("Orion");
  });

  it("puts Orion above the horizon on a winter night, and leaves figures off unless asked", () => {
    const off = computeSky(WINTER_NIGHT, SFO.lat, SFO.lon, { ...base, magLimit: 2 });
    expect(off.figures).toHaveLength(0);
    const on = computeSky(WINTER_NIGHT, SFO.lat, SFO.lon, { ...base, magLimit: 2, figures: true });
    const orion = on.figures.find((f) => f.id === "Ori");
    expect(orion?.label?.alt).toBeGreaterThan(30);
  });

  it("skips asterisms the IAU figures already draw", () => {
    const all = Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, true]));
    const legacy = visibleAsterisms(all);
    const withFigures = visibleAsterisms(all, true);
    expect(withFigures.length).toBeLessThan(legacy.length);
    expect(withFigures).toContainEqual(["vega", "deneb"]); // Summer Triangle isn't an IAU figure
  });
});

describe("Earth shadow", () => {
  const sun = { x: 1, y: 0, z: 0 };
  it("lights the day side and the limb, darkens the night side", () => {
    expect(satSunlit({ x: 6800, y: 0, z: 0 }, sun)).toBe(true);
    expect(satSunlit({ x: -6800, y: 0, z: 0 }, sun)).toBe(false);
    // Behind the Earth but far enough off-axis to clear the shadow cylinder.
    expect(satSunlit({ x: -2000, y: 6800, z: 0 }, sun)).toBe(true);
  });
});

describe("ISS", () => {
  // Same orbit: Nauka is docked to the ISS but cataloged on its own.
  const zarya = {
    name: "ISS (ZARYA)",
    line1: "1 25544U 98067A   26305.53114906  .00006056  00000+0  11739-3 0  9995",
    line2: "2 25544  51.6332 340.4448 0007086 335.8887  24.1768 15.49140542593046",
  };
  const nauka = {
    name: "ISS (NAUKA)",
    line1: "1 49044U 21066A   26305.53114906  .00006056  00000+0  11739-3 0  9991",
    line2: "2 49044  51.6332 340.4448 0007086 335.8887  24.1768 15.49140542586634",
  };

  it("draws once when the stations group adds its docked modules", () => {
    // Stand under the station at its epoch so it's overhead.
    const date = new Date(Date.UTC(2026, 10, 1, 12, 44, 51));
    const rec = satellite.twoline2satrec(zarya.line1, zarya.line2);
    const pos = satellite.propagate(rec, date)?.position;
    if (!pos || typeof pos === "boolean") throw new Error("no ISS position");
    const gd = satellite.eciToGeodetic(pos, satellite.gstime(date));
    const sky = computeSky(date, satellite.degreesLat(gd.latitude), satellite.degreesLong(gd.longitude), {
      satellites: true,
      tles: [zarya, nauka],
    });
    expect(sky.sats).toHaveLength(1);
    expect(sky.sats[0]).toMatchObject({ kind: "iss", noradId: "25544" });
  });
});
