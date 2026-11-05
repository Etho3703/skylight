import { describe, expect, it } from "vitest";
import { isMilitary, normalize } from "../src/datasource.js";

describe("isMilitary", () => {
  it("takes the feed's flag or a US military address", () => {
    expect(isMilitary("ae4d1c")).toBe(true); // US military block
    expect(isMilitary("a1aa4e")).toBe(false); // airline
    expect(isMilitary("43c6f1", 1)).toBe(true); // flagged by the feed's database
    expect(isMilitary("a1aa4e", 8)).toBe(false); // other flag bits (LADD) don't count
    expect(isMilitary("~2a0b1c")).toBe(false); // non-ICAO TIS-B address
  });

  it("marks military aircraft in the snapshot", () => {
    expect(normalize({ hex: "ae4d1c", t: "B762" }, 0)?.military).toBe(true);
    expect(normalize({ hex: "a1aa4e", t: "B738" }, 0)?.military).toBeUndefined();
  });
});
