#!/usr/bin/env node
// Generates src/theme/scales.css from a small set of calibration anchors.
// Dependency-free: implements OKLab/OKLCH <-> sRGB conversion directly
// (Björn Ottosson's OKLab, https://bottosson.github.io/posts/oklab/).
//
// Run manually with `node scripts/generate-color-scales.mjs` (or `pnpm gen:colors`)
// whenever a base hue is deliberately retuned. Not part of the build — output is
// committed like any other source file.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "src", "theme", "scales.css");

// ---------- sRGB <-> linear sRGB ----------

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

// ---------- hex <-> linear RGB ----------

function hexToLinearRgb(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function linearRgbToHex([r, g, b]) {
  const toByte = (c) => {
    const v = Math.round(linearToSrgb(c) * 255);
    return Math.min(255, Math.max(0, v));
  };
  const hx = (n) => n.toString(16).padStart(2, "0");
  return `#${hx(toByte(r))}${hx(toByte(g))}${hx(toByte(b))}`;
}

// ---------- linear RGB <-> OKLab ----------

function linearRgbToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToLinearRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// ---------- OKLab <-> OKLCH ----------

function oklabToOklch([L, a, b]) {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

function oklchToOklab([L, C, H]) {
  const rad = (H * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

function hexToOklch(hex) {
  return oklabToOklch(linearRgbToOklab(hexToLinearRgb(hex)));
}

function oklchToHex([L, C, H]) {
  return linearRgbToHex(oklabToLinearRgb(oklchToOklab([L, C, H])));
}

// ---------- curve helpers ----------

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Interpolate a value across `steps` (1-indexed) given a list of {step, value}
// anchors (sorted ascending by step), smoothstep-eased between each pair, and
// linearly extrapolated past the first/last anchor.
function buildCurve(steps, anchors) {
  const sorted = [...anchors].sort((a, b) => a.step - b.step);
  const out = [];
  for (let step = 1; step <= steps; step++) {
    if (step <= sorted[0].step) {
      out.push(sorted[0].value);
      continue;
    }
    if (step >= sorted[sorted.length - 1].step) {
      out.push(sorted[sorted.length - 1].value);
      continue;
    }
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (step >= sorted[i].step && step <= sorted[i + 1].step) {
        lo = sorted[i];
        hi = sorted[i + 1];
        break;
      }
    }
    const t = (step - lo.step) / (hi.step - lo.step);
    out.push(lo.value + (hi.value - lo.value) * smoothstep(t));
  }
  return out;
}

function avg(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------- dark-mode calibration anchors (today's live hex values) ----------

const DARK_ANCHORS = {
  bgPrimary: "#1c1c1e", // gray step 1
  bgSecondary: "#2c2c2e", // gray step 2
  bgTertiary: "#3a3a3c", // gray step 3
  border: "#38383a", // gray step ~6 (reference only, see note below)
  textSecondary: "#98989d", // gray step 11
  textPrimary: "#f5f5f7", // gray step 12
  accent: "#5e9eff", // blue step 9
  accentHover: "#7ab1ff", // blue step 10
  warmAccent: "#ff6f91", // warm (coral-pink) step 9 - QiuQiu accent
  warmAccentHover: "#ff8aa8", // warm step 10
  violetAccent: "#bf5af2", // violet step 9 - memory/insight surfaces
  danger: "#ff453a",
  warning: "#ff9f0a",
  success: "#34c759",
};

// Note on `border`: today's #38383a sits *darker* than bgTertiary (#3a3a3c),
// i.e. the 5 legacy flat colors don't already form a monotonic ramp - it was
// never a designed "step" to begin with. A real 12-step scale must be
// monotonically increasing in lightness (dark mode), so border is NOT used
// as a calibration anchor for the curve; it's left as a reference value only,
// logged below for comparison against wherever gray-6 naturally lands.

const anchorOklch = Object.fromEntries(
  Object.entries(DARK_ANCHORS).map(([name, hex]) => [name, hexToOklch(hex)]),
);

// ---------- gray scale ----------

const grayHueDark = avg(
  ["bgPrimary", "bgSecondary", "bgTertiary", "textSecondary", "textPrimary"].map(
    (k) => anchorOklch[k][2],
  ),
);
const grayChromaDark = avg(
  ["bgPrimary", "bgSecondary", "bgTertiary", "textSecondary", "textPrimary"].map(
    (k) => anchorOklch[k][1],
  ),
);

function chromaTaper(step, steps, base) {
  // Low chroma at the extremes (near-black bg, near-white text), fuller
  // in the middle where borders/UI-element fills live - avoids the muddy
  // "flat chroma ramp" look of naive HSL interpolation.
  const t = (step - 1) / (steps - 1);
  const mult = 0.55 + 0.45 * Math.sin(Math.PI * t);
  return base * (0.7 + 0.6 * mult);
}

function buildGrayScale({ lAnchors, hue, chromaBase, steps = 12 }) {
  const lCurve = buildCurve(steps, lAnchors);
  return lCurve.map((L, i) => {
    const step = i + 1;
    const C = chromaTaper(step, steps, chromaBase);
    return oklchToHex([L, C, hue]);
  });
}

const grayDark = buildGrayScale({
  lAnchors: [
    { step: 1, value: anchorOklch.bgPrimary[0] },
    { step: 2, value: anchorOklch.bgSecondary[0] },
    { step: 3, value: anchorOklch.bgTertiary[0] },
    { step: 11, value: anchorOklch.textSecondary[0] },
    { step: 12, value: anchorOklch.textPrimary[0] },
  ],
  hue: grayHueDark,
  chromaBase: grayChromaDark,
});

// Light mode has no historical anchor (this app has only ever shipped dark).
// Same hue/chroma family, lightness direction inverted: step 1 = near-white
// app bg, step 12 = near-black high-contrast text.
const grayLight = buildGrayScale({
  lAnchors: [
    { step: 1, value: 0.985 },
    { step: 2, value: 0.965 },
    { step: 3, value: 0.93 },
    { step: 11, value: 0.42 },
    { step: 12, value: 0.19 },
  ],
  hue: grayHueDark,
  chromaBase: grayChromaDark * 1.3, // light neutrals read as slightly flat/gray at dark-mode chroma levels; nudge up a touch
});

// ---------- blue accent scale ----------

const blueHue = avg([anchorOklch.accent[2], anchorOklch.accentHover[2]]);

function buildAccentScale({ lAnchors, cAnchors, hue, steps = 12 }) {
  const lCurve = buildCurve(steps, lAnchors);
  const cCurve = buildCurve(steps, cAnchors);
  return lCurve.map((L, i) => oklchToHex([L, cCurve[i], hue]));
}

const blueDark = buildAccentScale({
  lAnchors: [
    { step: 1, value: 0.22 },
    { step: 9, value: anchorOklch.accent[0] },
    { step: 10, value: anchorOklch.accentHover[0] },
    { step: 12, value: 0.92 },
  ],
  cAnchors: [
    { step: 1, value: anchorOklch.accent[1] * 0.25 },
    { step: 9, value: anchorOklch.accent[1] },
    { step: 10, value: anchorOklch.accentHover[1] },
    { step: 12, value: anchorOklch.accent[1] * 0.35 },
  ],
  hue: blueHue,
});

const blueLight = buildAccentScale({
  lAnchors: [
    { step: 1, value: 0.97 },
    // solid step pulled a bit darker than the dark-mode anchor so white
    // button/bubble text keeps comfortable contrast against a light page
    { step: 9, value: anchorOklch.accent[0] - 0.08 },
    { step: 10, value: anchorOklch.accentHover[0] - 0.08 },
    { step: 12, value: 0.3 },
  ],
  cAnchors: [
    { step: 1, value: anchorOklch.accent[1] * 0.3 },
    { step: 9, value: anchorOklch.accent[1] * 1.05 },
    { step: 10, value: anchorOklch.accentHover[1] * 1.05 },
    { step: 12, value: anchorOklch.accent[1] * 0.6 },
  ],
  hue: blueHue,
});

// ---------- warm accent scale (QiuQiu coral-pink) ----------

const warmHue = avg([anchorOklch.warmAccent[2], anchorOklch.warmAccentHover[2]]);

const warmDark = buildAccentScale({
  lAnchors: [
    { step: 1, value: 0.22 },
    { step: 9, value: anchorOklch.warmAccent[0] },
    { step: 10, value: anchorOklch.warmAccentHover[0] },
    { step: 12, value: 0.92 },
  ],
  cAnchors: [
    { step: 1, value: anchorOklch.warmAccent[1] * 0.25 },
    { step: 9, value: anchorOklch.warmAccent[1] },
    { step: 10, value: anchorOklch.warmAccentHover[1] },
    { step: 12, value: anchorOklch.warmAccent[1] * 0.35 },
  ],
  hue: warmHue,
});

const warmLight = buildAccentScale({
  lAnchors: [
    { step: 1, value: 0.97 },
    { step: 9, value: anchorOklch.warmAccent[0] - 0.1 },
    { step: 10, value: anchorOklch.warmAccentHover[0] - 0.1 },
    { step: 12, value: 0.3 },
  ],
  cAnchors: [
    { step: 1, value: anchorOklch.warmAccent[1] * 0.3 },
    { step: 9, value: anchorOklch.warmAccent[1] * 1.05 },
    { step: 10, value: anchorOklch.warmAccentHover[1] * 1.05 },
    { step: 12, value: anchorOklch.warmAccent[1] * 0.6 },
  ],
  hue: warmHue,
});

// ---------- violet accent scale (memory/insight surfaces) ----------

const violetHue = anchorOklch.violetAccent[2];

const violetDark = buildAccentScale({
  lAnchors: [
    { step: 1, value: 0.22 },
    { step: 9, value: anchorOklch.violetAccent[0] },
    { step: 10, value: anchorOklch.violetAccent[0] + 0.05 },
    { step: 12, value: 0.92 },
  ],
  cAnchors: [
    { step: 1, value: anchorOklch.violetAccent[1] * 0.25 },
    { step: 9, value: anchorOklch.violetAccent[1] },
    { step: 10, value: anchorOklch.violetAccent[1] * 0.92 },
    { step: 12, value: anchorOklch.violetAccent[1] * 0.35 },
  ],
  hue: violetHue,
});

const violetLight = buildAccentScale({
  lAnchors: [
    { step: 1, value: 0.97 },
    { step: 9, value: anchorOklch.violetAccent[0] - 0.08 },
    { step: 10, value: anchorOklch.violetAccent[0] - 0.03 },
    { step: 12, value: 0.3 },
  ],
  cAnchors: [
    { step: 1, value: anchorOklch.violetAccent[1] * 0.3 },
    { step: 9, value: anchorOklch.violetAccent[1] * 1.05 },
    { step: 10, value: anchorOklch.violetAccent[1] * 0.95 },
    { step: 12, value: anchorOklch.violetAccent[1] * 0.6 },
  ],
  hue: violetHue,
});

// ---------- status colors (single "solid" step each, dark + light) ----------

function statusPair(name) {
  const [L, C, H] = anchorOklch[name];
  const dark = oklchToHex([L, C, H]);
  // Light-mode variant: same hue/chroma methodology, nudged darker for
  // contrast against a light background (mirrors the blue-9 treatment above).
  const light = oklchToHex([Math.max(0, L - 0.06), C * 1.05, H]);
  return { dark, light };
}

const danger = statusPair("danger");
const warning = statusPair("warning");
const success = statusPair("success");

// ---------- sanity log ----------

console.log("Calibration anchors (dark, hex -> OKLCH):");
for (const [name, hex] of Object.entries(DARK_ANCHORS)) {
  const [L, C, H] = anchorOklch[name];
  console.log(`  ${name.padEnd(14)} ${hex}  L=${L.toFixed(3)} C=${C.toFixed(3)} H=${H.toFixed(1)}`);
}
console.log("\nGray dark scale (steps 1-3 and 11-12 should closely match the anchors above):");
grayDark.forEach((hex, i) => console.log(`  gray-${i + 1}: ${hex}`));
console.log(
  `  (reference only, not fit to: border anchor ${DARK_ANCHORS.border} vs generated gray-6 ${grayDark[5]})`,
);
console.log("\nBlue dark scale (steps 9-10 should closely match accent/accent-hover):");
blueDark.forEach((hex, i) => console.log(`  blue-${i + 1}: ${hex}`));
console.log(
  `\nStatus (dark / light): danger ${danger.dark} / ${danger.light}, warning ${warning.dark} / ${warning.light}, success ${success.dark} / ${success.light}`,
);

// ---------- emit CSS ----------

function scaleVars(prefix, hexes) {
  return hexes.map((hex, i) => `  --${prefix}-${i + 1}: ${hex};`).join("\n");
}

const css = `/* Generated by scripts/generate-color-scales.mjs - do not hand-edit. */
/* OKLCH-derived 12-step scales (gray, blue, warm, violet) + status colors.  */
/* Dark values live in the bare :root so the app still renders correctly   */
/* (today's familiar look) even if the pre-paint theme script never runs.  */

:root {
${scaleVars("gray", grayDark)}

${scaleVars("blue", blueDark)}

${scaleVars("warm", warmDark)}

${scaleVars("violet", violetDark)}

  --red-9: ${danger.dark};
  --amber-9: ${warning.dark};
  --green-9: ${success.dark};
}

:root[data-theme="light"] {
${scaleVars("gray", grayLight)}

${scaleVars("blue", blueLight)}

${scaleVars("warm", warmLight)}

${scaleVars("violet", violetLight)}

  --red-9: ${danger.light};
  --amber-9: ${warning.light};
  --green-9: ${success.light};
}
`;

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, css, "utf-8");
console.log(`\nWrote ${OUT_PATH}`);
