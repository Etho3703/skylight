// Fetches satellite orbits (CelesTrak's GP data) for each group the control
// panel selected and caches them in memory + on disk, so the appliance still
// has a sky if it boots offline. Downloads happen only while a display is
// asking for orbits, at most once a day per group, and all go through the
// CelesTrak gate. The client computes positions from these with satellite.js.
//
// Asks for CSV, not TLE: TLEs can't hold the 6-digit catalog numbers given to
// everything launched since July 2026, and the CSV is smaller anyway.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { gpFromCsvRow, isSatelliteGroup, tleToGp, type GpElements } from "@shared/index.js";
import { parseCsv, type CelesTrak } from "./celestrak.js";

const groupUrl = (group: string) =>
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=CSV`;

interface GroupCache {
  at: number;
  sats: GpElements[];
}

/** How orbits were cached before the switch from TLE. */
interface LegacyTle {
  name: string;
  line1: string;
  line2: string;
}

function parseTle(text: string): GpElements[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
  const out: GpElements[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("1 ") && lines[i + 1]?.startsWith("2 ")) {
      const name = (lines[i - 1] ?? "SAT").replace(/^0 /, "").trim();
      const gp = tleToGp(name, lines[i], lines[i + 1]);
      if (gp) out.push(gp);
      i++;
    }
  }
  return out;
}

/** CelesTrak's CSV, or TLE text from a custom TLE_URL source. */
export function parseGp(text: string): GpElements[] {
  if (!text.trimStart().startsWith("OBJECT_NAME")) return parseTle(text);
  return parseCsv(text).flatMap((row) => gpFromCsvRow(row) ?? []);
}

const fromCache = (c: { at?: number; sats?: GpElements[]; tles?: LegacyTle[] }): GroupCache => ({
  at: c.at ?? 0,
  sats: c.sats ?? (c.tles ?? []).flatMap((t) => tleToGp(t.name, t.line1, t.line2) ?? []),
});

export class TleStore {
  private groups = new Map<string, GroupCache>();
  /** CelesTrak updates every 2 h; a day is plenty for a picture of the sky. */
  private ttlMs = 24 * 3600_000;
  private inflight = new Map<string, Promise<void>>();

  /** `getGroups` returns the CelesTrak groups to serve (none while satellites
   *  are hidden). TLE_URL, if set, replaces them all with one custom source,
   *  which goes through the same gate: its rules suit any free source. */
  constructor(
    private cachePath: string,
    private getGroups: () => string[],
    private celestrak: CelesTrak,
    private customUrl = process.env.TLE_URL,
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as {
        groups?: Record<string, { at?: number; sats?: GpElements[]; tles?: LegacyTle[] }>;
        at?: number;
        tles?: LegacyTle[];
      };
      if (parsed.groups) {
        for (const [g, c] of Object.entries(parsed.groups)) this.groups.set(g, fromCache(c));
      } else if (parsed.tles) {
        // Cache from before groups were selectable: it was the visual group.
        this.groups.set("visual", fromCache(parsed));
      }
    } catch {
      /* first run */
    }
  }

  /** Orbits for the selected groups, merged and de-duplicated by NORAD id.
   *  Stale groups answer from cache and refresh behind the response, so a
   *  slow or unreachable CelesTrak can't stall the page; only a group with
   *  nothing cached yet (newly selected) is fetched before answering. */
  async get(): Promise<GpElements[]> {
    const keys = this.keys();
    const stale = keys.filter((k) => Date.now() - (this.groups.get(k)?.at ?? 0) > this.ttlMs);
    const empty = stale.filter((k) => !this.groups.get(k)?.sats.length);
    for (const k of stale) if (!empty.includes(k)) void this.refresh(k);
    await Promise.all(empty.map((k) => this.refresh(k)));
    const seen = new Set<number>();
    const out: GpElements[] = [];
    for (const k of keys) {
      for (const s of this.groups.get(k)?.sats ?? []) {
        if (seen.has(s.NORAD_CAT_ID)) continue;
        seen.add(s.NORAD_CAT_ID);
        out.push(s);
      }
    }
    return out;
  }

  private keys(): string[] {
    // Filtered again here: a hand-edited config.json skips the write validation.
    return this.customUrl ? ["custom"] : this.getGroups().filter(isSatelliteGroup);
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
    const url = key === "custom" && this.customUrl ? this.customUrl : groupUrl(key);
    const text = await this.celestrak.fetchText(url);
    if (text == null) return; // skipped or failed; the gate logged why
    const sats = parseGp(text);
    if (!sats.length) {
      console.error(`[tle] ${key}: no satellites in the answer (using cache)`);
      return;
    }
    this.groups.set(key, { at: Date.now(), sats });
    await this.save();
    console.log(`[tle] refreshed ${key}: ${sats.length} satellites`);
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(
      this.cachePath,
      JSON.stringify({ groups: Object.fromEntries(this.groups) }),
      "utf8",
    );
  }
}
