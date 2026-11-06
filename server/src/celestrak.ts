// The one way to CelesTrak. It firewalls IPs that ask too often or ignore its
// errors (https://celestrak.org/usage-policy.php), so every download from it
// goes through here:
// - one request at a time;
// - the same URL at most once per 2 h, CelesTrak's fastest update cycle;
// - any answer other than HTTP 200 stops every download until a person reads
//   CelesTrak's message and presses Resume in the control panel;
// - when CelesTrak can't be reached, wait 30 min, doubling to 6 h, before
//   trying again.
// The state is saved to disk, so a restart (or a restart loop) can't undo it.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { CelestrakStatus } from "@shared/index.js";
import { API_USER_AGENT } from "./datasource.js";

/** CelesTrak checks for new GP data every 2 h; asking sooner earns a 403. */
export const MIN_REFETCH_MS = 2 * 3600_000;

/** How long to wait after `failures` unanswered tries in a row: 30 min,
 *  doubling to a 6 h ceiling. */
export function celestrakRetryMs(failures: number): number {
  return Math.min(30 * 60_000 * 2 ** Math.max(0, failures - 1), 6 * 3600_000);
}

/** "30 min" / "2 h", for the log line. */
export function formatRetry(ms: number): string {
  return ms < 3600_000 ? `${Math.round(ms / 60_000)} min` : `${ms / 3600_000} h`;
}

interface State {
  halt?: NonNullable<CelestrakStatus["halt"]>;
  unreachable?: { at: number; count: number };
  /** Last successful download per URL. */
  fetched: Record<string, number>;
}

/** CelesTrak's error pages are short HTML; keep the words. */
function plainText(body: string): string {
  return body
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function haltBanner(h: NonNullable<CelestrakStatus["halt"]>): string {
  return [
    h.status ? `[celestrak] STOPPED: HTTP ${h.status} for ${h.url}` : "[celestrak] STOPPED by hand",
    `[celestrak] ${h.status ? "CelesTrak says" : "Note"}: ${h.message || "(no message)"}`,
    "[celestrak] No more CelesTrak downloads until someone reads this, fixes the cause",
    "[celestrak] and presses Resume in the control panel (Sky section).",
  ].join("\n");
}

export class CelesTrak {
  private state: State = { fetched: {} };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private statePath: string) {}

  async load(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.statePath, "utf8")) as Partial<State>;
      this.state = { ...saved, fetched: saved.fetched ?? {} };
    } catch {
      /* first run */
    }
    if (this.state.halt) console.error(haltBanner(this.state.halt));
  }

  status(): CelestrakStatus {
    const u = this.state.unreachable;
    return {
      halt: this.state.halt,
      retryAt: u ? u.at + celestrakRetryMs(u.count) : undefined,
    };
  }

  /** A person read the message and dealt with the cause. */
  async resume(): Promise<CelestrakStatus> {
    delete this.state.halt;
    delete this.state.unreachable;
    await this.save();
    console.log("[celestrak] downloads resumed");
    return this.status();
  }

  /** The response body, or null when the download was skipped or failed
   *  (already logged). */
  fetchText(url: string, timeoutMs = 30_000): Promise<string | null> {
    const next = this.queue.then(() => this.fetchNow(url, timeoutMs));
    this.queue = next.catch(() => {});
    return next;
  }

  private async fetchNow(url: string, timeoutMs: number): Promise<string | null> {
    const { halt, unreachable } = this.state;
    if (halt) return null;
    if (unreachable && Date.now() - unreachable.at < celestrakRetryMs(unreachable.count)) return null;
    if (Date.now() - (this.state.fetched[url] ?? 0) < MIN_REFETCH_MS) return null;

    let status: number;
    let body: string;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": API_USER_AGENT },
        // A 301 is CelesTrak saying the URL is outdated: stop, don't follow it.
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      body = await res.text();
    } catch (err) {
      const count = (unreachable?.count ?? 0) + 1;
      this.state.unreachable = { at: Date.now(), count };
      await this.save();
      console.error(
        `[celestrak] unreachable (${err instanceof Error ? err.message : err}), next try in ${formatRetry(celestrakRetryMs(count))}`,
      );
      return null;
    }

    if (status !== 200) {
      this.state.halt = { at: Date.now(), url, status, message: plainText(body) };
      await this.save();
      console.error(haltBanner(this.state.halt));
      return null;
    }
    delete this.state.unreachable;
    this.state.fetched[url] = Date.now();
    await this.save();
    return body;
  }

  private async save(): Promise<void> {
    try {
      await mkdir(dirname(this.statePath), { recursive: true });
      await writeFile(this.statePath, JSON.stringify(this.state), "utf8");
    } catch (err) {
      // Without this file a restart forgets a stop; say so loudly.
      console.error("[celestrak] couldn't save state:", err instanceof Error ? err.message : err);
    }
  }
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

/** CelesTrak's CSV answers (GP and SATCAT): one object per row, keyed by the
 *  header line. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}
