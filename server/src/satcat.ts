// Labels a clicked satellite with what it is, who owns it and when it
// launched, from CelesTrak's SATCAT, instead of guessing from its name. Only
// the groups being drawn are looked up, one small query each, and only once
// someone opens a satellite card. Kept a week: launch dates and owners don't
// change, and a brand-new satellite just shows without them for a few days.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isSatelliteGroup } from "@shared/index.js";
import { parseCsv, type CelesTrak } from "./celestrak.js";

const groupUrl = (group: string) =>
  `https://celestrak.org/satcat/records.php?GROUP=${encodeURIComponent(group)}&FORMAT=CSV`;

/** What a group says about its members. "visual" (brightest) says nothing. */
const GROUP_KIND: Record<string, string> = {
  "stations": "Space station",
  "starlink": "Starlink internet satellite",
  "oneweb": "OneWeb internet satellite",
  "gps-ops": "GPS navigation satellite",
  "galileo": "Galileo navigation satellite",
  "weather": "Weather satellite",
  "science": "Science satellite",
  "geo": "Geostationary communications satellite",
  "amateur": "Amateur radio satellite",
};

/** SATCAT OBJECT_TYPE, when it says more than "payload". */
const OBJECT_KIND: Record<string, string> = {
  "R/B": "Rocket body",
  "DEB": "Debris",
};

/** OWNER codes are CelesTrak's own registry abbreviations, not ISO codes. */
const OWNER_NAMES: Record<string, string> = {
  US: "United States", CIS: "Russia / CIS", PRC: "China", ESA: "European Space Agency",
  JPN: "Japan", IND: "India", FR: "France", UK: "United Kingdom", CA: "Canada",
  ISRO: "India", ISS: "International", NATO: "NATO", SES: "Luxembourg",
  UAE: "United Arab Emirates", RASC: "Russia", SKOR: "South Korea",
};

export interface SatCatEntry {
  noradId: string;
  category: string;
  launchDate?: string;
  owner?: string;
}

interface SatCatRecord {
  noradId: string;
  objectType?: string;
  launchDate?: string;
  owner?: string;
}

interface GroupCache {
  at: number;
  records: SatCatRecord[];
}

export class SatCatStore {
  private groups = new Map<string, GroupCache>();
  private ttlMs = 7 * 24 * 3600_000;
  private inflight = new Map<string, Promise<void>>();

  /** `getGroups` returns the groups being drawn. */
  constructor(
    private cachePath: string,
    private getGroups: () => string[],
    private celestrak: CelesTrak,
  ) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as {
        groups?: Record<string, GroupCache>;
      };
      // A cache from before (the whole catalog, no groups) is dropped.
      for (const [g, c] of Object.entries(parsed.groups ?? {})) this.groups.set(g, c);
    } catch {
      /* first run */
    }
  }

  /** Answers from cache and refreshes behind it; waits only for a group with
   *  nothing cached yet. */
  async get(): Promise<SatCatEntry[]> {
    const keys = this.getGroups().filter(isSatelliteGroup);
    const stale = keys.filter((k) => Date.now() - (this.groups.get(k)?.at ?? 0) > this.ttlMs);
    const empty = stale.filter((k) => !this.groups.get(k)?.records.length);
    for (const k of stale) if (!empty.includes(k)) void this.refresh(k);
    await Promise.all(empty.map((k) => this.refresh(k)));

    const out = new Map<string, SatCatEntry>();
    for (const k of keys) {
      for (const r of this.groups.get(k)?.records ?? []) {
        const prev = out.get(r.noradId);
        const kind = OBJECT_KIND[r.objectType ?? ""] ?? GROUP_KIND[k];
        out.set(r.noradId, {
          noradId: r.noradId,
          // A satellite in "visual" and "weather" is a weather satellite.
          category: prev && prev.category !== "Satellite" ? prev.category : kind ?? "Satellite",
          launchDate: r.launchDate,
          owner: r.owner,
        });
      }
    }
    return [...out.values()];
  }

  private refresh(key: string): Promise<void> {
    let p = this.inflight.get(key);
    if (!p) {
      p = this.fetchGroup(key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  private async fetchGroup(key: string): Promise<void> {
    const text = await this.celestrak.fetchText(groupUrl(key));
    if (text == null) return; // skipped or failed; the gate logged why
    const records = parseCsv(text).flatMap((row): SatCatRecord[] => {
      const id = row.NORAD_CAT_ID?.trim();
      if (!id) return [];
      const owner = row.OWNER?.trim();
      return [{
        noradId: id,
        objectType: row.OBJECT_TYPE?.trim() || undefined,
        launchDate: row.LAUNCH_DATE?.trim() || undefined,
        owner: owner ? OWNER_NAMES[owner] ?? owner : undefined,
      }];
    });
    if (!records.length) {
      console.error(`[satcat] ${key}: no records in the answer (using cache)`);
      return;
    }
    this.groups.set(key, { at: Date.now(), records });
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify({ groups: Object.fromEntries(this.groups) }), "utf8");
    console.log(`[satcat] refreshed ${key}: ${records.length} satellites`);
  }
}
