import { describe, expect, it } from "vitest";
import type { Aircraft } from "@shared/index.js";
import { classifyGlyph } from "../src/display/aircraftGlyph.js";

const ac = (typeCode?: string, extra: Partial<Aircraft> = {}): Aircraft =>
  ({ hex: "a00001", typeCode, ...extra }) as Aircraft;

describe("classifyGlyph", () => {
  it("gives rear-engine regional and business jets their own shape", () => {
    expect(classifyGlyph(ac("CRJ7"))).toBe("rearjet");
    expect(classifyGlyph(ac("E55P"))).toBe("rearjet");
    // The type code wins over the emitter category (a Citation M2 reports A1).
    expect(classifyGlyph(ac("C25M", { category: "A1" }))).toBe("rearjet");
    expect(classifyGlyph(ac("E75L"))).toBe("airliner"); // wing-mounted engines
  });

  it("separates single turboprops and light twins from the old shapes", () => {
    expect(classifyGlyph(ac("PC12"))).toBe("turbosingle");
    expect(classifyGlyph(ac("BE58"))).toBe("lighttwin");
    expect(classifyGlyph(ac("DH8D"))).toBe("turboprop");
    expect(classifyGlyph(ac("C172"))).toBe("light");
  });

  it("draws tankers with a boom, KC-46s only when military", () => {
    expect(classifyGlyph(ac("K35R"))).toBe("tanker");
    expect(classifyGlyph(ac("B762", { military: true }))).toBe("twintanker");
    expect(classifyGlyph(ac("B762"))).toBe("widebody");
  });

  it("knows the military shapes", () => {
    expect(classifyGlyph(ac("C17"))).toBe("airlifter");
    expect(classifyGlyph(ac("C130"))).toBe("quadprop");
    expect(classifyGlyph(ac("F16"))).toBe("fighter");
    expect(classifyGlyph(ac(undefined, { category: "A6" }))).toBe("fighter");
  });

  it("draws drones and UAVs as a quadcopter", () => {
    expect(classifyGlyph(ac("Q9"))).toBe("drone"); // MQ-9 Reaper
    expect(classifyGlyph(ac("Q4"))).toBe("drone"); // RQ-4 Global Hawk
    expect(classifyGlyph(ac(undefined, { category: "B6" }))).toBe("drone");
  });
});
