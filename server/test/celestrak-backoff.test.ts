import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TleStore } from "../src/tle.js";
import { SatCatStore } from "../src/satcat.js";

// CelesTrak firewalls IPs that ask too often. These pin down the polite side:
// a restart doesn't re-download a fresh cache, a stale cache answers at once,
// and a failure isn't retried on the next request.

const DAY = 24 * 3600_000;
const ISS = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26308.50000000  .00016717  00000-0  10270-3 0  9005",
  line2: "2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.50000000000017",
};

async function cacheFile(body: unknown): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "skylight-celestrak-")), "cache.json");
  await writeFile(path, JSON.stringify(body), "utf8");
  return path;
}

/** Lets the stores' promise chains settle (no real I/O on these paths). */
const settle = () => new Promise((r) => setTimeout(r, 0));

const unreachable = () =>
  vi.fn(async () => {
    throw new TypeError("fetch failed");
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TleStore", () => {
  it("answers from a stale cache without waiting on CelesTrak", async () => {
    const fetch = vi.fn(() => new Promise<never>(() => {})); // never answers
    vi.stubGlobal("fetch", fetch);
    const path = await cacheFile({
      groups: { stations: { at: Date.now() - 2 * DAY, tles: [ISS] } },
    });
    const store = new TleStore(path, () => ["stations"], undefined);
    await store.load();
    expect(await store.get()).toEqual([ISS]);
    expect(fetch).toHaveBeenCalledTimes(1); // load's refresh; get() joined it
  });

  it("doesn't retry a failed group on the next request", async () => {
    const fetch = unreachable();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const path = await cacheFile({
      groups: { stations: { at: Date.now() - 2 * DAY, tles: [ISS] } },
    });
    const store = new TleStore(path, () => ["stations"], undefined);
    await store.load();
    await settle();
    await store.get();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't re-download a fresh cache on restart", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const path = await cacheFile({
      groups: { stations: { at: Date.now() - 3600_000, tles: [ISS] } },
    });
    await new TleStore(path, () => ["stations"], undefined).load();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("SatCatStore", () => {
  const entry = { noradId: "25544", category: "Space station" };

  it("doesn't re-download a fresh cache on restart", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const store = new SatCatStore(await cacheFile({ at: Date.now() - 3600_000, entries: [entry] }));
    await store.load();
    expect(await store.get()).toEqual([entry]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops at the first unreachable group and backs off", async () => {
    const fetch = unreachable();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new SatCatStore(await cacheFile({ at: Date.now() - 2 * DAY, entries: [entry] }));
    await store.load();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2); // one category group + the bulk CSV
    expect(await store.get()).toEqual([entry]);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
