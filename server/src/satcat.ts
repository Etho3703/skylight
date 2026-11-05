// Fetches CelesTrak's official satellite category groupings (Starlink, GPS,
// weather, science, stations, etc.) plus the bulk SATCAT (launch date, owning
// country) for every cataloged object, merges them by NORAD ID, and caches
// the result on disk. Used to label a clicked satellite with real
// classification and launch info rather than guessing from its name.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { API_USER_AGENT } from "./datasource.js";
import { CELESTRAK_RETRY_MS } from "./tle.js";

const GROUPS: Record<string, string> = {
  "stations": "Space station",
  "starlink": "Starlink internet satellite",
  "oneweb": "OneWeb internet satellite",
  "gps-ops": "GPS navigation satellite",
  "glo-ops": "GLONASS navigation satellite",
  "galileo": "Galileo navigation satellite",
  "beidou": "BeiDou navigation satellite",
  "weather": "Weather satellite",
  "noaa": "Weather satellite",
  "goes": "Weather satellite",
  "science": "Science satellite",
  "geo": "Geostationary communications satellite",
  "intelsat": "Communications satellite",
  "ses": "Communications satellite",
  "amateur": "Amateur radio satellite",
  "military": "Military satellite",
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

function extractNoradId(line1: string): string | null {
  const m = line1.match(/^1\s+(\d+)/);
  return m ? m[1] : null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export class SatCatStore {
  private entries = new Map<string, SatCatEntry>();
  private fetchedAt = 0;
  private ttlMs = 12 * 3600_000;
  private failedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(private cachePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as { at: number; entries: SatCatEntry[] };
      this.entries = new Map(parsed.entries.map((e) => [e.noradId, e]));
      this.fetchedAt = parsed.at ?? 0;
    } catch {
      /* first run */
    }
    // Only when stale: a refresh is ~20 CelesTrak downloads, and a restart
    // (or a dev-server restart loop) mustn't repeat them.
    void this.refreshIfStale();
    setInterval(() => void this.refreshIfStale(), 6 * 3600_000).unref?.();
  }

  /** Answers from cache and refreshes behind it; waits only when empty. */
  async get(): Promise<SatCatEntry[]> {
    if (this.entries.size) void this.refreshIfStale();
    else await this.refreshIfStale();
    return [...this.entries.values()];
  }

  private refreshIfStale(): Promise<void> {
    if (Date.now() - this.fetchedAt <= this.ttlMs) return Promise.resolve();
    if (Date.now() - this.failedAt < CELESTRAK_RETRY_MS) return Promise.resolve();
    this.inflight ??= this.refresh().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async fetchCategories(): Promise<Map<string, string> | null> {
    const byId = new Map<string, string>();
    let anySuccess = false;
    for (const [group, label] of Object.entries(GROUPS)) {
      try {
        const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
        const res = await fetch(url, {
          headers: { "User-Agent": API_USER_AGENT },
          signal: AbortSignal.timeout(15000),
        });
        // Refused or rate-limited: asking for the other groups only adds to it.
        if (res.status === 403 || res.status === 429) break;
        if (!res.ok) continue;
        const text = await res.text();
        const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
        for (const line of lines) {
          if (!line.startsWith("1 ")) continue;
          const id = extractNoradId(line);
          if (id && !byId.has(id)) byId.set(id, label);
        }
        anySuccess = true;
      } catch {
        // Unreachable (timeout, reset, DNS), not a bad group: the rest would
        // fail the same way, 15 s apiece.
        break;
      }
    }
    return anySuccess ? byId : null;
  }

  private async fetchLaunchInfo(): Promise<Map<string, { launchDate?: string; owner?: string }> | null> {
    try {
      const res = await fetch("https://celestrak.org/pub/satcat.csv", {
        headers: { "User-Agent": API_USER_AGENT },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter((l) => l.length);
      const header = parseCsvLine(lines[0]);
      const cId = header.indexOf("NORAD_CAT_ID");
      const cOwner = header.indexOf("OWNER");
      const cLaunch = header.indexOf("LAUNCH_DATE");
      if (cId < 0) return null;

      const out = new Map<string, { launchDate?: string; owner?: string }>();
      for (let i = 1; i < lines.length; i++) {
        const r = parseCsvLine(lines[i]);
        const id = r[cId];
        if (!id) continue;
        const ownerCode = cOwner >= 0 ? r[cOwner] : undefined;
        out.set(id, {
          launchDate: cLaunch >= 0 && r[cLaunch] ? r[cLaunch] : undefined,
          owner: ownerCode ? OWNER_NAMES[ownerCode] ?? ownerCode : undefined,
        });
      }
      return out;
    } catch (e) {
      console.error("[satcat] bulk SATCAT download failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }

  private async refresh(): Promise<void> {
    const [categories, launchInfo] = await Promise.all([
      this.fetchCategories(),
      this.fetchLaunchInfo(),
    ]);
    if (!categories && !launchInfo) {
      this.failedAt = Date.now();
      console.error(
        `[satcat] refresh failed entirely (using cache, retry in ${CELESTRAK_RETRY_MS / 60_000} min)`,
      );
      return;
    }

    const merged = new Map<string, SatCatEntry>();
    const ids = new Set<string>([
      ...(categories?.keys() ?? []),
      ...(launchInfo?.keys() ?? []),
    ]);
    for (const id of ids) {
      const prev = this.entries.get(id);
      merged.set(id, {
        noradId: id,
        category: categories?.get(id) ?? prev?.category ?? "Satellite",
        launchDate: launchInfo?.get(id)?.launchDate ?? prev?.launchDate,
        owner: launchInfo?.get(id)?.owner ?? prev?.owner,
      });
    }

    this.entries = merged;
    this.fetchedAt = Date.now();
    const entries = [...merged.values()];
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify({ at: this.fetchedAt, entries }), "utf8");
    console.log(`[satcat] refreshed ${entries.length} satellites (categories + launch info)`);
  }
}