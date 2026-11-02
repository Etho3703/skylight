import { describe, expect, it } from "vitest";
import { ringStep } from "../src/display/renderer.js";
import { convertDistance, convertDistanceToMi, formatDistance, MAX_RADIUS_MI } from "@shared/index.js";

describe("range rings", () => {
  it("keeps one ring per unit at the default few-mile radius", () => {
    expect(ringStep(3)).toBe(1);
    expect(ringStep(5)).toBe(1);
  });

  it("widens the spacing so a 100 nm view gets a handful of rings", () => {
    expect(ringStep(100)).toBe(25);
    expect(100 / ringStep(100)).toBeLessThanOrEqual(5);
    expect(ringStep(185)).toBe(50); // 100 nm in km
    expect(ringStep(12)).toBe(5);
  });
});

describe("nautical miles", () => {
  it("round-trips through the stored statute miles", () => {
    expect(convertDistance(MAX_RADIUS_MI, "nm")).toBeCloseTo(100, 6);
    expect(convertDistanceToMi(100, "nm")).toBeCloseTo(MAX_RADIUS_MI, 6);
    expect(formatDistance(MAX_RADIUS_MI, "nm")).toMatch(/^100 nm$/);
  });
});
