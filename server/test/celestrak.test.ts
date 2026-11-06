import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CelesTrak, celestrakRetryMs, formatRetry } from "../src/celestrak.js";
import { TleStore } from "../src/tle.js";
import { SatCatStore } from "../src/satcat.js";

// CelesTrak firewalls IPs that ask too often or ignore its errors
// (https://celestrak.org/usage-policy.php). These pin down the polite side:
// any non-200 stops everything until a person resumes, a restart remembers
// that, nothing is asked twice inside CelesTrak's 2 h update cycle, and the
// app asks for CSV, not TLE.

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ISS_TLE = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26305.53114906  .00006056  00000+0  11739-3 0  9995",
  line2: "2 25544  51.6332 340.4448 0007086 335.8887  24.1768 15.49140542593046",
};
const GP_CSV = [
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT",
  "ISS (ZARYA),1998-067A,2026-11-01T12:44:51.778784,15.49140542,.0007086,51.6332,340.4448,335.8887,24.1768,0,U,25544,999,59304,.00011739,.00006056,0",
  "STARLINK-99999,2026-140A,2026-11-01T12:44:51.000000,15.0612,.0001421,53.1601,120.4421,90.1234,269.9912,0,U,101074,999,812,.00012345,.00001234,0",
].join("\n");
const SATCAT_CSV = [
  "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE",
  "ISS (ZARYA),1998-067A,25544,PAY,+,ISS,1998-11-20,TYMSC,,92.9,51.63,421,415,,,EA,ORB",
  "SL-16 R/B,1990-046B,20625,R/B,,CIS,1990-05-15,TYMSC,,104.8,71.0,840,820,,,EA,ORB",
].join("\n");

async function tmp(name: string, body?: unknown): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "skylight-celestrak-")), name);
  if (body !== undefined) await writeFile(path, JSON.stringify(body), "utf8");
  return path;
}

async function gate(): Promise<CelesTrak> {
  const g = new CelesTrak(await tmp("state.json"));
  await g.load();
  return g;
}

const answer = (status: number, body: string) =>
  vi.fn(async () => new Response(body, { status }));
const unreachable = () =>
  vi.fn(async () => {
    throw new TypeError("fetch failed");
  });

/** Lets background refreshes settle (no real I/O on these paths). */
const settle = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("celestrakRetryMs", () => {
  it("waits 30 min, doubling with each failure up to 6 h", () => {
    const steps = [1, 2, 3, 4, 5, 9].map((n) => formatRetry(celestrakRetryMs(n)));
    expect(steps).toEqual(["30 min", "1 h", "2 h", "4 h", "6 h", "6 h"]);
  });
});

describe("CelesTrak gate", () => {
  for (const status of [301, 403, 404, 500, 503]) {
    it(`stops everything after HTTP ${status}, and says why`, async () => {
      const fetch = answer(status, "<html><body><p>GP data has not updated since your last successful download</p></body></html>");
      vi.stubGlobal("fetch", fetch);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const g = await gate();
      expect(await g.fetchText("https://celestrak.org/a")).toBeNull();
      expect(await g.fetchText("https://celestrak.org/b")).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(g.status().halt).toMatchObject({
        status,
        url: "https://celestrak.org/a",
        message: "GP data has not updated since your last successful download",
      });
    });
  }

  it("doesn't follow redirects: a 301 is an outdated URL", async () => {
    const fetch = answer(200, "ok");
    vi.stubGlobal("fetch", fetch);
    await (await gate()).fetchText("https://celestrak.org/a");
    expect(fetch.mock.calls[0]).toMatchObject([expect.any(String), { redirect: "manual" }]);
  });

  it("stays stopped across a restart until resumed", async () => {
    vi.stubGlobal("fetch", answer(403, "blocked"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const path = await tmp("state.json");
    const first = new CelesTrak(path);
    await first.load();
    await first.fetchText("https://celestrak.org/a");

    const fetch = answer(200, "ok");
    vi.stubGlobal("fetch", fetch);
    const restarted = new CelesTrak(path);
    await restarted.load();
    expect(await restarted.fetchText("https://celestrak.org/a")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    await restarted.resume();
    expect(await restarted.fetchText("https://celestrak.org/a")).toBe("ok");
    expect(JSON.parse(await readFile(path, "utf8")).halt).toBeUndefined();
  });

  it("asks for a URL at most once per 2 h, restarts included", async () => {
    const fetch = answer(200, "ok");
    vi.stubGlobal("fetch", fetch);
    const path = await tmp("state.json");
    const g = new CelesTrak(path);
    await g.load();
    expect(await g.fetchText("https://celestrak.org/a")).toBe("ok");
    expect(await g.fetchText("https://celestrak.org/a")).toBeNull();
    const restarted = new CelesTrak(path);
    await restarted.load();
    expect(await restarted.fetchText("https://celestrak.org/a")).toBeNull();
    expect(await restarted.fetchText("https://celestrak.org/b")).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("backs off when unreachable, across a restart", async () => {
    const fetch = unreachable();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const path = await tmp("state.json");
    const g = new CelesTrak(path);
    await g.load();
    await g.fetchText("https://celestrak.org/a");
    const restarted = new CelesTrak(path);
    await restarted.load();
    await restarted.fetchText("https://celestrak.org/b");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(restarted.status().retryAt).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(restarted.status().halt).toBeUndefined();
  });

  it("asks one URL at a time", async () => {
    let open = 0;
    let most = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      most = Math.max(most, ++open);
      await settle();
      open--;
      return new Response("ok", { status: 200 });
    }));
    const g = await gate();
    await Promise.all(["a", "b", "c"].map((u) => g.fetchText(`https://celestrak.org/${u}`)));
    expect(most).toBe(1);
  });
});

describe("TleStore", () => {
  it("asks for CSV and reads 6-digit catalog numbers", async () => {
    const fetch = answer(200, GP_CSV);
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const store = new TleStore(await tmp("tle.json"), () => ["stations"], await gate(), undefined);
    await store.load();
    const sats = await store.get();
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=CSV",
    );
    expect(sats.map((s) => s.NORAD_CAT_ID)).toEqual([25544, 101074]);
  });

  it("keeps drawing from a TLE cache saved before the switch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const path = await tmp("tle.json", { groups: { stations: { at: Date.now() - HOUR, tles: [ISS_TLE] } } });
    const store = new TleStore(path, () => ["stations"], await gate(), undefined);
    await store.load();
    expect((await store.get()).map((s) => s.OBJECT_NAME)).toEqual(["ISS (ZARYA)"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers from a stale cache without waiting on CelesTrak", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<never>(() => {}))); // never answers
    const path = await tmp("tle.json", { groups: { stations: { at: Date.now() - 2 * DAY, tles: [ISS_TLE] } } });
    const store = new TleStore(path, () => ["stations"], await gate(), undefined);
    await store.load();
    expect(await store.get()).toHaveLength(1);
  });

  it("downloads nothing on start, only when a display asks", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const path = await tmp("tle.json", { groups: { stations: { at: Date.now() - 2 * DAY, tles: [ISS_TLE] } } });
    await new TleStore(path, () => ["stations"], await gate(), undefined).load();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the cache when CelesTrak refuses, and asks nothing more", async () => {
    const fetch = answer(403, "GP data has not updated");
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const path = await tmp("tle.json", {
      groups: {
        stations: { at: Date.now() - 2 * DAY, tles: [ISS_TLE] },
        visual: { at: Date.now() - 2 * DAY, tles: [ISS_TLE] },
      },
    });
    const store = new TleStore(path, () => ["stations", "visual"], await gate(), undefined);
    await store.load();
    expect(await store.get()).toHaveLength(1);
    await settle();
    await store.get();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1); // the second group never asked
  });
});

describe("SatCatStore", () => {
  it("asks only for the drawn groups, and labels rocket bodies", async () => {
    const fetch = answer(200, SATCAT_CSV);
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const store = new SatCatStore(await tmp("satcat.json"), () => ["visual"], await gate());
    await store.load();
    const entries = await store.get();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=CSV",
    );
    expect(entries).toEqual([
      { noradId: "25544", category: "Satellite", launchDate: "1998-11-20", owner: "International" },
      { noradId: "20625", category: "Rocket body", launchDate: "1990-05-15", owner: "Russia / CIS" },
    ]);
  });

  it("keeps a group a week and downloads nothing on start", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const path = await tmp("satcat.json", {
      groups: { stations: { at: Date.now() - 6 * DAY, records: [{ noradId: "25544" }] } },
    });
    const store = new SatCatStore(path, () => ["stations"], await gate());
    await store.load();
    expect(await store.get()).toEqual([{ noradId: "25544", category: "Space station" }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("drops the old whole-catalog cache", async () => {
    const fetch = unreachable();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const path = await tmp("satcat.json", { at: Date.now(), entries: [{ noradId: "25544", category: "Space station" }] });
    const store = new SatCatStore(path, () => ["stations"], await gate());
    await store.load();
    expect(await store.get()).toEqual([]);
  });
});
