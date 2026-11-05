// Fetches satellite TLEs (Two-Line Elements) from Celestrak for each group the
// control panel selected, caches them in memory + on disk (so the appliance
// still has a sky if it boots offline), and refreshes daily. The client
// computes positions from these with satellite.js.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isSatelliteGroup } from "@shared/index.js";
import { API_USER_AGENT } from "./datasource.js";

export interface Tle {
  name: string;
  line1: string;
  line2: string;
}

const groupUrl = (group: string) =>
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;

/** CelesTrak asks clients not to re-download a group more than every 2 h. */
const MIN_REFETCH_MS = 2 * 3600_000;

/** How long to wait before asking CelesTrak again after `failures` failed
 *  fetches in a row: 30 min, doubling to a 6 h ceiling. Retrying on every
 *  request is what keeps a blocked IP blocked. */
export function celestrakRetryMs(failures: number): number {
  return Math.min(30 * 60_000 * 2 ** Math.max(0, failures - 1), 6 * 3600_000);
}

/** "30 min" / "2 h", for the log line. */
export function formatRetry(ms: number): string {
  return ms < 3600_000 ? `${Math.round(ms / 60_000)} min` : `${ms / 3600_000} h`;
}

const noradId = (t: Tle) => t.line1.slice(2, 7).trim();

interface GroupCache {
  at: number;
  tles: Tle[];
}

function parseTle(text: string): Tle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
  const out: Tle[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("1 ") && lines[i + 1]?.startsWith("2 ")) {
      const name = (lines[i - 1] ?? "SAT").replace(/^0 /, "").trim();
      out.push({ name, line1: lines[i], line2: lines[i + 1] });
      i++;
    }
  }
  return out;
}

export class TleStore {
  private groups = new Map<string, GroupCache>();
  private ttlMs = 24 * 3600_000;
  private inflight = new Map<string, Promise<void>>();
  /** Consecutive failures per group, for the retry back-off. */
  private failures = new Map<string, { at: number; count: number }>();

  /** `getGroups` returns the CelesTrak groups to serve.
   *  TLE_URL, if set, replaces them all with one custom source. */
  constructor(
    private cachePath: string,
    private getGroups: () => string[],
    private customUrl = process.env.TLE_URL,
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as {
        groups?: Record<string, GroupCache>;
        at?: number;
        tles?: Tle[];
      };
      if (parsed.groups) {
        for (const [g, c] of Object.entries(parsed.groups)) this.groups.set(g, c);
      } else if (parsed.tles) {
        // Cache from before groups were selectable: it was the visual group.
        this.groups.set("visual", { at: parsed.at ?? 0, tles: parsed.tles });
      }
    } catch {
      /* first run */
    }
    // Refresh on startup (non-blocking) and then on a timer.
    void this.refreshAll();
    setInterval(() => void this.refreshAll(), 6 * 3600_000).unref?.();
  }

  /** TLEs for the selected groups, merged and de-duplicated by NORAD id.
   *  Stale groups answer from cache and refresh behind the response, so a
   *  slow or unreachable CelesTrak can't stall the page; only a group with
   *  nothing cached yet (newly selected) is fetched before answering. */
  async get(): Promise<Tle[]> {
    const keys = this.keys();
    const stale = keys.filter((k) => Date.now() - (this.groups.get(k)?.at ?? 0) > this.ttlMs);
    const empty = stale.filter((k) => !this.groups.get(k)?.tles.length);
    for (const k of stale) if (!empty.includes(k)) void this.refresh(k);
    await Promise.all(empty.map((k) => this.refresh(k)));
    const seen = new Set<string>();
    const out: Tle[] = [];
    for (const k of keys) {
      for (const t of this.groups.get(k)?.tles ?? []) {
        const id = noradId(t);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(t);
      }
    }
    return out;
  }

  private keys(): string[] {
    // Filtered again here: a hand-edited config.json skips the write validation.
    return this.customUrl ? ["custom"] : this.getGroups().filter(isSatelliteGroup);
  }

  private async refreshAll(): Promise<void> {
    await Promise.all(this.keys().map((k) => this.refresh(k)));
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
    const cached = this.groups.get(key);
    if (cached && cached.tles.length && Date.now() - cached.at < MIN_REFETCH_MS) return;
    const failed = this.failures.get(key);
    if (failed && Date.now() - failed.at < celestrakRetryMs(failed.count)) return;
    const url = key === "custom" && this.customUrl ? this.customUrl : groupUrl(key);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": API_USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tles = parseTle(await res.text());
      if (!tles.length) throw new Error("no TLEs in response");
      this.groups.set(key, { at: Date.now(), tles });
      this.failures.delete(key);
      await this.save();
      console.log(`[tle] refreshed ${key}: ${tles.length} satellites`);
    } catch (err) {
      const count = (failed?.count ?? 0) + 1;
      this.failures.set(key, { at: Date.now(), count });
      console.error(
        `[tle] ${key} refresh failed (using cache, retry in ${formatRetry(celestrakRetryMs(count))}):`,
        err instanceof Error ? err.message : err,
      );
    }
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
