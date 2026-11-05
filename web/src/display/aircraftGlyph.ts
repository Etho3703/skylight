// Type-aware aircraft glyphs, all in the same luminous swept-wing style as the
// original airliner: bigger widebodies, four-engine heavies, rear-engine
// regional and business jets, fast jets, military airlifters, tankers trailing
// a boom, turboprops and GA with spinning props, helicopters with spinning
// rotors, and a quadcopter for drones and UAVs. Classification is from the ICAO
// type code with emitter-category fallbacks.

import type { Aircraft } from "@shared/index.js";

export type GlyphKind =
  | "light"
  | "lighttwin"
  | "turbosingle"
  | "glider"
  | "turboprop"
  | "quadprop"
  | "rearjet"
  | "fighter"
  | "airliner"
  | "widebody"
  | "quadjet"
  | "airlifter"
  | "tanker"
  | "twintanker"
  | "helicopter"
  | "drone";

// Relative size per kind (multiplies the configured glyph size).
export const GLYPH_SCALE: Record<GlyphKind, number> = {
  light: 0.62,
  lighttwin: 0.7,
  turbosingle: 0.72,
  glider: 0.58,
  turboprop: 0.86,
  quadprop: 1.12,
  rearjet: 0.82,
  fighter: 0.74,
  airliner: 1.0,
  widebody: 1.3,
  quadjet: 1.46,
  airlifter: 1.4,
  tanker: 1.22,
  twintanker: 1.3,
  helicopter: 0.82,
  drone: 0.7,
};

// UAVs by type code (MQ-1, RQ-4, MQ-9, MQ-25, Heron); the rest send emitter
// category B6.
const UAV = new Set(["DRON", "Q1", "Q4", "Q9", "Q25", "HRON"]);

const HELI = new Set([
  "EC20", "EC25", "EC30", "EC35", "EC45", "EC55", "AS50", "AS55", "AS65", "AS32",
  "A109", "A119", "A139", "A169", "A189", "B06", "B06T", "B407", "B412", "B427",
  "B429", "B430", "B505", "S76", "S92", "S61", "S64", "H60", "H500", "MD52",
  "MD60", "R22", "R44", "R66", "EXEC", "EXPL", "GAZL", "LYNX", "NH90", "PUMA",
  "SCAV", "UH1", "B105", "B212", "B214", "B222", "AC", "H47", "H64",
]);
const QUAD = new Set([
  "B741", "B742", "B743", "B744", "B748", "B74S", "B74R", "B74D", "A388", "A342",
  "A343", "A345", "A346", "IL96", "B52", "A140", "B701", "B703", "C135", "R135",
  "E3TF", "E3CF", "E6", "DC85", "DC86", "DC87",
]);
// KC-135s. KC-46s, KC-10s and A330 MRTTs report their airliner codes instead
// (B762, DC10, A332), so those are told apart by the military flag.
const TANKER = new Set(["K35R", "K35E"]);
const TWIN_TANKER_BASE = new Set(["B762", "B763", "A332", "A310", "DC10"]);
// High-wing jet transports with a T-tail and four pods (the BAe 146 / Avro RJ
// shares the outline).
const AIRLIFTER = new Set([
  "C17", "C5", "C5M", "A124", "A225", "IL76", "Y20", "C141", "B461", "B462",
  "B463", "RJ70", "RJ85", "RJ1H",
]);
const QUADPROP = new Set(["C130", "C30J", "A400", "P3", "L188", "AN12", "AN22", "DHC7"]);
const FIGHTER = new Set([
  "F16", "F15", "F18", "F18H", "F18S", "F35", "F22", "F14", "F4", "F5", "A10",
  "AV8B", "T38", "T45", "L39", "L159", "M346", "HAWK", "AJET", "EUFI", "RFAL",
  "GRIF", "MIR2", "TOR", "SU27", "MG29",
]);
// Engines on the rear fuselage: CRJs and ERJ-145s, business jets, DC-9 / MD-80
// / 717, 727, Fokker 100.
const REARJET = new Set([
  "CRJ1", "CRJ2", "CRJ7", "CRJ9", "CRJX", "E135", "E145", "E35L", "E45X", "E545",
  "E550", "E50P", "E55P", "C500", "C501", "C510", "C525", "C25A", "C25B", "C25C",
  "C25M", "C526", "C550", "C551", "C55B", "C560", "C56X", "C650", "C680", "C68A",
  "C700", "C750", "LJ23", "LJ24", "LJ25", "LJ28", "LJ31", "LJ35", "LJ40", "LJ45",
  "LJ55", "LJ60", "LJ70", "LJ75", "GLF2", "GLF3", "GLF4", "GLF5", "GLF6", "GLEX",
  "GL5T", "GL7T", "G150", "G280", "GALX", "ASTR", "GA5C", "GA6C", "GA7C", "GA8C",
  "CL30", "CL35", "CL60", "FA10", "FA20", "FA50", "FA6X", "FA7X", "FA8X", "F900",
  "F2TH", "BE40", "PRM1", "H25A", "H25B", "H25C", "HA4T", "HDJT", "PC24", "EA50",
  "SF50", "J328", "SBR1", "WW24", "DC91", "DC92", "DC93", "DC94", "DC95", "MD81",
  "MD82", "MD83", "MD87", "MD88", "MD90", "B712", "B721", "B722", "B727", "F100",
  "F70", "F28", "BA11", "IL62", "T134", "YK40", "YK42",
]);
const WIDE = new Set([
  "A306", "A30B", "A310", "A332", "A333", "A338", "A339", "A359", "A35K", "B762",
  "B763", "B764", "B772", "B77L", "B773", "B77W", "B778", "B779", "B788", "B789",
  "B78X", "MD11", "IL86", "DC10", "L101", "A337", "B767", "B777", "B787",
]);
const TPROP = new Set([
  "DH8A", "DH8B", "DH8C", "DH8D", "AT43", "AT44", "AT45", "AT46", "AT72", "AT73",
  "AT75", "AT76", "SF34", "SB20", "SW3", "SW4", "E110", "E120", "C212", "C408",
  "B190", "BE20", "B350", "B300", "BE9L", "BE9T", "BE10", "JS31", "JS32", "JS41",
  "D228", "D328", "F50", "F27", "ATP", "C441", "C425", "DHC6", "AN26", "AN32",
  "SH36", "CVLT", "SAAB", "P180", "C27J", "CN35", "C295",
]);
const TURBOSINGLE = new Set([
  "PC12", "PC6", "PC7", "PC9", "PC21", "C208", "TBM7", "TBM8", "TBM9", "TBM0",
  "P46T", "KODI", "EPIC", "TEX2",
]);
const LIGHTTWIN = new Set([
  "C303", "C310", "C320", "C335", "C340", "C402", "C404", "C411", "C414", "C421",
  "PA23", "PA27", "PA30", "PA31", "PA34", "PA44", "PA60", "BE55", "BE56", "BE58",
  "BE60", "BE76", "BE95", "DA42", "DA62", "P68", "AEST", "AC50",
]);
const GLIDER = new Set([
  "DISC", "DUOD", "VENT", "NIMB", "NIM3", "NIM4", "JANS", "ARCE", "DG40", "DG80",
  "DG1T", "DG30", "DG50", "LS3", "LS4", "LS6", "LS7", "LS8", "STD3", "G103",
  "G102", "G104", "PW5", "PW6", "L13", "L23", "L33", "PIK", "PEGA", "KEST",
  "TWIN", "AS33", "ASW", "ASG", "ASK", "VENS", "GLID", "MOSQ", "DIMO",
]);
const LIGHT = new Set([
  "C150", "C152", "C162", "C172", "C72R", "C175", "C177", "C180", "C182", "C185",
  "C188", "C206", "C207", "C210", "C337", "SR20", "SR22", "S22T", "PA18", "PA24",
  "PA28", "P28A", "P28B", "P28R", "PA32", "P32R", "PA38", "PA46", "DA20", "DA40",
  "BE33", "BE35", "BE36", "BE19", "BE23", "BE24", "M20P", "M20T", "AA1", "AA5",
  "GLAS", "COL4", "RV4", "RV6", "RV7", "RV8", "RV9", "RV10", "RV14", "GA8", "G115",
  "BL8", "CH7",
]);

export function classifyGlyph(ac: Aircraft): GlyphKind {
  const code = (ac.typeCode || "").toUpperCase();
  const cat = ac.category;
  if (cat === "B6" || UAV.has(code)) return "drone";
  if (cat === "A7" || HELI.has(code)) return "helicopter";
  if (TANKER.has(code)) return "tanker";
  if (ac.military && TWIN_TANKER_BASE.has(code)) return "twintanker";
  if (FIGHTER.has(code) || cat === "A6") return "fighter";
  if (AIRLIFTER.has(code)) return "airlifter";
  if (QUADPROP.has(code)) return "quadprop";
  if (QUAD.has(code)) return "quadjet";
  if (WIDE.has(code) || cat === "A5") return "widebody";
  if (REARJET.has(code)) return "rearjet";
  if (TPROP.has(code)) return "turboprop";
  if (TURBOSINGLE.has(code)) return "turbosingle";
  if (LIGHTTWIN.has(code)) return "lighttwin";
  if (GLIDER.has(code) || cat === "B1") return "glider";
  if (LIGHT.has(code) || cat === "A1") return "light";
  return "airliner";
}

type RGB = [number, number, number];
const col = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * Draw a glyph in local space (already translated to position and rotated so
 * "up" / -y is the direction of travel). Caller draws the halo; we draw the
 * glowing silhouette, engines/props/rotors, and bright core.
 */
export function drawAircraftGlyph(
  ctx: CanvasRenderingContext2D,
  kind: GlyphKind,
  s: number,
  color: RGB,
  alpha: number,
  t: number,
  seed: number,
): void {
  ctx.shadowColor = col(color, 0.85 * alpha);
  ctx.shadowBlur = s * 0.7;
  ctx.fillStyle = col(color, Math.min(1, alpha * 1.08));

  switch (kind) {
    case "widebody":
      jetBody(ctx, s, { fw: 0.22, nose: -1.16, tail: 1.06, span: 1.16, tipY: 0.5 });
      fillAndEngines(ctx, s, color, alpha, [0.42, 0.66]);
      core(ctx, s, alpha, 0.1);
      break;
    case "quadjet":
      jetBody(ctx, s, { fw: 0.22, nose: -1.2, tail: 1.08, span: 1.2, tipY: 0.5 });
      fillAndEngines(ctx, s, color, alpha, [0.4, 0.7]);
      core(ctx, s, alpha, 0.1);
      break;
    case "tanker":
      // KC-135: four-engine airliner outline with the boom trailing the tail.
      jetBody(ctx, s, { fw: 0.2, nose: -1.1, tail: 0.86, span: 1.12, tipY: 0.5 });
      fillAndEngines(ctx, s, color, alpha, [0.38, 0.68]);
      boom(ctx, s, color, alpha, 0.86);
      core(ctx, s, alpha, 0.1);
      break;
    case "twintanker":
      // KC-46 / KC-10 / A330 MRTT: widebody twin with the boom.
      jetBody(ctx, s, { fw: 0.22, nose: -1.12, tail: 0.88, span: 1.14, tipY: 0.5 });
      fillAndEngines(ctx, s, color, alpha, [0.44]);
      boom(ctx, s, color, alpha, 0.88);
      core(ctx, s, alpha, 0.1);
      break;
    case "airlifter":
      // C-17: wide fuselage, shallower sweep, four pods, tailplane on top of the fin.
      jetBody(ctx, s, {
        fw: 0.3, nose: -1.04, tail: 1.0, span: 1.16, tipY: 0.4,
        sweep: 0.38, tailFromEnd: 0.1, tailSpan: 0.5,
      });
      fillAndEngines(ctx, s, color, alpha, [0.4, 0.7]);
      core(ctx, s, alpha, 0.1);
      break;
    case "rearjet":
      // CRJ / Citation: clean wing set aft, engines on the rear fuselage, T-tail.
      jetBody(ctx, s, {
        fw: 0.18, nose: -1.04, tail: 0.98, span: 0.98, tipY: 0.5,
        wingY: 0.1, tailFromEnd: 0.1, tailSpan: 0.4,
      });
      fillAndEngines(ctx, s, color, alpha, [0.17], 0.64, 0.06, 0.15);
      core(ctx, s, alpha, 0.08);
      break;
    case "fighter":
      fighterBody(ctx, s);
      ctx.fill();
      core(ctx, s, alpha, 0.08);
      break;
    case "quadprop":
      // C-130: straight wing, four props.
      jetBody(ctx, s, { fw: 0.26, nose: -1.0, tail: 1.0, span: 1.16, tipY: 0.34, straight: true, tailSpan: 0.48 });
      ctx.fill();
      ctx.shadowBlur = 0;
      for (const x of [-0.74, -0.4, 0.4, 0.74]) {
        propDisc(ctx, x * s, 0.1 * s, 0.2 * s, color, alpha, Math.sign(x) * t * 9 + seed + x, x > 0);
      }
      core(ctx, s, alpha, 0.09);
      break;
    case "turboprop":
    case "lighttwin":
      jetBody(ctx, s, { fw: 0.2, nose: -1.0, tail: 0.96, span: 1.04, tipY: 0.34, straight: true });
      ctx.fill();
      ctx.shadowBlur = 0;
      // Props in place of nacelles, spinning.
      propDisc(ctx, -0.5 * s, 0.18 * s, 0.26 * s, color, alpha, t * 9 + seed);
      propDisc(ctx, 0.5 * s, 0.18 * s, 0.26 * s, color, alpha, -t * 9 + seed, true);
      core(ctx, s, alpha, 0.09);
      break;
    case "light":
    case "turbosingle":
      lightBody(ctx, s);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Single nose prop, spinning.
      propDisc(ctx, 0, -0.95 * s, 0.34 * s, color, alpha, t * 11 + seed);
      break;
    case "glider":
      gliderBody(ctx, s);
      ctx.fill();
      ctx.shadowBlur = 0;
      core(ctx, s, alpha, 0.07);
      break;
    case "helicopter":
      heliBody(ctx, s);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Tail rotor (small, fast) then main rotor (large, over the body).
      propDisc(ctx, 0.04 * s, 1.18 * s, 0.22 * s, color, alpha, t * 16 + seed, false, 2);
      mainRotor(ctx, s, color, alpha, t * 6 + seed);
      break;
    case "drone":
      droneArms(ctx, s, color, alpha);
      droneBody(ctx, s);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Rotors at the arm tips, neighbours spinning opposite ways.
      for (const [x, y, dir] of [[-1, -1, 1], [1, -1, -1], [1, 1, 1], [-1, 1, -1]]) {
        propDisc(ctx, x * 0.62 * s, y * 0.62 * s, 0.34 * s, color, alpha, dir * t * 14 + seed, false, 2);
      }
      core(ctx, s, alpha, 0.08);
      break;
    case "airliner":
    default:
      jetBody(ctx, s, { fw: 0.2, nose: -1.06, tail: 0.98, span: 1.05, tipY: 0.52 });
      fillAndEngines(ctx, s, color, alpha, [0.46]);
      core(ctx, s, alpha, 0.1);
      break;
  }
}

interface JetOpts {
  fw: number;
  nose: number;
  tail: number;
  span: number;
  tipY: number;
  straight?: boolean;
  /** Leading-edge sweep depth, overriding the swept / straight default. */
  sweep?: number;
  /** Move the wing aft by this much (rear-engine jets carry it further back). */
  wingY?: number;
  /** Tailplane root distance from the tail end; small = T-tail at the very end. */
  tailFromEnd?: number;
  tailSpan?: number;
}

/** Trace fuselage + swept (or straight) wings + tailplane into the current path. */
function jetBody(ctx: CanvasRenderingContext2D, s: number, o: JetOpts): void {
  const sweep = o.sweep ?? (o.straight ? 0.18 : 0.54); // wing leading-edge sweep depth
  const w = o.wingY ?? 0;
  ctx.beginPath();
  ctx.roundRect((-o.fw * s) / 2, o.nose * s, o.fw * s, (o.tail - o.nose) * s, (o.fw * s) / 2);
  // Main wings.
  ctx.moveTo(-0.09 * s, (w - 0.02) * s);
  ctx.lineTo(-o.span * s, (w + sweep) * s);
  ctx.lineTo(-(o.span - 0.1) * s, (w + sweep + 0.06) * s);
  ctx.lineTo(-0.09 * s, (w + 0.3) * s);
  ctx.lineTo(0.09 * s, (w + 0.3) * s);
  ctx.lineTo((o.span - 0.1) * s, (w + sweep + 0.06) * s);
  ctx.lineTo(o.span * s, (w + sweep) * s);
  ctx.lineTo(0.09 * s, (w - 0.02) * s);
  ctx.closePath();
  // Tailplane.
  const ty = o.tail - (o.tailFromEnd ?? 0.24);
  const ts = o.tailSpan ?? 0.44;
  ctx.moveTo(-0.08 * s, ty * s);
  ctx.lineTo(-ts * s, (ty + 0.23) * s);
  ctx.lineTo(-(ts - 0.07) * s, (ty + 0.27) * s);
  ctx.lineTo(-0.08 * s, (ty + 0.12) * s);
  ctx.lineTo(0.08 * s, (ty + 0.12) * s);
  ctx.lineTo((ts - 0.07) * s, (ty + 0.27) * s);
  ctx.lineTo(ts * s, (ty + 0.23) * s);
  ctx.lineTo(0.08 * s, ty * s);
  ctx.closePath();
}

/** Fill the traced jet body, then add engine nacelles at the given |x| offsets. */
function fillAndEngines(
  ctx: CanvasRenderingContext2D,
  s: number,
  color: RGB,
  alpha: number,
  xs: number[],
  y = 0.24,
  rx = 0.07,
  ry = 0.13,
): void {
  for (const ex of xs) {
    for (const sign of [-1, 1]) {
      ctx.moveTo(sign * ex * s + rx * s, y * s);
      ctx.ellipse(sign * ex * s, y * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = col(color, Math.min(1, alpha * 1.08));
  ctx.fill();
}

/** Tanker's refuelling boom trailing from the tail, with its small V of ruddevators. */
function boom(
  ctx: CanvasRenderingContext2D,
  s: number,
  color: RGB,
  alpha: number,
  fromY: number,
): void {
  const end = fromY + 0.55;
  const vy = end - 0.14;
  ctx.save();
  ctx.strokeStyle = col(color, Math.min(1, alpha * 1.08));
  ctx.lineWidth = Math.max(1, 0.06 * s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, fromY * s);
  ctx.lineTo(0, end * s);
  ctx.moveTo(-0.17 * s, (vy + 0.09) * s);
  ctx.lineTo(0, vy * s);
  ctx.lineTo(0.17 * s, (vy + 0.09) * s);
  ctx.stroke();
  ctx.restore();
}

/** Fast jet: pointed nose, cropped-delta wings, small tailplanes. */
function fighterBody(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -1.15 * s);
  ctx.lineTo(0.1 * s, -0.62 * s);
  ctx.lineTo(0.12 * s, 0.9 * s);
  ctx.lineTo(-0.12 * s, 0.9 * s);
  ctx.lineTo(-0.1 * s, -0.62 * s);
  ctx.closePath();
  mirroredPoly(ctx, s, [[0.1, -0.3], [0.74, 0.3], [0.74, 0.42], [0.11, 0.42]]);
  mirroredPoly(ctx, s, [[0.12, 0.6], [0.44, 0.82], [0.44, 0.92], [0.12, 0.86]]);
}

/** Trace a right-side polygon and its left mirror, wound the same way so the
 *  nonzero fill doesn't punch holes where they meet the fuselage. */
function mirroredPoly(ctx: CanvasRenderingContext2D, s: number, pts: [number, number][]): void {
  for (const side of [1, -1]) {
    const ring = side === 1 ? pts : [...pts].reverse();
    ctx.moveTo(side * ring[0][0] * s, ring[0][1] * s);
    for (const [x, y] of ring.slice(1)) ctx.lineTo(side * x * s, y * s);
    ctx.closePath();
  }
}

/** Small high-wing single (Cessna-like). */
function lightBody(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.roundRect(-0.11 * s, -0.85 * s, 0.22 * s, 1.7 * s, 0.11 * s);
  // Straight high wings.
  ctx.moveTo(-0.1 * s, -0.34 * s);
  ctx.lineTo(-1.0 * s, -0.18 * s);
  ctx.lineTo(-1.0 * s, -0.02 * s);
  ctx.lineTo(-0.1 * s, -0.08 * s);
  ctx.lineTo(0.1 * s, -0.08 * s);
  ctx.lineTo(1.0 * s, -0.02 * s);
  ctx.lineTo(1.0 * s, -0.18 * s);
  ctx.lineTo(0.1 * s, -0.34 * s);
  ctx.closePath();
  // Tailplane.
  ctx.moveTo(-0.09 * s, 0.6 * s);
  ctx.lineTo(-0.42 * s, 0.78 * s);
  ctx.lineTo(-0.42 * s, 0.88 * s);
  ctx.lineTo(-0.09 * s, 0.74 * s);
  ctx.lineTo(0.09 * s, 0.74 * s);
  ctx.lineTo(0.42 * s, 0.88 * s);
  ctx.lineTo(0.42 * s, 0.78 * s);
  ctx.lineTo(0.09 * s, 0.6 * s);
  ctx.closePath();
}

/** Sailplane: slender fuselage + very long, thin, high-aspect-ratio wings + T-tail. */
function gliderBody(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  // Slender fuselage, pointed nose.
  ctx.roundRect(-0.07 * s, -0.92 * s, 0.14 * s, 1.7 * s, 0.07 * s);
  // Long, thin, near-straight wings (high aspect ratio).
  ctx.moveTo(-0.06 * s, -0.18 * s);
  ctx.lineTo(-1.55 * s, -0.02 * s);
  ctx.lineTo(-1.55 * s, 0.05 * s);
  ctx.lineTo(-0.06 * s, 0.02 * s);
  ctx.lineTo(0.06 * s, 0.02 * s);
  ctx.lineTo(1.55 * s, 0.05 * s);
  ctx.lineTo(1.55 * s, -0.02 * s);
  ctx.lineTo(0.06 * s, -0.18 * s);
  ctx.closePath();
  // T-tail: horizontal stabilizer carried high at the tail.
  ctx.moveTo(-0.06 * s, 0.66 * s);
  ctx.lineTo(-0.38 * s, 0.72 * s);
  ctx.lineTo(-0.38 * s, 0.8 * s);
  ctx.lineTo(-0.06 * s, 0.76 * s);
  ctx.lineTo(0.06 * s, 0.76 * s);
  ctx.lineTo(0.38 * s, 0.8 * s);
  ctx.lineTo(0.38 * s, 0.72 * s);
  ctx.lineTo(0.06 * s, 0.66 * s);
  ctx.closePath();
}

/** Helicopter: teardrop cabin + tail boom + tail-rotor pylon. */
function heliBody(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  // Cabin (rounded, nose up).
  ctx.ellipse(0, -0.15 * s, 0.34 * s, 0.55 * s, 0, 0, Math.PI * 2);
  // Tail boom.
  ctx.moveTo(-0.07 * s, 0.3 * s);
  ctx.lineTo(-0.05 * s, 1.12 * s);
  ctx.lineTo(0.05 * s, 1.12 * s);
  ctx.lineTo(0.07 * s, 0.3 * s);
  ctx.closePath();
  // Tail fin.
  ctx.moveTo(-0.05 * s, 1.0 * s);
  ctx.lineTo(-0.22 * s, 1.22 * s);
  ctx.lineTo(-0.05 * s, 1.22 * s);
  ctx.closePath();
}

/** Quadcopter body: small hull with a nose point so the heading reads. */
function droneBody(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.roundRect(-0.2 * s, -0.24 * s, 0.4 * s, 0.48 * s, 0.1 * s);
  ctx.moveTo(-0.1 * s, -0.24 * s);
  ctx.lineTo(0, -0.42 * s);
  ctx.lineTo(0.1 * s, -0.24 * s);
  ctx.closePath();
}

/** The quadcopter's X of arms out to the rotors. */
function droneArms(ctx: CanvasRenderingContext2D, s: number, color: RGB, alpha: number): void {
  ctx.save();
  ctx.strokeStyle = col(color, Math.min(1, alpha * 1.08));
  ctx.lineWidth = Math.max(1, 0.09 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-0.62 * s, -0.62 * s);
  ctx.lineTo(0.62 * s, 0.62 * s);
  ctx.moveTo(0.62 * s, -0.62 * s);
  ctx.lineTo(-0.62 * s, 0.62 * s);
  ctx.stroke();
  ctx.restore();
}

/** A spinning propeller / small rotor disc. */
function propDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: RGB,
  alpha: number,
  spin: number,
  hub = true,
  blades = 4,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.globalAlpha = 1;
  // Faint disc (motion blur).
  ctx.fillStyle = col(color, 0.14 * alpha);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Blades.
  ctx.strokeStyle = col(color, 0.7 * alpha);
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.lineCap = "round";
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  if (hub) {
    ctx.fillStyle = col([255, 255, 255], 0.7 * alpha);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Large two-blade main rotor over the helicopter body. */
function mainRotor(
  ctx: CanvasRenderingContext2D,
  s: number,
  color: RGB,
  alpha: number,
  spin: number,
): void {
  const r = 1.15 * s;
  ctx.save();
  ctx.translate(0, -0.15 * s);
  ctx.rotate(spin);
  // Disc blur.
  ctx.fillStyle = col(color, 0.08 * alpha);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Two blades.
  ctx.strokeStyle = col(color, 0.55 * alpha);
  ctx.lineWidth = Math.max(1.2, r * 0.06);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  // Hub.
  ctx.fillStyle = col([255, 255, 255], 0.85 * alpha);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function core(ctx: CanvasRenderingContext2D, s: number, alpha: number, r: number): void {
  ctx.shadowBlur = 0;
  ctx.fillStyle = col([255, 255, 255], 0.75 * alpha);
  ctx.beginPath();
  ctx.arc(0, 0, s * r, 0, Math.PI * 2);
  ctx.fill();
}
