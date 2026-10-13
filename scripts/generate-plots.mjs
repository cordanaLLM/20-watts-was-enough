import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateLayoutStudy } from "../experiments/workstation/fixture-012/generator.mjs";
import { fixture026RsdT02InitializationId } from "../experiments/workstation/fixture-026/rsd-t02-generator.mjs";
import { fixture026RsdT02OpaqueStatePermutation } from "../experiments/workstation/fixture-026/rsd-t02-models.mjs";
import {
  fixture026RsdT02InverseNormal,
  fixture026RsdT02PlannedCountForRetention,
} from "../experiments/workstation/fixture-026/rsd-t02-power-plan.mjs";
import {
  calibrateFixture026RsdT02PilotTranscripts,
} from "../experiments/workstation/fixture-026/rsd-t02-pilot-transcript-calibration.mjs";
import { constructFixture026RsdT02SkippingCell } from "../experiments/workstation/fixture-026/rsd-t02-pulse.mjs";
import { summarizeFixture026RsdT02FamilyCoverage } from "../experiments/workstation/fixture-026/rsd-t02-system-family-generator.mjs";
import { stripHtmlTagSyntax } from "./lib/plain-text.mjs";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const specs = JSON.parse(
  await readFile(path.join(root, "assets", "plots", "core-models.json"), "utf8"),
);
const outputDirectory = path.join(root, "public", "plots");
if (!checkOnly) await mkdir(outputDirectory, { recursive: true });

const W = 1100;
const H = 660;
const plot = { left: 112, right: 1040, top: 150, bottom: 556 };
const colors = {
  background: "#101c18",
  panel: "#14251f",
  grid: "#315047",
  text: "#fffaf0",
  muted: "#aabbb4",
  green: "#36d399",
  cyan: "#45b7d1",
  amber: "#ffb04a",
  coral: "#ff6b6b",
  violet: "#a78bfa",
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sx(value, min, max) {
  return plot.left + ((value - min) / (max - min)) * (plot.right - plot.left);
}

function sy(value, min, max) {
  return plot.bottom - ((value - min) / (max - min)) * (plot.bottom - plot.top);
}

function logScale(value, min, max) {
  return sx(Math.log10(value), Math.log10(min), Math.log10(max));
}

function linePath(points) {
  return points
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

function frame(spec, content, {
  xLabel,
  yLabel,
  legend = "",
  badge = "MATHEMATICAL MODEL · ILLUSTRATIVE",
  footer = "No measurements · assumptions in assets/plots/core-models.json",
}) {
  const badgeWidth = Math.min(W - 72, Math.max(272, Math.ceil(32 + badge.length * 9.4)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(spec.title)}</title>
  <desc id="desc">${esc(spec.status)}</desc>
  <rect width="${W}" height="${H}" rx="24" fill="${colors.background}"/>
  <rect x="36" y="30" width="${badgeWidth}" height="30" rx="15" fill="#203b31" stroke="#3f6b5b"/>
  <text x="52" y="50" fill="${colors.green}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700" letter-spacing="1.2">${esc(badge)}</text>
  <text x="54" y="94" fill="${colors.text}" font-family="Georgia, serif" font-size="32" font-weight="700">${esc(spec.title)}</text>
  <text x="54" y="123" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="14">${esc(spec.equation)}</text>
  <rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" rx="8" fill="${colors.panel}" stroke="#315047"/>
  ${content}
  <text x="${(plot.left + plot.right) / 2}" y="617" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" text-anchor="middle">${esc(xLabel)}</text>
  <text x="28" y="${(plot.top + plot.bottom) / 2}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" text-anchor="middle" transform="rotate(-90 28 ${(plot.top + plot.bottom) / 2})">${esc(yLabel)}</text>
${legend ? `  ${legend}\n` : ""}  <text x="1040" y="638" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="11" text-anchor="end">${esc(footer)}</text>
</svg>`;
}

function grid(xTicks, yTicks, xMap, yMap, xFormat = String, yFormat = String) {
  const vertical = xTicks
    .map((tick) => {
      const x = xMap(tick);
      return `<line x1="${x}" y1="${plot.top}" x2="${x}" y2="${plot.bottom}" stroke="${colors.grid}" stroke-width="1" opacity=".7"/><text x="${x}" y="580" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="middle">${esc(xFormat(tick))}</text>`;
    })
    .join("");
  const horizontal = yTicks
    .map((tick) => {
      const y = yMap(tick);
      return `<line x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}" stroke="${colors.grid}" stroke-width="1" opacity=".7"/><text x="96" y="${y + 4}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="end">${esc(yFormat(tick))}</text>`;
    })
    .join("");
  return vertical + horizontal;
}

function finiteError(spec) {
  const { epsilon_min: min, epsilon_max: max, samples } = spec.parameters;
  const h = (epsilon) =>
    epsilon === 0 || epsilon === 1
      ? 0
      : -epsilon * Math.log(epsilon) - (1 - epsilon) * Math.log(1 - epsilon);
  const values = Array.from({ length: samples }, (_, index) => {
    const epsilon = min + (index / (samples - 1)) * (max - min);
    return [sx(epsilon, min, max), sy(Math.log(2) - h(epsilon), 0, Math.log(2))];
  });
  const area = `${linePath(values)} L${plot.right},${plot.bottom} L${plot.left},${plot.bottom} Z`;
  const content = `${grid(
    [0, 0.1, 0.2, 0.3, 0.4, 0.5],
    [0, 0.2, 0.4, 0.6],
    (value) => sx(value, min, max),
    (value) => sy(value, 0, Math.log(2)),
    (value) => value.toFixed(1),
    (value) => value.toFixed(1),
  )}<path d="${area}" fill="url(#finiteFill)" opacity=".7"/><path d="${linePath(values)}" fill="none" stroke="${colors.amber}" stroke-width="5" stroke-linecap="round"/>
  <defs><linearGradient id="finiteFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.amber}" stop-opacity=".8"/><stop offset="1" stop-color="${colors.amber}" stop-opacity=".05"/></linearGradient></defs>
  <circle cx="${plot.left}" cy="${sy(Math.log(2), 0, Math.log(2))}" r="7" fill="${colors.coral}"/><text x="${plot.left + 16}" y="${plot.top + 22}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="14">zero-error binary reset: ln 2</text>
  <circle cx="${plot.right}" cy="${plot.bottom}" r="7" fill="${colors.cyan}"/><text x="${plot.right - 16}" y="${plot.bottom - 18}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="end">maximal tolerated error: bound tends to zero</text>`;
  return frame(spec, content, {
    xLabel: "allowed error epsilon (probability)",
    yLabel: "normalized lower bound E / (k_B T)",
  });
}

function adiabatic(spec) {
  const { x_min: min, x_max: max, gamma, leakage, overhead, samples } = spec.parameters;
  const palette = [colors.cyan, colors.green, colors.amber, colors.coral];
  const curves = leakage.map((ell, curveIndex) => {
    const raw = Array.from({ length: samples }, (_, index) => {
      const logX = Math.log10(min) + (index / (samples - 1)) * (Math.log10(max) - Math.log10(min));
      const x = 10 ** logX;
      const energy = gamma / x + ell * x + overhead;
      return [logScale(x, min, max), sy(Math.min(1.2, energy), 0, 1.2)];
    });
    return `<path d="${linePath(raw)}" fill="none" stroke="${palette[curveIndex]}" stroke-width="4"/>`;
  });
  const referenceY = sy(1, 0, 1.2);
  const legend = leakage
    .map((ell, index) => `<circle cx="${748 + index * 75}" cy="48" r="5" fill="${palette[index]}"/><text x="${758 + index * 75}" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">ell=${ell.toExponential(0)}</text>`)
    .join("");
  const content = `${grid(
    [1, 10, 100, 1000, 10000],
    [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2],
    (value) => logScale(value, min, max),
    (value) => sy(value, 0, 1.2),
    (value) => `10^${Math.log10(value)}`,
    (value) => value.toFixed(1),
  )}<line x1="${plot.left}" y1="${referenceY}" x2="${plot.right}" y2="${referenceY}" stroke="${colors.violet}" stroke-width="2" stroke-dasharray="10 8"/><text x="${plot.right - 10}" y="${referenceY - 10}" fill="${colors.violet}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="end">normalized ordinary reference</text>${curves.join("")}`;
  return frame(spec, content, {
    xLabel: "transition time x = tau / (RC), logarithmic",
    yLabel: "normalized transition energy E / (CV^2)",
    legend,
  });
}

function heatColor(value) {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped < 0) {
    const t = clamped + 1;
    return `rgb(${Math.round(31 + 27 * t)},${Math.round(112 + 99 * t)},${Math.round(86 + 55 * t)})`;
  }
  return `rgb(${Math.round(255 - 28 * value)},${Math.round(176 - 112 * value)},${Math.round(74 - 26 * value)})`;
}

function sparseBreakEven(spec) {
  const { gain_min: xMin, gain_max: xMax, overhead_min: yMin, overhead_max: yMax, cells } = spec.parameters;
  const cellWidth = (plot.right - plot.left) / cells;
  const cellHeight = (plot.bottom - plot.top) / cells;
  const rectangles = [];
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const gain = xMin + ((column + 0.5) / cells) * (xMax - xMin);
      const overhead = yMax - ((row + 0.5) / cells) * (yMax - yMin);
      const net = (overhead - gain) / (xMax - xMin);
      rectangles.push(`<rect x="${plot.left + column * cellWidth}" y="${plot.top + row * cellHeight}" width="${cellWidth + 0.5}" height="${cellHeight + 0.5}" fill="${heatColor(net)}"/>`);
    }
  }
  const content = `${rectangles.join("")}${grid(
    [0, 0.2, 0.4, 0.6, 0.8],
    [0, 0.2, 0.4, 0.6, 0.8],
    (value) => sx(value, xMin, xMax),
    (value) => sy(value, yMin, yMax),
    (value) => value.toFixed(1),
    (value) => value.toFixed(1),
  )}<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.top}" stroke="${colors.text}" stroke-width="4" stroke-dasharray="12 8"/><text x="${plot.left + 28}" y="${plot.top + 38}" fill="${colors.coral}" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700">NET ENERGY LOSS</text><text x="${plot.right - 28}" y="${plot.bottom - 28}" fill="${colors.green}" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" text-anchor="end">NET ENERGY GAIN</text><text x="${plot.right - 20}" y="${plot.top + 28}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="end">break-even: overhead = avoided work</text>`;
  return frame(spec, content, {
    xLabel: "avoided compute + movement energy / baseline energy",
    yLabel: "routing + synchronization + idle overhead / baseline energy",
  });
}

function lifecycle(spec) {
  const { initial_cost_min: xMin, initial_cost_max: xMax, saving_min: yMin, saving_max: yMax, cells, horizon_contours: contours } = spec.parameters;
  const cellWidth = (plot.right - plot.left) / cells;
  const cellHeight = (plot.bottom - plot.top) / cells;
  const rectangles = [];
  const minLogN = -4;
  const maxLogN = 6;
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const logX = Math.log10(xMin) + ((column + 0.5) / cells) * (Math.log10(xMax) - Math.log10(xMin));
      const logY = Math.log10(yMax) - ((row + 0.5) / cells) * (Math.log10(yMax) - Math.log10(yMin));
      const logN = logX - logY;
      const normalized = (logN - minLogN) / (maxLogN - minLogN);
      const hue = 164 - Math.max(0, Math.min(1, normalized)) * 124;
      rectangles.push(`<rect x="${plot.left + column * cellWidth}" y="${plot.top + row * cellHeight}" width="${cellWidth + 0.5}" height="${cellHeight + 0.5}" fill="hsl(${hue} 62% 35%)"/>`);
    }
  }
  const contourLines = contours
    .map((n, index) => {
      const logN = Math.log10(n);
      const candidates = [];
      for (let step = 0; step <= 100; step += 1) {
        const logX = Math.log10(xMin) + (step / 100) * (Math.log10(xMax) - Math.log10(xMin));
        const logY = logX - logN;
        if (logY >= Math.log10(yMin) && logY <= Math.log10(yMax)) {
          candidates.push([
            sx(logX, Math.log10(xMin), Math.log10(xMax)),
            sy(logY, Math.log10(yMin), Math.log10(yMax)),
          ]);
        }
      }
      if (candidates.length < 2) return "";
      const labelPoint = candidates[Math.floor(candidates.length * 0.7)];
      return `<path d="${linePath(candidates)}" fill="none" stroke="${colors.text}" stroke-width="${index === 1 ? 4 : 2}" stroke-dasharray="${index === 1 ? "" : "8 6"}" opacity=".9"/><text x="${labelPoint[0] + 8}" y="${labelPoint[1] - 8}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="12">N*=${n.toExponential(0)}</text>`;
    })
    .join("");
  const content = `${rectangles.join("")}${grid(
    [0.01, 0.1, 1, 10, 100, 1000],
    [0.001, 0.01, 0.1, 1, 10, 100],
    (value) => logScale(value, xMin, xMax),
    (value) => sy(Math.log10(value), Math.log10(yMin), Math.log10(yMax)),
    (value) => `10^${Math.log10(value)}`,
    (value) => `10^${Math.log10(value)}`,
  )}${contourLines}<text x="${plot.left + 22}" y="${plot.top + 34}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700">longer payback</text><text x="${plot.right - 22}" y="${plot.bottom - 24}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700" text-anchor="end">faster payback</text>`;
  return frame(spec, content, {
    xLabel: "one-time candidate burden Delta E_0 / reference energy (log)",
    yLabel: "per-event saving delta e / reference energy (log)",
  });
}

function phaseSelectivePreservation(spec) {
  const {
    strength_min: xMin,
    strength_max: xMax,
    samples,
    survival_floor: survivalFloor,
    survival_ceiling: survivalCeiling,
    survival_midpoint: survivalMidpoint,
    survival_slope: survivalSlope,
    release_floor: releaseFloor,
    release_ceiling: releaseCeiling,
    release_midpoint: releaseMidpoint,
    release_slope: releaseSlope,
  } = spec.parameters;
  const survival = (strength) => survivalFloor
    + (survivalCeiling - survivalFloor)
      / (1 + Math.exp(-survivalSlope * (strength - survivalMidpoint)));
  const release = (strength) => releaseFloor
    + (releaseCeiling - releaseFloor)
      / (1 + Math.exp(releaseSlope * (strength - releaseMidpoint)));
  const values = Array.from({ length: samples }, (_, index) => {
    const strength = xMin + (index / (samples - 1)) * (xMax - xMin);
    const survived = survival(strength);
    const released = release(strength);
    return { strength, survived, released, useful: survived * released };
  });
  const pathFor = (key) => linePath(values.map((row) => [
    sx(row.strength, xMin, xMax),
    sy(row[key], 0, 1),
  ]));
  const optimum = values.reduce((best, row) => (
    row.useful > best.useful ? row : best
  ));
  const optimumX = sx(optimum.strength, xMin, xMax);
  const optimumY = sy(optimum.useful, 0, 1);
  const noWrapper = values[0].useful;
  const noWrapperY = sy(noWrapper, 0, 1);
  const legend = `<line x1="650" y1="48" x2="676" y2="48" stroke="${colors.green}" stroke-width="4"/><text x="684" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">survive S(c)</text>
  <line x1="780" y1="48" x2="806" y2="48" stroke="${colors.cyan}" stroke-width="4" stroke-dasharray="11 6"/><text x="814" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">conditional R(c)</text>
  <line x1="910" y1="48" x2="936" y2="48" stroke="${colors.amber}" stroke-width="5"/><text x="944" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">useful A/N</text>`;
  const content = `${grid(
    [0, 2, 4, 6, 8, 10],
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    (value) => sx(value, xMin, xMax),
    (value) => sy(value, 0, 1),
    (value) => value.toFixed(0),
    (value) => value.toFixed(1),
  )}<line x1="${plot.left}" y1="${noWrapperY}" x2="${plot.right}" y2="${noWrapperY}" stroke="${colors.violet}" stroke-width="2" stroke-dasharray="9 7" opacity=".85"/>
  <text x="${plot.right - 12}" y="${noWrapperY - 10}" fill="${colors.violet}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="end">illustrative no-wrapper product</text>
  <path d="${pathFor("survived")}" fill="none" stroke="${colors.green}" stroke-width="4"/>
  <path d="${pathFor("released")}" fill="none" stroke="${colors.cyan}" stroke-width="4" stroke-dasharray="11 6"/>
  <path d="${pathFor("useful")}" fill="none" stroke="${colors.amber}" stroke-width="6"/>
  <line x1="${optimumX}" y1="${optimumY}" x2="${optimumX}" y2="${plot.bottom}" stroke="${colors.text}" stroke-width="2" stroke-dasharray="6 6"/>
  <circle cx="${optimumX}" cy="${optimumY}" r="8" fill="${colors.amber}" stroke="${colors.text}" stroke-width="3"/>
  <rect x="${Math.min(optimumX + 18, plot.right - 300)}" y="${Math.max(plot.top + 20, optimumY - 62)}" width="282" height="52" rx="9" fill="${colors.background}" fill-opacity=".96" stroke="${colors.grid}"/>
  <text x="${Math.min(optimumX + 32, plot.right - 286)}" y="${Math.max(plot.top + 44, optimumY - 38)}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800">illustrative product maximum</text>
  <text x="${Math.min(optimumX + 32, plot.right - 286)}" y="${Math.max(plot.top + 63, optimumY - 19)}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">c=${optimum.strength.toFixed(2)} · A/N=${optimum.useful.toFixed(3)}</text>`;
  return frame(spec, content, {
    xLabel: "wrapper strength c (dimensionless illustrative control)",
    yLabel: "probability or useful fraction",
    legend,
    badge: "HYPOTHETICAL RESPONSE MODEL · NO_RESULT",
    footer: "Constructed logistic factors · no biological fit, software run, or energy measurement",
  });
}

function meteringScale(spec) {
  const {
    scenarios,
    arms,
    seeds,
    opportunities_per_seed: opportunities,
    measurement_repetitions: repetitions,
    idle_observations_per_repetition: idleObservations,
    artifacts_per_observation: artifactsPerObservation,
  } = spec.parameters;
  const perEvent = artifactsPerObservation * scenarios * arms * seeds * opportunities;
  const perBlock = artifactsPerObservation * scenarios * seeds * repetitions * (arms + idleObservations);
  const reduction = perEvent / perBlock;
  const minimum = 1_000;
  const maximum = 10_000_000;
  const yMap = (value) => sy(Math.log10(value), Math.log10(minimum), Math.log10(maximum));
  const bars = [
    { x: 256, width: 260, value: perEvent, color: colors.coral, label: "per work unit", detail: "reading + review for every arm event", labelInside: true },
    { x: 648, width: 260, value: perBlock, color: colors.green, label: "paired meter blocks", detail: "arm + idle blocks, reading + review", labelInside: false },
  ];
  const content = `${grid(
    [],
    [1_000, 10_000, 100_000, 1_000_000, 10_000_000],
    (value) => value,
    yMap,
    String,
    (value) => `10^${Math.log10(value)}`,
  )}${bars.map((bar) => {
    const top = yMap(bar.value);
    const labelY = bar.labelInside ? plot.bottom - 48 : top - 62;
    const detailY = bar.labelInside ? plot.bottom - 24 : top - 40;
    const labelColor = bar.labelInside ? colors.background : colors.text;
    const detailColor = bar.labelInside ? colors.background : colors.muted;
    return `<rect x="${bar.x}" y="${top}" width="${bar.width}" height="${plot.bottom - top}" rx="10" fill="${bar.color}" opacity=".9"/>
      <text x="${bar.x + bar.width / 2}" y="${top - 18}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="22" font-weight="700" text-anchor="middle">${bar.value.toLocaleString("en-US")}</text>
      <text x="${bar.x + bar.width / 2}" y="${labelY}" fill="${labelColor}" font-family="Segoe UI, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${esc(bar.label)}</text>
      <text x="${bar.x + bar.width / 2}" y="${detailY}" fill="${detailColor}" font-family="Segoe UI, sans-serif" font-size="11" text-anchor="middle">${esc(bar.detail)}</text>`;
  }).join("")}
  <path d="M520,250 C570,215 600,215 644,250" fill="none" stroke="${colors.amber}" stroke-width="4" marker-end="url(#scaleArrow)"/>
  <defs><marker id="scaleArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${colors.amber}"/></marker></defs>
  <text x="582" y="196" fill="${colors.amber}" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700" text-anchor="middle">${Math.round(reduction).toLocaleString("en-US")}× fewer</text>
  <text x="582" y="222" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">at the same nominal 24 × 7 × 2 design</text>`;
  return frame(spec, content, {
    xLabel: "external-energy acquisition design",
    yLabel: "reading + review artifacts (logarithmic)",
    badge: "EXPERIMENT SCALE · CALCULATED",
    footer: "Configuration calculation · no runtime or energy result",
  });
}

function fixtureIdentifiability(spec) {
  const {
    observation_min: min,
    observation_max: max,
    base_noise_std: baseNoise,
    active_noise_std: activeNoise,
    samples,
  } = spec.parameters;
  const density = (value, mean, standardDeviation) => (
    Math.exp(-0.5 * ((value - mean) / standardDeviation) ** 2)
    / (standardDeviation * Math.sqrt(2 * Math.PI))
  );
  const baseSigma = Math.sqrt(1 + baseNoise ** 2);
  const yMax = 1.75;
  const series = Array.from({ length: samples }, (_, index) => (
    min + (index / (samples - 1)) * (max - min)
  ));
  const base = series.map((value) => [
    sx(value, min, max),
    sy(density(value, 0, baseSigma), 0, yMax),
  ]);
  const negative = series.map((value) => [
    sx(value, min, max),
    sy(density(value, -1, activeNoise), 0, yMax),
  ]);
  const positive = series.map((value) => [
    sx(value, min, max),
    sy(density(value, 1, activeNoise), 0, yMax),
  ]);
  const content = `${grid(
    [-2, -1, 0, 1, 2],
    [0, 0.4, 0.8, 1.2, 1.6],
    (value) => sx(value, min, max),
    (value) => sy(value, 0, yMax),
    (value) => value.toFixed(0),
    (value) => value.toFixed(1),
  )}<path d="${linePath(base)}" fill="none" stroke="${colors.amber}" stroke-width="7" opacity=".95"/>
  <path d="${linePath(base)}" fill="none" stroke="${colors.text}" stroke-width="2" stroke-dasharray="8 7" opacity=".9"/>
  <path d="${linePath(negative)}" fill="none" stroke="${colors.cyan}" stroke-width="5"/>
  <path d="${linePath(positive)}" fill="none" stroke="${colors.green}" stroke-width="5"/>
  <line x1="${sx(0, min, max)}" y1="${plot.top}" x2="${sx(0, min, max)}" y2="${plot.bottom}" stroke="${colors.muted}" stroke-width="2" stroke-dasharray="5 7"/>
  <text x="${sx(0, min, max)}" y="${plot.top + 28}" fill="${colors.amber}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" text-anchor="middle">base likelihoods coincide</text>
  <text x="${sx(-1, min, max)}" y="${plot.top + 30}" fill="${colors.cyan}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" text-anchor="middle">active z = −1</text>
  <text x="${sx(1, min, max)}" y="${plot.top + 30}" fill="${colors.green}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" text-anchor="middle">active z = +1</text>
  <rect x="702" y="500" width="316" height="38" rx="19" fill="#203b31" stroke="#3f6b5b"/>
  <text x="860" y="525" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="700" text-anchor="middle">information comes from the added operator</text>`;
  return frame(spec, content, {
    xLabel: "observation value y (normalized)",
    yLabel: "conditional likelihood density",
    badge: "IDENTIFIABILITY MODEL · ANALYTICAL",
    footer: "Fixture configuration · no empirical or superiority result",
  });
}

async function fixtureLayoutSelection(spec) {
  const { config_path: configPath, seed, study } = spec.parameters;
  const absoluteConfigPath = path.resolve(root, configPath);
  const relativeConfigPath = path.relative(root, absoluteConfigPath);
  if (relativeConfigPath.startsWith("..") || path.isAbsolute(relativeConfigPath)) {
    throw new Error(`Fixture 012 plot config escapes the repository: ${configPath}`);
  }
  const sourceConfig = JSON.parse(await readFile(absoluteConfigPath, "utf8"));
  const analyticConfig = {
    ...sourceConfig,
    process_noise_fraction: 0,
    repeat_noise_fraction: 0,
  };
  const generated = generateLayoutStudy({ seed, study, config: analyticConfig });
  const meanLatency = (rows, variant) => {
    const selected = rows.filter((row) => row.variant === variant);
    return selected.reduce((sum, row) => sum + row.latency_ns, 0) / selected.length;
  };
  const speedup = (rows) => {
    const baseline = meanLatency(rows, "baseline");
    const candidate = meanLatency(rows, "candidate");
    return {
      baseline,
      candidate,
      percent: 100 * (baseline - candidate) / baseline,
    };
  };
  const fixed = speedup(generated.fixed);
  const complete = speedup(generated.randomized);
  const rows = [
    {
      name: "Fixed favorable layout",
      detail: `layout 0 repeated · ${sourceConfig.layouts_per_study} equal-budget slots`,
      result: fixed,
      color: colors.coral,
      interpretation: "false speedup",
    },
    {
      name: "Complete layout population",
      detail: `${sourceConfig.layouts_per_study} layouts · counterbalanced order`,
      result: complete,
      color: colors.green,
      interpretation: "population null",
    },
    {
      name: "Operator-qualified parity",
      detail: "identical mature payload and budget",
      result: complete,
      color: colors.cyan,
      interpretation: "exact parity",
    },
  ];
  const axisLeft = 474;
  const axisRight = 1008;
  const xMin = 0;
  const xMax = 8;
  const xMap = (value) => axisLeft + ((value - xMin) / (xMax - xMin)) * (axisRight - axisLeft);
  const rowY = [252, 362, 472];
  const ticks = [0, 2, 4, 6, 8];
  const tickMarkup = ticks.map((tick) => {
    const x = xMap(tick);
    return `<line x1="${x}" y1="${plot.top + 44}" x2="${x}" y2="${plot.bottom - 30}" stroke="${colors.grid}" stroke-width="1" opacity=".8"/><text x="${x}" y="${plot.bottom - 6}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="middle">${tick}%</text>`;
  }).join("");
  const rowMarkup = rows.map((row, index) => {
    const y = rowY[index];
    const valueX = xMap(Math.max(xMin, Math.min(xMax, row.result.percent)));
    const percent = Math.abs(row.result.percent) < 0.0005 ? "0.00%" : `${row.result.percent.toFixed(2)}%`;
    const means = `${(row.result.baseline / 1e6).toFixed(3)} → ${(row.result.candidate / 1e6).toFixed(3)} ms`;
    return `<text x="138" y="${y - 8}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700">${esc(row.name)}</text>
      <text x="138" y="${y + 16}" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="12">${esc(row.detail)}</text>
      <line x1="${axisLeft}" y1="${y}" x2="${valueX}" y2="${y}" stroke="${row.color}" stroke-width="8" stroke-linecap="round" opacity=".65"/>
      <circle cx="${valueX}" cy="${y}" r="10" fill="${row.color}" stroke="${colors.text}" stroke-width="2"/>
      <text x="${Math.min(axisRight - 4, valueX + 18)}" y="${y - 12}" fill="${row.color}" font-family="Cascadia Mono, monospace" font-size="17" font-weight="700" text-anchor="${valueX > axisRight - 80 ? "end" : "start"}">${percent}</text>
      <text x="${Math.min(axisRight - 4, valueX + 18)}" y="${y + 18}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="${valueX > axisRight - 80 ? "end" : "start"}">${esc(means)} · ${esc(row.interpretation)}</text>`;
  }).join("");
  const content = `${tickMarkup}
  <line x1="${axisLeft}" y1="${plot.top + 36}" x2="${axisLeft}" y2="${plot.bottom - 30}" stroke="${colors.text}" stroke-width="3"/>
  <text x="${axisLeft}" y="${plot.top + 24}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700" text-anchor="middle">no speedup</text>
  ${rowMarkup}
  <rect x="138" y="${plot.bottom - 50}" width="302" height="30" rx="15" fill="#203b31" stroke="#3f6b5b"/>
  <text x="289" y="${plot.bottom - 30}" fill="${colors.amber}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" text-anchor="middle">synthetic mean latency: baseline → candidate</text>`;
  return frame(spec, content, {
    xLabel: "apparent candidate mean-latency reduction (%)",
    yLabel: "evaluation design",
    badge: "SYNTHETIC FIXTURE · ANALYTICAL",
    footer: `${configPath} · noise disabled · no measured runtime`,
  });
}

function crossPlatformReach(spec) {
  const {
    platform_a_people: platformA,
    platform_b_people: platformB,
    samples,
  } = spec.parameters;
  const smaller = Math.min(platformA, platformB);
  const summed = platformA + platformB;
  const xMap = (value) => sx(value, 0, 1);
  const yMap = (value) => sy(value, 0, summed * 1.1);
  const values = Array.from({ length: samples }, (_, index) => {
    const fraction = index / (samples - 1);
    const overlap = fraction * smaller;
    return {
      fraction,
      union: summed - overlap,
      naive: summed,
    };
  });
  const unionPath = linePath(values.map((point) => [xMap(point.fraction), yMap(point.union)]));
  const naivePath = linePath(values.map((point) => [xMap(point.fraction), yMap(point.naive)]));
  const gapArea = `${unionPath} L${xMap(1)},${yMap(summed)} L${xMap(0)},${yMap(summed)} Z`;
  const endUnion = summed - smaller;
  const endOvercount = summed / endUnion - 1;
  const content = `${grid(
    [0, 0.25, 0.5, 0.75, 1],
    [0, 500, 1000, 1500, 2000],
    xMap,
    yMap,
    (value) => `${Math.round(value * 100)}%`,
    (value) => value.toLocaleString("en-US"),
  )}<path d="${gapArea}" fill="${colors.coral}" opacity=".18"/>
  <path d="${naivePath}" fill="none" stroke="${colors.coral}" stroke-width="6" stroke-dasharray="12 8"/>
  <path d="${unionPath}" fill="none" stroke="${colors.green}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="${xMap(1)}" cy="${yMap(endUnion)}" r="9" fill="${colors.green}" stroke="${colors.text}" stroke-width="2"/>
  <text x="${xMap(0.04)}" y="${yMap(summed) - 16}" fill="${colors.coral}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700">naive sum: ${summed.toLocaleString("en-US")} accounts</text>
  <text x="${xMap(0.58)}" y="${yMap(summed - 0.58 * smaller) + 30}" fill="${colors.green}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700">set union: resolved people</text>
  <rect x="${xMap(0.60)}" y="${yMap(720)}" width="350" height="72" rx="12" fill="#203b31" stroke="#3f6b5b"/>
  <text x="${xMap(0.60) + 175}" y="${yMap(720) + 28}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="14" font-weight="700" text-anchor="middle">100% overlap → ${endUnion.toLocaleString("en-US")} people</text>
  <text x="${xMap(0.60) + 175}" y="${yMap(720) + 52}" fill="${colors.coral}" font-family="Cascadia Mono, monospace" font-size="13" text-anchor="middle">naive overcount: ${(endOvercount * 100).toFixed(0)}%</text>`;
  return frame(spec, content, {
    xLabel: "overlap as share of the smaller platform audience",
    yLabel: "reported unique reach (people)",
    badge: "SET IDENTITY · ILLUSTRATIVE",
    footer: `${platformA.toLocaleString("en-US")} + ${platformB.toLocaleString("en-US")} platform accounts · no observed audience data`,
  });
}

function spatialSupportTransfer(spec) {
  const { ratio_min: min, ratio_max: max, samples } = spec.parameters;
  const yMin = -0.3;
  const yMax = 1.05;
  const response = (ratio) => (
    ratio === 0 ? 1 : Math.sin(Math.PI * ratio) / (Math.PI * ratio)
  );
  const values = Array.from({ length: samples }, (_, index) => {
    const ratio = min + (index / (samples - 1)) * (max - min);
    const value = response(ratio);
    return { ratio, value };
  });
  const signedPath = linePath(values.map(({ ratio, value }) => [
    sx(ratio, min, max),
    sy(value, yMin, yMax),
  ]));
  const magnitudePath = linePath(values.map(({ ratio, value }) => [
    sx(ratio, min, max),
    sy(Math.abs(value), yMin, yMax),
  ]));
  const zeroY = sy(0, yMin, yMax);
  const unityX = sx(1, min, max);
  const negativeRatio = 1.43;
  const negativeX = sx(negativeRatio, min, max);
  const negativeY = sy(response(negativeRatio), yMin, yMax);
  const content = `${grid(
    [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1],
    (value) => sx(value, min, max),
    (value) => sy(value, yMin, yMax),
    (value) => value.toFixed(value % 1 === 0 ? 0 : 2),
    (value) => value.toFixed(1),
  )}<line x1="${plot.left}" y1="${zeroY}" x2="${plot.right}" y2="${zeroY}" stroke="${colors.text}" stroke-width="2" opacity=".85"/>
  <path d="${magnitudePath}" fill="none" stroke="${colors.violet}" stroke-width="3" stroke-dasharray="10 8" opacity=".95"/>
  <path d="${signedPath}" fill="none" stroke="${colors.amber}" stroke-width="7" stroke-linecap="round"/>
  <line x1="${unityX}" y1="${plot.top}" x2="${unityX}" y2="${plot.bottom}" stroke="${colors.cyan}" stroke-width="3" stroke-dasharray="7 7"/>
  <circle cx="${unityX}" cy="${zeroY}" r="9" fill="${colors.cyan}" stroke="${colors.text}" stroke-width="2"/>
  <text x="${unityX + 16}" y="${zeroY - 18}" fill="${colors.cyan}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700">support width = wavelength → zero response</text>
  <circle cx="${negativeX}" cy="${negativeY}" r="8" fill="${colors.coral}" stroke="${colors.text}" stroke-width="2"/>
  <text x="${negativeX + 16}" y="${negativeY + 32}" fill="${colors.coral}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="700">signed lobe: apparent phase reversal</text>
  <line x1="760" y1="82" x2="804" y2="82" stroke="${colors.amber}" stroke-width="6"/><text x="816" y="87" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13">signed retained amplitude H</text>
  <line x1="760" y1="110" x2="804" y2="110" stroke="${colors.violet}" stroke-width="3" stroke-dasharray="9 7"/><text x="816" y="115" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13">retained magnitude |H|</text>`;
  return frame(spec, content, {
    xLabel: "support width r / field wavelength lambda",
    yLabel: "retained sinusoidal amplitude (dimensionless)",
    badge: "CHANGE OF SUPPORT · ANALYTICAL",
    footer: "Centered box average of a sinusoid · no observed geographic data",
  });
}

function stressPathMemory(spec) {
  const {
    threshold_kpa: threshold,
    elastic_modulus_kpa: elasticModulus,
    history_modulus_kpa: historyModulus,
    high_path_kpa: highPath,
    low_path_kpa: lowPath,
  } = spec.parameters;
  const evolve = (history) => {
    let state = Math.max(history[0] - threshold, Math.min(0, history[0] + threshold));
    return history.map((stress, index) => {
      if (index > 0) {
        state = Math.min(Math.max(state, stress - threshold), stress + threshold);
      }
      return {
        stress,
        state,
        strain: (stress - state) / elasticModulus + state / historyModulus,
      };
    });
  };
  const high = evolve(highPath);
  const low = evolve(lowPath);
  const xMin = Math.min(...highPath, ...lowPath) - 0.5;
  const xMax = Math.max(...highPath, ...lowPath) + 0.5;
  const allStrains = [...high, ...low].map(({ strain }) => strain);
  const yPadding = 0.008;
  const yMin = Math.min(...allStrains) - yPadding;
  const yMax = Math.max(...allStrains) + yPadding;
  const map = ({ stress, strain }) => [sx(stress, xMin, xMax), sy(strain, yMin, yMax)];
  const highPoints = high.map(map);
  const lowPoints = low.map(map);
  const highEnd = high.at(-1);
  const lowEnd = low.at(-1);
  const highEndPoint = map(highEnd);
  const lowEndPoint = map(lowEnd);
  const endpointX = highEndPoint[0];
  const midpointY = (highEndPoint[1] + lowEndPoint[1]) / 2;
  const markers = (points, color) => points.map(([x, y], index) => (
    `<circle cx="${x}" cy="${y}" r="${index === points.length - 1 ? 8 : 3.5}" fill="${color}" stroke="${colors.text}" stroke-width="${index === points.length - 1 ? 2 : 0}"/>`
  )).join("");
  const content = `${grid(
    [-5, -3, -1, 1, 3, 5],
    [-0.06, -0.03, 0, 0.03, 0.06],
    (value) => sx(value, xMin, xMax),
    (value) => sy(value, yMin, yMax),
    (value) => value.toFixed(0),
    (value) => value.toFixed(2),
  )}<line x1="${plot.left}" y1="${sy(0, yMin, yMax)}" x2="${plot.right}" y2="${sy(0, yMin, yMax)}" stroke="${colors.text}" stroke-width="2" opacity=".75"/>
  <path d="${linePath(highPoints)}" fill="none" stroke="${colors.coral}" stroke-width="6" stroke-linejoin="round"/>
  <path d="${linePath(lowPoints)}" fill="none" stroke="${colors.cyan}" stroke-width="6" stroke-linejoin="round"/>
  ${markers(highPoints, colors.coral)}${markers(lowPoints, colors.cyan)}
  <line x1="${endpointX + 22}" y1="${highEndPoint[1]}" x2="${endpointX + 22}" y2="${lowEndPoint[1]}" stroke="${colors.amber}" stroke-width="4"/>
  <line x1="${endpointX + 14}" y1="${highEndPoint[1]}" x2="${endpointX + 30}" y2="${highEndPoint[1]}" stroke="${colors.amber}" stroke-width="4"/>
  <line x1="${endpointX + 14}" y1="${lowEndPoint[1]}" x2="${endpointX + 30}" y2="${lowEndPoint[1]}" stroke="${colors.amber}" stroke-width="4"/>
  <text x="${endpointX + 42}" y="${midpointY - 8}" fill="${colors.amber}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700">same final stress: ${highEnd.stress} kPa</text>
  <text x="${endpointX + 42}" y="${midpointY + 14}" fill="${colors.amber}" font-family="Cascadia Mono, monospace" font-size="12">z = ${highEnd.state.toFixed(0)} vs ${lowEnd.state.toFixed(0)} kPa</text>
  <line x1="720" y1="82" x2="764" y2="82" stroke="${colors.coral}" stroke-width="6"/><text x="778" y="87" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13">positive excursion first</text>
  <line x1="720" y1="110" x2="764" y2="110" stroke="${colors.cyan}" stroke-width="6"/><text x="778" y="115" fill="${colors.muted}" font-family="Segoe UI, sans-serif" font-size="13">negative excursion first</text>`;
  return frame(spec, content, {
    xLabel: "input stress sigma_t (kPa)",
    yLabel: "toy response strain epsilon_t (dimensionless)",
    badge: "PATH-DEPENDENCE ORACLE · ANALYTICAL",
    footer: `r=${threshold} kPa · E=${elasticModulus} kPa · H=${historyModulus} kPa · not a soil law`,
  });
}

const analyticalThemes = {
  paper: {
    background: "#f4efe3",
    panel: "#fffdf7",
    panelAlt: "#e9eee7",
    grid: "#cbd3ca",
    text: "#10281a",
    muted: "#53655a",
    primary: "#146c43",
    secondary: "#1d6f9b",
    accent: "#c26b08",
    danger: "#b83245",
  },
  ocean: {
    background: "#071b2b",
    panel: "#0d2a3e",
    panelAlt: "#12364e",
    grid: "#31566d",
    text: "#f7fbff",
    muted: "#acc7d6",
    primary: "#38d6ba",
    secondary: "#59b7ff",
    accent: "#ffc857",
    danger: "#ff6f7d",
  },
  ember: {
    background: "#24120d",
    panel: "#351c14",
    panelAlt: "#48261b",
    grid: "#704633",
    text: "#fff8ee",
    muted: "#d6b8a7",
    primary: "#ffb44c",
    secondary: "#65d6ce",
    accent: "#ff7d57",
    danger: "#ff4d68",
  },
  violet: {
    background: "#171127",
    panel: "#261b3d",
    panelAlt: "#33244f",
    grid: "#594879",
    text: "#fffaff",
    muted: "#c9bce0",
    primary: "#c4a7ff",
    secondary: "#64d8cb",
    accent: "#ffc96b",
    danger: "#ff718d",
  },
  daylight: {
    background: "#eef3ef",
    panel: "#fffdf7",
    panelAlt: "#e3ebe5",
    grid: "#c5d0c8",
    text: "#14261a",
    muted: "#55675b",
    primary: "#176e47",
    secondary: "#176b91",
    accent: "#d36c08",
    danger: "#b93449",
  },
};

function analyticalLayout(spec, fallback) {
  const configured = spec.layout ?? {};
  const width = Number(configured.width ?? fallback.width);
  const height = Number(configured.height ?? fallback.height);
  const themeName = configured.theme ?? fallback.theme;
  const theme = analyticalThemes[themeName];
  if (!theme) throw new Error(`Unknown analytical plot theme: ${themeName}`);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 640 || height < 480) {
    throw new Error(`Invalid analytical layout for ${spec.id}`);
  }
  return {
    width,
    height,
    kind: configured.kind ?? fallback.kind,
    themeName,
    theme,
  };
}

function analyticalDocument(spec, layout, content) {
  const { width, height, theme, kind, themeName } = layout;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" data-layout="${esc(kind)}" data-theme="${esc(themeName)}">
  <title id="title">${esc(spec.title)}</title>
  <desc id="desc">${esc(spec.status)}</desc>
  <rect width="${width}" height="${height}" fill="${theme.background}"/>
  ${content}
</svg>`;
}

function localScale(value, min, max, start, end) {
  return start + ((value - min) / (max - min)) * (end - start);
}

function localLogScale(value, min, max, start, end) {
  return localScale(Math.log10(value), Math.log10(min), Math.log10(max), start, end);
}

function analyticalHeader(spec, layout, {
  badge = "ANALYTICAL MODEL · ILLUSTRATIVE",
  x = 54,
  titleY = 78,
  equationY = 112,
} = {}) {
  const { theme, width } = layout;
  return `<rect x="${x}" y="26" width="${Math.min(360, badge.length * 8.2 + 34)}" height="28" rx="14" fill="${theme.panelAlt}" stroke="${theme.primary}"/>
  <text x="${x + 16}" y="45" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" letter-spacing="1.1">${esc(badge)}</text>
  <text x="${x}" y="${titleY}" fill="${theme.text}" font-family="Georgia, serif" font-size="30" font-weight="700">${esc(spec.title)}</text>
  <text x="${x}" y="${equationY}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="13">${esc(spec.equation)}</text>
  <text x="${width - 42}" y="45" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${esc(layout.kind)} · no measurements</text>`;
}

function paretoDominanceUncertainty(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 760,
    kind: "quadrant-gates",
    theme: "paper",
  });
  const { width, height, theme } = layout;
  const {
    energy_effect_min: xMin,
    energy_effect_max: xMax,
    quality_delta_min: yMin,
    quality_delta_max: yMax,
    energy_effect_margin: xMargin,
    quality_noninferiority_margin: yMargin,
    cases,
  } = spec.parameters;
  const box = { left: 92, right: 842, top: 154, bottom: height - 92 };
  const gate = { left: 884, right: width - 38, top: 154, bottom: height - 92 };
  const xMap = (value) => localScale(value, xMin, xMax, box.left, box.right);
  const yMap = (value) => localScale(value, yMin, yMax, box.bottom, box.top);
  const marginX = xMap(xMargin);
  const marginY = yMap(yMargin);
  const xTicks = [-0.3, -0.2, -0.1, 0, 0.1];
  const yTicks = [-0.05, 0, 0.05, 0.1];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 24}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${Math.round(tick * 100)}%</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 14}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(2)}</text>`),
  ].join("");
  const caseColors = {
    supported: theme.primary,
    unresolved: theme.accent,
    "gate-failure": theme.danger,
  };
  const caseMarkup = cases.map((entry) => {
    const cx = xMap(entry.energy_effect);
    const cy = yMap(entry.quality_delta);
    const rx = Math.abs(xMap(entry.energy_effect + entry.energy_radius) - cx);
    const ry = Math.abs(yMap(entry.quality_delta + entry.quality_radius) - cy);
    const color = caseColors[entry.id] ?? theme.secondary;
    const labelBelow = entry.id === "gate-failure";
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" fill-opacity=".2" stroke="${color}" stroke-width="4"/>
      <circle cx="${cx}" cy="${cy}" r="6" fill="${color}"/>
      <text x="${cx + 12}" y="${cy + (labelBelow ? 27 : -12)}" fill="${color}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="750">${esc(entry.label)}</text>`;
  }).join("");
  const gateRows = cases.map((entry, index) => {
    const color = caseColors[entry.id] ?? theme.secondary;
    const y = gate.top + 84 + index * 118;
    const gates = [entry.latency_gate, entry.risk_gate, entry.support_gate];
    return `<circle cx="${gate.left + 18}" cy="${y - 4}" r="6" fill="${color}"/>
      <text x="${gate.left + 34}" y="${y}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700">${esc(entry.label)}</text>
      ${gates.map((passed, gateIndex) => {
        const gx = gate.left + 50 + gateIndex * 72;
        return `<circle cx="${gx}" cy="${y + 34}" r="13" fill="${passed ? theme.primary : theme.danger}"/><text x="${gx}" y="${y + 39}" fill="#fff" font-family="Segoe UI Symbol, Segoe UI, sans-serif" font-size="14" font-weight="900" text-anchor="middle">${passed ? "✓" : "×"}</text>`;
      }).join("")}`;
  }).join("");
  const content = `${analyticalHeader(spec, layout, { badge: "SIMULTANEOUS DECISION REGION" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="14" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <rect x="${box.left}" y="${box.top}" width="${marginX - box.left}" height="${marginY - box.top}" fill="${theme.primary}" fill-opacity=".12"/>
  <rect x="${marginX}" y="${box.top}" width="${box.right - marginX}" height="${box.bottom - box.top}" fill="${theme.danger}" fill-opacity=".055"/>
  ${gridMarkup}
  <line x1="${marginX}" y1="${box.top}" x2="${marginX}" y2="${box.bottom}" stroke="${theme.secondary}" stroke-width="3" stroke-dasharray="9 7"/>
  <line x1="${box.left}" y1="${marginY}" x2="${box.right}" y2="${marginY}" stroke="${theme.secondary}" stroke-width="3" stroke-dasharray="9 7"/>
  <text x="${marginX - 10}" y="${box.top + 24}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="end">minimum energy effect</text>
  <text x="${box.right - 12}" y="${marginY - 10}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="end">quality non-inferiority</text>
  <text x="${box.left + 18}" y="${box.top + 28}" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="16" font-weight="800">REGION CAN SUPPORT PROMOTION</text>
  ${caseMarkup}
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">relative lifecycle-energy effect d · lower is better</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">quality difference Delta Q · higher is better</text>
  <rect x="${gate.left}" y="${gate.top}" width="${gate.right - gate.left}" height="${gate.bottom - gate.top}" rx="14" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${gate.left + 18}" y="${gate.top + 30}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">HARD GATES</text>
  <text x="${gate.left + 50}" y="${gate.top + 58}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="middle">latency</text>
  <text x="${gate.left + 122}" y="${gate.top + 58}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="middle">risk</text>
  <text x="${gate.left + 194}" y="${gate.top + 58}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="middle">support</text>
  ${gateRows}
  <text x="${gate.left + 18}" y="${gate.bottom - 22}" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700">One failed gate keeps D(p,n) = 0.</text>`;
  return analyticalDocument(spec, layout, content);
}

function activeAcquisitionFrontier(spec) {
  const layout = analyticalLayout(spec, {
    width: 1240,
    height: 720,
    kind: "frontier-ledger",
    theme: "ocean",
  });
  const { width, height, theme } = layout;
  const {
    energy_max_j: xMax,
    utility_max: yMax,
    latency_limit_s: latencyLimit,
    unsafe_probability_limit: riskLimit,
    lambda_energy_utility_per_j: lambdaEnergy,
    lambda_latency_utility_per_s: lambdaLatency,
    lambda_traffic_utility_per_byte: lambdaTraffic,
    actions,
  } = spec.parameters;
  const box = { left: 86, right: 838, top: 150, bottom: height - 92 };
  const ledger = { left: 882, right: width - 34, top: 150, bottom: height - 92 };
  const xMap = (value) => localScale(value, 0, xMax, box.left, box.right);
  const yMap = (value) => localScale(value, 0, yMax, box.bottom, box.top);
  const isFeasible = (action) => (
    action.latency_s <= latencyLimit && action.unsafe_probability <= riskLimit
  );
  const fullScore = (action) => (
    action.delta_utility
    - lambdaEnergy * action.energy_j
    - lambdaLatency * action.latency_s
    - lambdaTraffic * action.traffic_bytes
  );
  const feasible = actions.filter(isFeasible).sort((left, right) => left.energy_j - right.energy_j);
  const frontier = [];
  let bestUtility = -Infinity;
  for (const action of feasible) {
    if (action.delta_utility >= bestUtility) {
      frontier.push(action);
      bestUtility = action.delta_utility;
    }
  }
  const selected = feasible.reduce((best, action) => (
    fullScore(action) > fullScore(best) ? action : best
  ), feasible[0]);
  const xTicks = [0, 0.5, 1, 1.5, 2, 2.5];
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 24}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick.toFixed(1)}</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 13}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(1)}</text>`),
  ].join("");
  const frontierPath = linePath(frontier.map((action) => [
    xMap(action.energy_j),
    yMap(action.delta_utility),
  ]));
  const pointMarkup = actions.map((action) => {
    const feasibleAction = isFeasible(action);
    const cx = xMap(action.energy_j);
    const cy = yMap(action.delta_utility);
    const radius = 8 + Math.sqrt(action.traffic_bytes) / 4.5;
    const latencyFraction = Math.min(1, action.latency_s / latencyLimit);
    const color = feasibleAction
      ? (latencyFraction < 0.45 ? theme.primary : latencyFraction < 0.85 ? theme.secondary : theme.accent)
      : theme.danger;
    const labelOnLeft = cx > box.right - 150;
    const labelX = labelOnLeft ? cx - radius - 7 : cx + radius + 7;
    const failureMark = feasibleAction
      ? ""
      : `<line x1="${cx - radius}" y1="${cy - radius}" x2="${cx + radius}" y2="${cy + radius}" stroke="${theme.danger}" stroke-width="4"/><line x1="${cx + radius}" y1="${cy - radius}" x2="${cx - radius}" y2="${cy + radius}" stroke="${theme.danger}" stroke-width="4"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" fill-opacity="${feasibleAction ? ".82" : ".18"}" stroke="${color}" stroke-width="3"/>${failureMark}<text x="${labelX}" y="${cy + 4}" fill="${color}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" text-anchor="${labelOnLeft ? "end" : "start"}">${esc(action.label)}</text>`;
  }).join("");
  const priceEndY = yMap(lambdaEnergy * xMax);
  const ledgerRows = actions.filter((action) => action.id !== "wait").map((action, index) => {
    const y = ledger.top + 78 + index * 66;
    const feasibleAction = isFeasible(action);
    const gateText = feasibleAction ? "admissible" : action.latency_s > latencyLimit ? "latency gate" : "risk gate";
    const gateColor = feasibleAction ? theme.primary : theme.danger;
    return `<text x="${ledger.left + 18}" y="${y}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700">${esc(action.label)}</text>
      <text x="${ledger.left + 18}" y="${y + 19}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10">score ${fullScore(action).toFixed(3)} · ${action.energy_j.toFixed(2)} J · ${action.latency_s.toFixed(3)} s</text>
      <rect x="${ledger.right - 102}" y="${y - 16}" width="84" height="24" rx="12" fill="${gateColor}" fill-opacity=".2" stroke="${gateColor}"/>
      <text x="${ledger.right - 60}" y="${y + 1}" fill="${gateColor}" font-family="Segoe UI, sans-serif" font-size="10" font-weight="800" text-anchor="middle">${esc(gateText)}</text>`;
  }).join("");
  const content = `${analyticalHeader(spec, layout, { badge: "COSTED ACTION FRONTIER" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${gridMarkup}
  <path d="${frontierPath}" fill="none" stroke="${theme.primary}" stroke-width="5" stroke-linejoin="round"/>
  <line x1="${xMap(0)}" y1="${yMap(0)}" x2="${xMap(xMax)}" y2="${priceEndY}" stroke="${theme.accent}" stroke-width="3" stroke-dasharray="9 7"/>
  <text x="${xMap(xMax) - 12}" y="${priceEndY - 12}" fill="${theme.accent}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="end">energy-only zero-score guide</text>
  ${pointMarkup}
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">complete action energy E(a) · joules</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">expected decision-utility improvement Delta U(a)</text>
  <rect x="${ledger.left}" y="${ledger.top}" width="${ledger.right - ledger.left}" height="${ledger.bottom - ledger.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${ledger.left + 18}" y="${ledger.top + 30}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">FULL PRICE + GATES</text>
  <text x="${ledger.left + 18}" y="${ledger.top + 51}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10">point size = bytes · color = latency</text>
  ${ledgerRows}
  <rect x="${ledger.left + 16}" y="${ledger.bottom - 58}" width="${ledger.right - ledger.left - 32}" height="38" rx="8" fill="${theme.primary}" fill-opacity=".16" stroke="${theme.primary}"/>
  <text x="${(ledger.left + ledger.right) / 2}" y="${ledger.bottom - 34}" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" text-anchor="middle">illustrative selected action: ${esc(selected.label)}</text>`;
  return analyticalDocument(spec, layout, content);
}

function recoveryTimeFragility(spec) {
  const layout = analyticalLayout(spec, {
    width: 980,
    height: 760,
    kind: "threshold-curve",
    theme: "ember",
  });
  const { width, height, theme } = layout;
  const {
    gain_min: gMin,
    gain_max: gMax,
    samples,
    sample_interval_s: sampleInterval,
    remaining_fraction: remainingFraction,
    alarm_threshold_s: alarmThreshold,
    display_max_s: yMax,
  } = spec.parameters;
  const yMin = 0.5;
  const box = { left: 102, right: width - 58, top: 156, bottom: height - 86 };
  const xMap = (value) => localScale(value, gMin, gMax, box.left, box.right);
  const yMap = (value) => localLogScale(value, yMin, yMax, box.bottom, box.top);
  const recovery = (gain) => sampleInterval * Math.log(remainingFraction) / Math.log(gain);
  const values = Array.from({ length: samples }, (_, index) => {
    const gain = gMin + (index / (samples - 1)) * (gMax - gMin);
    return [xMap(gain), yMap(Math.min(yMax, recovery(gain)))];
  });
  const thresholdGain = remainingFraction ** (sampleInterval / alarmThreshold);
  const xTicks = [0.6, 0.7, 0.8, 0.9, 0.95, 0.97, 0.99];
  const yTicks = [0.5, 1, 2, 5, 10, 30, 100, 300, 1000];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 24}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick.toFixed(2)}</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 14}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick}</text>`),
  ].join("");
  const content = `${analyticalHeader(spec, layout, { badge: "LOCAL RETURN MODEL · EXACT CURVE" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="18" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <rect x="${xMap(thresholdGain)}" y="${box.top}" width="${box.right - xMap(thresholdGain)}" height="${box.bottom - box.top}" fill="${theme.danger}" fill-opacity=".13"/>
  ${gridMarkup}
  <path d="${linePath(values)}" fill="none" stroke="${theme.primary}" stroke-width="7" stroke-linecap="round"/>
  <line x1="${box.left}" y1="${yMap(alarmThreshold)}" x2="${box.right}" y2="${yMap(alarmThreshold)}" stroke="${theme.secondary}" stroke-width="3" stroke-dasharray="10 8"/>
  <line x1="${xMap(thresholdGain)}" y1="${box.top}" x2="${xMap(thresholdGain)}" y2="${box.bottom}" stroke="${theme.secondary}" stroke-width="3" stroke-dasharray="10 8"/>
  <circle cx="${xMap(thresholdGain)}" cy="${yMap(alarmThreshold)}" r="9" fill="${theme.secondary}" stroke="${theme.text}" stroke-width="2"/>
  <text x="${xMap(thresholdGain) - 14}" y="${yMap(alarmThreshold) - 15}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800" text-anchor="end">Stage-1 alarm: 10 s</text>
  <text x="${xMap(thresholdGain) + 12}" y="${box.bottom - 18}" fill="${theme.danger}" font-family="Cascadia Mono, monospace" font-size="12">g ≈ ${thresholdGain.toFixed(4)}</text>
  <text x="${box.right - 16}" y="${box.top + 28}" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800" text-anchor="end">shrinking restoring margin</text>
  <text x="${(box.left + box.right) / 2}" y="${height - 34}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">hidden return gain g · local boundary at g = 1</text>
  <text x="29" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 29 ${(box.top + box.bottom) / 2})">95% recovery time tau_95 · seconds · logarithmic</text>
  <rect x="${box.left + 24}" y="${box.top + 26}" width="292" height="68" rx="12" fill="${theme.panelAlt}" stroke="${theme.grid}"/>
  <text x="${box.left + 42}" y="${box.top + 53}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700">Same apparent operating point</text>
  <text x="${box.left + 42}" y="${box.top + 77}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="12">but progressively slower return after displacement</text>`;
  return analyticalDocument(spec, layout, content);
}

function memoryActionPriceEnvelope(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 760,
    kind: "policy-envelope",
    theme: "violet",
  });
  const { width, height, theme } = layout;
  const {
    lambda_energy_min: xMin,
    lambda_energy_max: xMax,
    samples,
    budgets,
    actions,
  } = spec.parameters;
  const yMin = -0.2;
  const yMax = 0.32;
  const box = { left: 94, right: 842, top: 154, bottom: height - 92 };
  const panel = { left: 884, right: width - 36, top: 154, bottom: height - 92 };
  const xMap = (value) => localScale(value, xMin, xMax, box.left, box.right);
  const yMap = (value) => localScale(value, yMin, yMax, box.bottom, box.top);
  const score = (action, lambda) => action.gain_loss_units - lambda * action.energy_j;
  const palette = [theme.muted, theme.secondary, theme.accent, theme.primary, "#ff93dc", theme.danger];
  const values = Array.from({ length: samples }, (_, index) => (
    xMin + (index / (samples - 1)) * (xMax - xMin)
  ));
  const actionLines = actions.map((action, index) => {
    const points = values.map((lambda) => [
      xMap(lambda),
      yMap(Math.max(yMin, Math.min(yMax, score(action, lambda)))),
    ]);
    return `<path d="${linePath(points)}" fill="none" stroke="${palette[index % palette.length]}" stroke-width="${action.admissible ? 3 : 2}" stroke-dasharray="${action.admissible ? "" : "7 7"}" opacity="${action.admissible ? ".82" : ".55"}"/>`;
  }).join("");
  const admissible = actions.filter((action) => action.admissible);
  const envelope = values.map((lambda) => {
    const winner = admissible.reduce((best, action) => (
      score(action, lambda) > score(best, lambda) ? action : best
    ), admissible[0]);
    return { lambda, winner, value: score(winner, lambda) };
  });
  const envelopePath = linePath(envelope.map(({ lambda, value }) => [
    xMap(lambda),
    yMap(value),
  ]));
  const segments = [];
  for (const point of envelope) {
    const previous = segments.at(-1);
    if (!previous || previous.winner.id !== point.winner.id) {
      segments.push({ winner: point.winner, start: point.lambda, end: point.lambda });
    } else previous.end = point.lambda;
  }
  const segmentLabels = segments.map((segment) => {
    const midpoint = (segment.start + segment.end) / 2;
    const y = score(segment.winner, midpoint);
    return `<rect x="${xMap(midpoint) - 42}" y="${yMap(y) - 28}" width="84" height="22" rx="11" fill="${theme.background}" stroke="${theme.primary}"/>
      <text x="${xMap(midpoint)}" y="${yMap(y) - 13}" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="10" font-weight="800" text-anchor="middle">${esc(segment.winner.label)}</text>`;
  }).join("");
  const xTicks = [0, 0.1, 0.2, 0.3, 0.4];
  const yTicks = [-0.2, -0.1, 0, 0.1, 0.2, 0.3];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 24}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick.toFixed(1)}</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 14}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(1)}</text>`),
  ].join("");
  const actionRows = actions.map((action, index) => {
    const y = panel.top + 68 + index * 58;
    const color = palette[index % palette.length];
    return `<line x1="${panel.left + 18}" y1="${y - 4}" x2="${panel.left + 50}" y2="${y - 4}" stroke="${color}" stroke-width="4" stroke-dasharray="${action.admissible ? "" : "6 5"}"/>
      <text x="${panel.left + 60}" y="${y}" fill="${action.admissible ? theme.text : theme.danger}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700">${esc(action.label)}</text>
      <text x="${panel.left + 60}" y="${y + 17}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="9">G=${action.gain_loss_units.toFixed(2)} · E=${action.energy_j.toFixed(2)} J</text>`;
  }).join("");
  const content = `${analyticalHeader(spec, layout, { badge: "SINGLE-ITEM POLICY GEOMETRY" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${gridMarkup}
  <line x1="${box.left}" y1="${yMap(0)}" x2="${box.right}" y2="${yMap(0)}" stroke="${theme.text}" stroke-width="2"/>
  ${actionLines}
  <path d="${envelopePath}" fill="none" stroke="${theme.text}" stroke-width="8" stroke-linecap="round" opacity=".95"/>
  <path d="${envelopePath}" fill="none" stroke="${theme.primary}" stroke-width="4" stroke-linecap="round"/>
  ${segmentLabels}
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">energy price lambda_E · loss units per joule</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">action score G - lambda_E E · loss units</text>
  <rect x="${panel.left}" y="${panel.top}" width="${panel.right - panel.left}" height="${panel.bottom - panel.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${panel.left + 18}" y="${panel.top + 30}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">ACTIONS + GATES</text>
  <text x="${panel.left + 18}" y="${panel.top + 49}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="9">upper envelope = selected admissible action</text>
  ${actionRows}
  <rect x="${panel.left + 16}" y="${panel.bottom - 80}" width="${panel.right - panel.left - 32}" height="58" rx="10" fill="${theme.background}" fill-opacity=".55"/>
  <text x="${panel.left + 28}" y="${panel.bottom - 56}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="10">B ≤ ${(budgets.bytes_max / 1e6).toFixed(1)} MB · T ≤ ${budgets.wall_time_s_max.toFixed(1)} s</text>
  <text x="${panel.left + 28}" y="${panel.bottom - 36}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="10">W ≤ ${budgets.optimizer_updates_max} updates · provenance remains separate</text>`;
  return analyticalDocument(spec, layout, content);
}

function memoryKernelTruncation(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 760,
    kind: "memory-tail-contract",
    theme: "violet",
  });
  const { width, height, theme } = layout;
  const {
    normalized_horizon_min: xMin,
    normalized_horizon_max: xMax,
    samples,
    tail_tolerances: tolerances,
  } = spec.parameters;
  const yMin = 1e-4;
  const yMax = 1;
  const box = { left: 94, right: 830, top: 154, bottom: height - 92 };
  const panel = { left: 868, right: width - 38, top: 154, bottom: height - 92 };
  const xMap = (value) => localScale(value, xMin, xMax, box.left, box.right);
  const yMap = (value) => localLogScale(value, yMin, yMax, box.bottom, box.top);
  const values = Array.from({ length: samples }, (_, index) => {
    const horizon = xMin + (index / (samples - 1)) * (xMax - xMin);
    return { horizon, tail: Math.exp(-horizon) };
  });
  const curve = linePath(values.map(({ horizon, tail }) => [xMap(horizon), yMap(tail)]));
  const area = `${curve} L${box.right},${box.bottom} L${box.left},${box.bottom} Z`;
  const xTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const yTicks = [1, 0.1, 0.01, 0.001, 0.0001];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 23}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick}</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 14}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick === 1 ? "1" : tick.toExponential(0)}</text>`),
  ].join("");
  const toleranceLines = tolerances.map((tolerance, index) => {
    const horizon = -Math.log(tolerance);
    const color = [theme.secondary, theme.accent, theme.danger][index % 3];
    return `<line x1="${box.left}" y1="${yMap(tolerance)}" x2="${xMap(horizon)}" y2="${yMap(tolerance)}" stroke="${color}" stroke-width="2" stroke-dasharray="7 6"/>
      <line x1="${xMap(horizon)}" y1="${yMap(tolerance)}" x2="${xMap(horizon)}" y2="${box.bottom}" stroke="${color}" stroke-width="2" stroke-dasharray="7 6"/>
      <circle cx="${xMap(horizon)}" cy="${yMap(tolerance)}" r="7" fill="${color}" stroke="${theme.text}" stroke-width="2"/>`;
  }).join("");
  const toleranceRows = tolerances.map((tolerance, index) => {
    const horizon = -Math.log(tolerance);
    const color = [theme.secondary, theme.accent, theme.danger][index % 3];
    const y = panel.top + 88 + index * 78;
    return `<circle cx="${panel.left + 26}" cy="${y - 5}" r="7" fill="${color}"/>
      <text x="${panel.left + 44}" y="${y}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800">tail ≤ ${tolerance}</text>
      <text x="${panel.left + 44}" y="${y + 21}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11">H / tau_m ≥ ${horizon.toFixed(3)}</text>`;
  }).join("");
  const content = `${analyticalHeader(spec, layout, { badge: "EXACT EXPONENTIAL TAIL · ANALYTICAL" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${gridMarkup}
  <defs><linearGradient id="memoryTailFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.primary}" stop-opacity=".58"/><stop offset="1" stop-color="${theme.primary}" stop-opacity=".04"/></linearGradient></defs>
  <path d="${area}" fill="url(#memoryTailFill)"/>
  ${toleranceLines}
  <path d="${curve}" fill="none" stroke="${theme.primary}" stroke-width="6" stroke-linecap="round"/>
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">retained history H / memory time tau_m</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">unrepresented kernel mass R(H) · logarithmic</text>
  <rect x="${panel.left}" y="${panel.top}" width="${panel.right - panel.left}" height="${panel.bottom - panel.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${panel.left + 22}" y="${panel.top + 32}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">WINDOW REQUIRED</text>
  <text x="${panel.left + 22}" y="${panel.top + 53}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10">for this kernel, not universally</text>
  ${toleranceRows}
  <rect x="${panel.left + 18}" y="${panel.bottom - 114}" width="${panel.right - panel.left - 36}" height="92" rx="12" fill="${theme.background}" fill-opacity=".54"/>
  <text x="${panel.left + 32}" y="${panel.bottom - 84}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">No free cutoff</text>
  <text x="${panel.left + 32}" y="${panel.bottom - 62}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">longer history lowers this tail</text>
  <text x="${panel.left + 32}" y="${panel.bottom - 43}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">while increasing state and work</text>`;
  return analyticalDocument(spec, layout, content);
}

function hystereticMemoryLoop(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 760,
    kind: "hysteretic-state-loop",
    theme: "ocean",
  });
  const { width, height, theme } = layout;
  const {
    input_min: xMin,
    input_max: xMax,
    threshold_off: thresholdOff,
    threshold_on: thresholdOn,
    probe_input: probeInput,
  } = spec.parameters;
  if (!(xMin < thresholdOff && thresholdOff < probeInput && probeInput < thresholdOn && thresholdOn < xMax)) {
    throw new Error("Hysteretic-memory thresholds must be ordered inside the input range.");
  }
  const box = { left: 94, right: 830, top: 154, bottom: height - 92 };
  const panel = { left: 868, right: width - 38, top: 154, bottom: height - 92 };
  const xMap = (value) => localScale(value, xMin, xMax, box.left, box.right);
  const yMap = (value) => localScale(value, -0.12, 1.12, box.bottom, box.top);
  const rising = [
    [xMap(xMin), yMap(0)],
    [xMap(thresholdOn), yMap(0)],
    [xMap(thresholdOn), yMap(1)],
    [xMap(xMax), yMap(1)],
  ];
  const falling = [
    [xMap(xMax), yMap(1)],
    [xMap(thresholdOff), yMap(1)],
    [xMap(thresholdOff), yMap(0)],
    [xMap(xMin), yMap(0)],
  ];
  const xTicks = [xMin, thresholdOff, probeInput, thresholdOn, xMax];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 24}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick.toFixed(2)}</text>`),
    ...[0, 1].map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 14}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="end">${tick}</text>`),
  ].join("");
  const probeX = xMap(probeInput);
  const content = `${analyticalHeader(spec, layout, { badge: "SCHMITT MEMORY RULE · EXACT" })}
  <defs>
    <marker id="hysteresisUpArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${theme.primary}"/></marker>
    <marker id="hysteresisDownArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${theme.accent}"/></marker>
  </defs>
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <rect x="${xMap(thresholdOff)}" y="${box.top}" width="${xMap(thresholdOn) - xMap(thresholdOff)}" height="${box.bottom - box.top}" fill="${theme.secondary}" fill-opacity=".10"/>
  ${gridMarkup}
  <text x="${(xMap(thresholdOff) + xMap(thresholdOn)) / 2}" y="${box.top + 28}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800" text-anchor="middle">same input · two possible states</text>
  <path d="${linePath(rising)}" fill="none" stroke="${theme.primary}" stroke-width="7" stroke-linejoin="round" marker-end="url(#hysteresisUpArrow)"/>
  <path d="${linePath(falling)}" fill="none" stroke="${theme.accent}" stroke-width="4" stroke-dasharray="10 7" stroke-linejoin="round" marker-end="url(#hysteresisDownArrow)"/>
  <line x1="${probeX}" y1="${yMap(0)}" x2="${probeX}" y2="${yMap(1)}" stroke="${theme.text}" stroke-width="2" stroke-dasharray="5 6"/>
  <circle cx="${probeX}" cy="${yMap(0)}" r="8" fill="${theme.primary}" stroke="${theme.text}" stroke-width="2"/>
  <circle cx="${probeX}" cy="${yMap(1)}" r="8" fill="${theme.accent}" stroke="${theme.text}" stroke-width="2"/>
  <text x="${xMap(thresholdOn) + 12}" y="${yMap(0) - 14}" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800">write 1 at theta_on</text>
  <text x="${xMap(thresholdOff) - 12}" y="${yMap(1) + 24}" fill="${theme.accent}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" text-anchor="end">write 0 at theta_off</text>
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">observed input u_t · dimensionless</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">retained state m_t · binary</text>
  <rect x="${panel.left}" y="${panel.top}" width="${panel.right - panel.left}" height="${panel.bottom - panel.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${panel.left + 22}" y="${panel.top + 34}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">UPDATE CONTRACT</text>
  <text x="${panel.left + 22}" y="${panel.top + 76}" fill="${theme.primary}" font-family="Cascadia Mono, monospace" font-size="11">u ≥ theta_on  → 1</text>
  <text x="${panel.left + 22}" y="${panel.top + 103}" fill="${theme.accent}" font-family="Cascadia Mono, monospace" font-size="11">u ≤ theta_off → 0</text>
  <text x="${panel.left + 22}" y="${panel.top + 130}" fill="${theme.secondary}" font-family="Cascadia Mono, monospace" font-size="11">between       → keep m_t</text>
  <rect x="${panel.left + 18}" y="${panel.top + 166}" width="${panel.right - panel.left - 36}" height="132" rx="12" fill="${theme.background}" fill-opacity=".55"/>
  <text x="${panel.left + 32}" y="${panel.top + 196}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800">At u = ${probeInput.toFixed(2)}</text>
  <text x="${panel.left + 32}" y="${panel.top + 222}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="11">rising history retains 0</text>
  <text x="${panel.left + 32}" y="${panel.top + 246}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="11">falling history retains 1</text>
  <text x="${panel.left + 32}" y="${panel.top + 275}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="10">current input alone is insufficient</text>
  <text x="${panel.left + 22}" y="${panel.bottom - 72}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="800">Ordinary engineering null</text>
  <text x="${panel.left + 22}" y="${panel.bottom - 49}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">Schmitt trigger / finite-state latch</text>
  <text x="${panel.left + 22}" y="${panel.bottom - 28}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">write and reset authority stay external</text>`;
  return analyticalDocument(spec, layout, content);
}

function finiteDiffusionBoundaryTurnover(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 760,
    kind: "diffusion-boundary-turnover",
    theme: "ember",
  });
  const { width, height, theme } = layout;
  const {
    normalized_frequency_min: qMin,
    normalized_frequency_max: qMax,
    samples,
    boundary_turnover: turnover,
  } = spec.parameters;
  if (!(qMin > 0 && qMax > qMin && samples >= 3 && turnover > qMin && turnover < qMax)) {
    throw new Error("Finite-diffusion turnover parameters are invalid.");
  }
  const box = { left: 98, right: 846, top: 154, bottom: height - 92 };
  const panel = { left: 880, right: width - 38, top: 154, bottom: height - 92 };
  const yMin = 0.005;
  const yMax = 20000;
  const xMap = (value) => localLogScale(value, qMin, qMax, box.left, box.right);
  const yMap = (value) => localLogScale(value, yMin, yMax, box.bottom, box.top);
  const tanhOverRootIqMagnitude = (q, blocking) => {
    const a = Math.sqrt(q / 2);
    const denominator = Math.cosh(2 * a) + Math.cos(2 * a);
    let real = Math.sinh(2 * a) / denominator;
    let imaginary = Math.sin(2 * a) / denominator;
    if (blocking) {
      const squaredMagnitude = real * real + imaginary * imaginary;
      [real, imaginary] = [real / squaredMagnitude, -imaginary / squaredMagnitude];
    }
    const quotientReal = (real + imaginary) / (2 * a);
    const quotientImaginary = (imaginary - real) / (2 * a);
    return Math.hypot(quotientReal, quotientImaginary);
  };
  const values = Array.from({ length: samples }, (_, index) => {
    const q = 10 ** (Math.log10(qMin) + (index / (samples - 1)) * (Math.log10(qMax) - Math.log10(qMin)));
    return {
      q,
      semi: 1 / Math.sqrt(q),
      transmissive: tanhOverRootIqMagnitude(q, false),
      blocking: tanhOverRootIqMagnitude(q, true),
    };
  });
  const curve = (key) => linePath(values.map((entry) => [xMap(entry.q), yMap(entry[key])]));
  const xTicks = [1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100, 1000, 10000];
  const yTicks = [0.01, 0.1, 1, 10, 100, 1000, 10000];
  const tickLabel = (value) => value === 1 ? "1" : `10^${Math.round(Math.log10(value))}`;
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 23}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="middle">${tickLabel(tick)}</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 13}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="end">${tickLabel(tick)}</text>`),
  ].join("");
  const turnoverX = xMap(turnover);
  const legendRows = [
    [theme.primary, "semi-infinite", "|Z| ~ q^(-1/2)"],
    [theme.secondary, "finite · transmissive", "|Z| → 1"],
    [theme.accent, "finite · blocking", "|Z| ~ q^(-1)"],
  ].map(([color, label, limit], index) => {
    const y = panel.top + 96 + index * 76;
    return `<line x1="${panel.left + 22}" y1="${y - 5}" x2="${panel.left + 58}" y2="${y - 5}" stroke="${color}" stroke-width="5"/><text x="${panel.left + 70}" y="${y}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800">${label}</text><text x="${panel.left + 70}" y="${y + 20}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10">${limit}</text>`;
  }).join("");
  const content = `${analyticalHeader(spec, layout, { badge: "FINITE DIFFUSION · EXACT NORMALIZED CURVES" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${gridMarkup}
  <rect x="${box.left}" y="${box.top}" width="${turnoverX - box.left}" height="${box.bottom - box.top}" fill="${theme.danger}" fill-opacity=".055"/>
  <line x1="${turnoverX}" y1="${box.top}" x2="${turnoverX}" y2="${box.bottom}" stroke="${theme.danger}" stroke-width="2" stroke-dasharray="8 7"/>
  <text x="${turnoverX + 10}" y="${box.top + 25}" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800">boundary becomes visible · q ≈ 1</text>
  <path d="${curve("semi")}" fill="none" stroke="${theme.primary}" stroke-width="5" stroke-dasharray="9 7"/>
  <path d="${curve("transmissive")}" fill="none" stroke="${theme.secondary}" stroke-width="6"/>
  <path d="${curve("blocking")}" fill="none" stroke="${theme.accent}" stroke-width="6"/>
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">normalized angular frequency q = omega tau_D · logarithmic</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">normalized impedance magnitude · logarithmic</text>
  <rect x="${panel.left}" y="${panel.top}" width="${panel.right - panel.left}" height="${panel.bottom - panel.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${panel.left + 22}" y="${panel.top + 34}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">SAME HIGH-FREQUENCY TAIL</text>
  <text x="${panel.left + 22}" y="${panel.top + 57}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="11">three different low-frequency memories</text>
  ${legendRows}
  <rect x="${panel.left + 18}" y="${panel.bottom - 132}" width="${panel.right - panel.left - 36}" height="108" rx="12" fill="${theme.background}" fill-opacity=".55"/>
  <text x="${panel.left + 32}" y="${panel.bottom - 98}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800">Interpretation rule</text>
  <text x="${panel.left + 32}" y="${panel.bottom - 74}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">a q^(-1/2) band does not prove</text>
  <text x="${panel.left + 32}" y="${panel.bottom - 54}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">an infinite kernel; measure until</text>
  <text x="${panel.left + 32}" y="${panel.bottom - 34}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">the boundary can—or cannot—appear</text>`;
  return analyticalDocument(spec, layout, content);
}

function slowManifoldFoldBoundary(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 760,
    kind: "normal-hyperbolicity-boundary",
    theme: "ember",
  });
  const { width, height, theme } = layout;
  const {
    distance_min: xMin,
    distance_max: xMax,
    samples,
  } = spec.parameters;
  const yMin = 0.01;
  const yMax = 100;
  const box = { left: 94, right: 830, top: 154, bottom: height - 92 };
  const panel = { left: 868, right: width - 38, top: 154, bottom: height - 92 };
  const xMap = (value) => localLogScale(value, xMin, xMax, box.left, box.right);
  const yMap = (value) => localLogScale(value, yMin, yMax, box.bottom, box.top);
  const values = Array.from({ length: samples }, (_, index) => {
    const logDistance = Math.log10(xMin) + (index / (samples - 1)) * (Math.log10(xMax) - Math.log10(xMin));
    const distance = 10 ** logDistance;
    return {
      distance,
      gap: 2 * Math.sqrt(distance),
      sensitivity: 1 / (2 * Math.sqrt(distance)),
    };
  });
  const gapPath = linePath(values.map(({ distance, gap }) => [xMap(distance), yMap(gap)]));
  const sensitivityPath = linePath(values.map(({ distance, sensitivity }) => [xMap(distance), yMap(sensitivity)]));
  const xTicks = [0.0001, 0.001, 0.01, 0.1, 1];
  const yTicks = [0.01, 0.1, 1, 10, 100];
  const gridMarkup = [
    ...xTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${box.top}" x2="${xMap(tick)}" y2="${box.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${box.bottom + 23}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">10^${Math.log10(tick)}</text>`),
    ...yTicks.map((tick) => `<line x1="${box.left}" y1="${yMap(tick)}" x2="${box.right}" y2="${yMap(tick)}" stroke="${theme.grid}"/><text x="${box.left - 14}" y="${yMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">10^${Math.log10(tick)}</text>`),
  ].join("");
  const content = `${analyticalHeader(spec, layout, { badge: "FOLD NORMAL FORM · EXACT GEOMETRY" })}
  <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <defs><linearGradient id="foldWarning" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${theme.danger}" stop-opacity=".34"/><stop offset="1" stop-color="${theme.danger}" stop-opacity="0"/></linearGradient></defs>
  <rect x="${box.left}" y="${box.top}" width="${xMap(0.01) - box.left}" height="${box.bottom - box.top}" fill="url(#foldWarning)"/>
  ${gridMarkup}
  <path d="${gapPath}" fill="none" stroke="${theme.secondary}" stroke-width="6" stroke-linecap="round"/>
  <path d="${sensitivityPath}" fill="none" stroke="${theme.accent}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${xMap(xMin)}" cy="${yMap(2 * Math.sqrt(xMin))}" r="7" fill="${theme.secondary}"/>
  <circle cx="${xMap(xMin)}" cy="${yMap(1 / (2 * Math.sqrt(xMin)))}" r="7" fill="${theme.accent}"/>
  <text x="${box.left + 22}" y="${box.top + 28}" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800">approaching fold: gamma → 0</text>
  <text x="${box.right - 16}" y="${yMap(2) - 12}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" text-anchor="end">normal gap gamma = 2 sqrt(y)</text>
  <text x="${box.right - 16}" y="${yMap(0.5) + 24}" fill="${theme.accent}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" text-anchor="end">manifold sensitivity = 1 / (2 sqrt(y))</text>
  <text x="${(box.left + box.right) / 2}" y="${height - 38}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">distance coordinate y from fold · logarithmic</text>
  <text x="28" y="${(box.top + box.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle" transform="rotate(-90 28 ${(box.top + box.bottom) / 2})">dimensionless magnitude · logarithmic</text>
  <rect x="${panel.left}" y="${panel.top}" width="${panel.right - panel.left}" height="${panel.bottom - panel.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${panel.left + 22}" y="${panel.top + 33}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">WHAT FAILS FIRST</text>
  <line x1="${panel.left + 22}" y1="${panel.top + 76}" x2="${panel.left + 62}" y2="${panel.top + 76}" stroke="${theme.secondary}" stroke-width="6"/>
  <text x="${panel.left + 74}" y="${panel.top + 81}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700">normal attraction</text>
  <text x="${panel.left + 22}" y="${panel.top + 107}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">vanishes at y = 0</text>
  <line x1="${panel.left + 22}" y1="${panel.top + 151}" x2="${panel.left + 62}" y2="${panel.top + 151}" stroke="${theme.accent}" stroke-width="6"/>
  <text x="${panel.left + 74}" y="${panel.top + 156}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700">state sensitivity</text>
  <text x="${panel.left + 22}" y="${panel.top + 182}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">diverges at the same boundary</text>
  <rect x="${panel.left + 18}" y="${panel.top + 228}" width="${panel.right - panel.left - 36}" height="124" rx="12" fill="${theme.background}" fill-opacity=".54"/>
  <text x="${panel.left + 32}" y="${panel.top + 258}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="800">Reduction contract</text>
  <text x="${panel.left + 32}" y="${panel.top + 282}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">state the compact region</text>
  <text x="${panel.left + 32}" y="${panel.top + 303}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">measure a spectral margin</text>
  <text x="${panel.left + 32}" y="${panel.top + 324}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="10">abstain outside support</text>
  <text x="${panel.left + 22}" y="${panel.bottom - 52}" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="800">No universal threshold shown</text>
  <text x="${panel.left + 22}" y="${panel.bottom - 29}" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="9">validity depends on the full system and perturbation</text>`;
  return analyticalDocument(spec, layout, content);
}

function missionProfileDamage(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 820,
    kind: "stacked-history",
    theme: "daylight",
  });
  const { width, height, theme } = layout;
  const {
    duration_s: duration,
    samples,
    reference_temperature_k: referenceTemperature,
    constant_temperature_k: constantTemperature,
    pulsed_low_temperature_k: lowTemperature,
    pulsed_high_temperature_k: highTemperature,
    pulse_cycle_s: cycle,
    pulse_high_fraction: highFraction,
    activation_energy_ev: activationEnergy,
    boltzmann_ev_per_k: boltzmann,
  } = spec.parameters;
  const upper = { left: 94, right: width - 54, top: 146, bottom: 390 };
  const lower = { left: 94, right: width - 54, top: 492, bottom: height - 70 };
  const xMap = (value) => localScale(value, 0, duration, upper.left, upper.right);
  const tempMap = (value) => localScale(value, 315, 365, upper.bottom, upper.top);
  const rate = (temperature) => Math.exp(
    (activationEnergy / boltzmann) * (1 / referenceTemperature - 1 / temperature),
  );
  const pulsedTemperature = (time) => (
    (time % cycle) < cycle * highFraction ? highTemperature : lowTemperature
  );
  const times = Array.from({ length: samples }, (_, index) => (
    (index / (samples - 1)) * duration
  ));
  const dt = duration / (samples - 1);
  let constantDamage = 0;
  let pulsedDamage = 0;
  const history = times.map((time, index) => {
    if (index > 0) {
      const midpoint = time - dt / 2;
      constantDamage += rate(constantTemperature) * dt;
      pulsedDamage += rate(pulsedTemperature(midpoint)) * dt;
    }
    return {
      time,
      pulsedTemperature: pulsedTemperature(Math.min(time, duration - Number.EPSILON)),
      constantDamage,
      pulsedDamage,
    };
  });
  const constantFinal = history.at(-1).constantDamage;
  const pulsedFinal = history.at(-1).pulsedDamage;
  const damageMax = Math.ceil((pulsedFinal / constantFinal) * 2) / 2;
  const damageMap = (value) => localScale(value, 0, damageMax, lower.bottom, lower.top);
  const constantTemperaturePath = linePath(times.map((time) => [
    xMap(time),
    tempMap(constantTemperature),
  ]));
  const pulsedTemperaturePath = linePath(history.map(({ time, pulsedTemperature: temperature }) => [
    xMap(time),
    tempMap(temperature),
  ]));
  const constantDamagePath = linePath(history.map(({ time, constantDamage: damage }) => [
    xMap(time),
    damageMap(damage / constantFinal),
  ]));
  const pulsedDamagePath = linePath(history.map(({ time, pulsedDamage: damage }) => [
    xMap(time),
    damageMap(damage / constantFinal),
  ]));
  const timeTicks = [0, 600, 1200, 1800, 2400, 3000, 3600];
  const upperGrid = [320, 330, 340, 350, 360].map((tick) => `<line x1="${upper.left}" y1="${tempMap(tick)}" x2="${upper.right}" y2="${tempMap(tick)}" stroke="${theme.grid}"/><text x="${upper.left - 14}" y="${tempMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick}</text>`).join("");
  const lowerTicks = Array.from({ length: Math.floor(damageMax / 0.5) + 1 }, (_, index) => index * 0.5);
  const lowerGrid = lowerTicks.map((tick) => `<line x1="${lower.left}" y1="${damageMap(tick)}" x2="${lower.right}" y2="${damageMap(tick)}" stroke="${theme.grid}"/><text x="${lower.left - 14}" y="${damageMap(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(1)}</text>`).join("");
  const xTicks = timeTicks.map((tick) => `<line x1="${xMap(tick)}" y1="${lower.top}" x2="${xMap(tick)}" y2="${lower.bottom}" stroke="${theme.grid}"/><text x="${xMap(tick)}" y="${lower.bottom + 22}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick / 60}</text>`).join("");
  const analyticMean = highFraction * highTemperature + (1 - highFraction) * lowTemperature;
  const content = `${analyticalHeader(spec, layout, { badge: "PATH-HISTORY MODEL · ANALYTICAL" })}
  <rect x="${upper.left}" y="${upper.top}" width="${upper.right - upper.left}" height="${upper.bottom - upper.top}" rx="14" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${upperGrid}
  <path d="${constantTemperaturePath}" fill="none" stroke="${theme.secondary}" stroke-width="6"/>
  <path d="${pulsedTemperaturePath}" fill="none" stroke="${theme.accent}" stroke-width="5"/>
  <text x="${upper.left + 18}" y="${upper.top + 28}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">TEMPERATURE HISTORY</text>
  <rect x="${upper.right - 344}" y="${upper.top + 18}" width="326" height="58" rx="10" fill="${theme.panelAlt}"/>
  <text x="${upper.right - 326}" y="${upper.top + 42}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700">Both arithmetic means: ${analyticMean.toFixed(0)} K</text>
  <text x="${upper.right - 326}" y="${upper.top + 62}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10">constant 330 K · pulsed 360/320 K</text>
  <rect x="${lower.left}" y="${lower.top}" width="${lower.right - lower.left}" height="${lower.bottom - lower.top}" rx="14" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${lowerGrid}${xTicks}
  <path d="${constantDamagePath}" fill="none" stroke="${theme.secondary}" stroke-width="6"/>
  <path d="${pulsedDamagePath}" fill="none" stroke="${theme.accent}" stroke-width="6"/>
  <text x="${lower.left + 18}" y="${lower.top + 28}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">CUMULATIVE NORMALIZED DAMAGE</text>
  <circle cx="${lower.right}" cy="${damageMap(pulsedFinal / constantFinal)}" r="8" fill="${theme.accent}"/>
  <text x="${lower.right - 12}" y="${damageMap(pulsedFinal / constantFinal) - 14}" fill="${theme.accent}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800" text-anchor="end">pulsed: ${(pulsedFinal / constantFinal).toFixed(2)}×</text>
  <circle cx="${lower.right}" cy="${damageMap(1)}" r="8" fill="${theme.secondary}"/>
  <text x="${lower.right - 12}" y="${damageMap(1) - 14}" fill="${theme.secondary}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800" text-anchor="end">constant: 1.00×</text>
  <text x="${(lower.left + lower.right) / 2}" y="${height - 25}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="14" text-anchor="middle">elapsed time · minutes</text>
  <text x="28" y="${(upper.top + upper.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 28 ${(upper.top + upper.bottom) / 2})">temperature · K</text>
  <text x="28" y="${(lower.top + lower.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 28 ${(lower.top + lower.bottom) / 2})">damage / constant-profile final damage</text>`;
  return analyticalDocument(spec, layout, content);
}

function interfaceQualifiedScaleSymmetry(spec) {
  const layout = analyticalLayout(spec, {
    width: 980,
    height: 820,
    kind: "scale-orbit-and-interface-gate",
    theme: "ocean",
  });
  const { width, theme } = layout;
  const {
    time_min_s: timeMin,
    time_max_s: timeMax,
    samples,
    pulse_start_s: pulseStart,
    pulse_end_s: pulseEnd,
    reference_time_constant_s: tau,
    backgrounds_u: backgrounds,
    fold_multiplier: multiplier,
    absolute_gate_u: absoluteGate,
    state_min_u: stateMin,
    state_max_u: stateMax,
    ratio_contours: ratioContours,
  } = spec.parameters;
  const scalarParameters = [
    timeMin,
    timeMax,
    pulseStart,
    pulseEnd,
    tau,
    multiplier,
    absoluteGate,
    stateMin,
    stateMax,
  ];
  if (!scalarParameters.every((value) => Number.isFinite(value))) {
    throw new Error(`${spec.id} requires finite scalar parameters`);
  }
  if (!Number.isInteger(samples) || samples < 2) {
    throw new Error(`${spec.id} requires an integer samples value of at least 2`);
  }
  if (
    !Array.isArray(backgrounds)
    || backgrounds.length !== 2
    || !backgrounds.every((value) => Number.isFinite(value) && value > 0)
    || backgrounds[0] >= backgrounds[1]
  ) {
    throw new Error(`${spec.id} requires exactly two backgrounds_u values`);
  }
  if (
    !Array.isArray(ratioContours)
    || ratioContours.length === 0
    || !ratioContours.every((value, index) =>
      Number.isFinite(value)
      && value > 0
      && (index === 0 || value > ratioContours[index - 1]))
  ) {
    throw new Error(`${spec.id} requires positive, strictly sorted ratio_contours`);
  }
  if (!(timeMin < pulseStart && pulseStart < pulseEnd && pulseEnd < timeMax)) {
    throw new Error(`${spec.id} has invalid pulse timing`);
  }
  if (!(tau > 0) || !(multiplier > 1) || !(stateMin > 0) || !(stateMax > stateMin)) {
    throw new Error(`${spec.id} has an invalid positive-domain parameter`);
  }
  const lowPeak = backgrounds[0] * multiplier;
  const highPeak = backgrounds[1] * multiplier;
  if (!(stateMin <= backgrounds[0] && stateMax >= highPeak && absoluteGate > stateMin && absoluteGate < stateMax)) {
    throw new Error(`${spec.id} state bounds do not contain the displayed trajectories and gate`);
  }
  if (!(
    backgrounds.every((background) => background < absoluteGate)
    && lowPeak < absoluteGate
    && absoluteGate <= highPeak
  )) {
    throw new Error(`${spec.id} gate must stay closed at both backgrounds and open only for the high pulse`);
  }

  const stateBox = { left: 88, right: width - 54, top: 154, bottom: 470 };
  const tracePanel = { left: 88, right: width - 54, top: 548, bottom: 690 };
  const traceBox = { left: 88, right: width - 54, top: 584, bottom: 690 };
  const stateX = (value) => localLogScale(value, stateMin, stateMax, stateBox.left, stateBox.right);
  const stateY = (value) => localLogScale(value, stateMin, stateMax, stateBox.bottom, stateBox.top);
  const traceX = (value) => localScale(value, timeMin, timeMax, traceBox.left, traceBox.right);
  const colors = [theme.primary, theme.secondary];

  function referenceAt(time, background) {
    if (time < pulseStart) return background;
    if (time < pulseEnd) {
      return background * (
        multiplier - (multiplier - 1) * Math.exp(-(time - pulseStart) / tau)
      );
    }
    const q = (multiplier - 1) * (1 - Math.exp(-(pulseEnd - pulseStart) / tau));
    return background * (1 + q * Math.exp(-(time - pulseEnd) / tau));
  }

  const times = Array.from(
    { length: samples },
    (_, index) => timeMin + (index / (samples - 1)) * (timeMax - timeMin),
  );
  const beforePulse = times.filter((time) => time < pulseStart);
  const insidePulse = times.filter((time) => time > pulseStart && time < pulseEnd);
  const afterPulse = times.filter((time) => time > pulseEnd);
  const statePaths = backgrounds.map((background, index) => {
    const pulseInput = background * multiplier;
    const referenceAtPulseEnd = referenceAt(pulseEnd, background);
    const points = [
      ...beforePulse.map(() => [stateX(background), stateY(background)]),
      [stateX(background), stateY(background)],
      [stateX(background), stateY(pulseInput)],
      ...insidePulse.map((time) => [
        stateX(referenceAt(time, background)),
        stateY(pulseInput),
      ]),
      [stateX(referenceAtPulseEnd), stateY(pulseInput)],
      [stateX(referenceAtPulseEnd), stateY(background)],
      ...afterPulse.map((time) => [
        stateX(referenceAt(time, background)),
        stateY(background),
      ]),
    ];
    const pathData = points.map(([x, y], pointIndex) => `${pointIndex ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    return `<path d="${pathData}" fill="none" stroke="${colors[index]}" stroke-width="${index ? 4 : 7}" ${index ? 'stroke-dasharray="12 8"' : ""} stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${stateX(background)}" cy="${stateY(background)}" r="7" fill="${colors[index]}"/>
      <circle cx="${stateX(background)}" cy="${stateY(background * multiplier)}" r="6" fill="${theme.background}" stroke="${colors[index]}" stroke-width="4"/>`;
  }).join("");

  const contourMarkup = ratioContours.map((ratio) => {
    const candidates = [
      [stateMin, stateMin * ratio],
      [stateMax, stateMax * ratio],
      [stateMin / ratio, stateMin],
      [stateMax / ratio, stateMax],
    ].filter(([reference, input]) =>
      reference >= stateMin && reference <= stateMax && input >= stateMin && input <= stateMax
    );
    const endpoints = candidates.filter((point, index, all) =>
      all.findIndex(([a, b]) => Math.abs(a - point[0]) < 1e-12 && Math.abs(b - point[1]) < 1e-12) === index
    );
    if (endpoints.length < 2) return "";
    const [[r1, u1], [r2, u2]] = endpoints;
    const emphasis = ratio === 1;
    const labelReference = Math.sqrt(r1 * r2);
    const labelInput = Math.sqrt(u1 * u2);
    return `<line x1="${stateX(r1)}" y1="${stateY(u1)}" x2="${stateX(r2)}" y2="${stateY(u2)}" stroke="${emphasis ? theme.accent : theme.grid}" stroke-width="${emphasis ? 3 : 2}" stroke-dasharray="8 7"/>
      <text x="${stateX(labelReference)}" y="${stateY(labelInput) - 9}" fill="${emphasis ? theme.accent : theme.muted}" stroke="${theme.panel}" stroke-width="5" paint-order="stroke fill" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">u/r=${ratio}</text>`;
  }).join("");

  const gateY = stateY(absoluteGate);
  const inputTicks = [...new Set([
    ...backgrounds,
    ...backgrounds.map((background) => background * multiplier),
  ])].sort((a, b) => a - b).filter((value) => value >= stateMin && value <= stateMax);
  const gridMarkup = inputTicks.map((value) => `<line x1="${stateX(value)}" y1="${stateBox.top}" x2="${stateX(value)}" y2="${stateBox.bottom}" stroke="${theme.grid}" opacity=".55"/>
    <line x1="${stateBox.left}" y1="${stateY(value)}" x2="${stateBox.right}" y2="${stateY(value)}" stroke="${theme.grid}" opacity=".55"/>
    <text x="${stateX(value)}" y="${stateBox.bottom + 22}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${value}</text>
    <text x="${stateBox.left - 12}" y="${stateY(value) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${value}</text>`).join("");

  const relativeBackground = backgrounds[0];
  const relativePulseInput = relativeBackground * multiplier;
  const relativeReferenceAtEnd = referenceAt(pulseEnd, relativeBackground);
  const relativeSamples = [
    ...beforePulse.map((time) => [time, 0]),
    [pulseStart, 0],
    [pulseStart, Math.log(multiplier)],
    ...insidePulse.map((time) => [
      time,
      Math.log(relativePulseInput / referenceAt(time, relativeBackground)),
    ]),
    [pulseEnd, Math.log(relativePulseInput / relativeReferenceAtEnd)],
    [pulseEnd, Math.log(relativeBackground / relativeReferenceAtEnd)],
    ...afterPulse.map((time) => [
      time,
      Math.log(relativeBackground / referenceAt(time, relativeBackground)),
    ]),
  ];
  const traceMagnitude = Math.max(...relativeSamples.map(([, value]) => Math.abs(value)));
  const traceLimit = traceMagnitude > 0 ? traceMagnitude * 1.08 : 1;
  const traceY = (value) => localScale(value, -traceLimit, traceLimit, traceBox.bottom, traceBox.top);
  const relativePoints = relativeSamples.map(([time, value]) => [traceX(time), traceY(value)]);
  const relativePath = relativePoints.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const timeTicks = Array.from(
    { length: 6 },
    (_, index) => timeMin + (index / 5) * (timeMax - timeMin),
  );
  const formatTimeTick = (value) => String(Number(value.toFixed(2)));
  const traceGrid = timeTicks.map((value) => `<line x1="${traceX(value)}" y1="${traceBox.top}" x2="${traceX(value)}" y2="${traceBox.bottom}" stroke="${theme.grid}" opacity=".55"/>
    <text x="${traceX(value)}" y="710" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${formatTimeTick(value)}</text>`).join("");

  const content = `${analyticalHeader(spec, layout, { badge: "EXACT TOY MODEL · INTERFACE FIREWALL" })}
  <defs>
    <clipPath id="interface-state-clip"><rect x="${stateBox.left}" y="${stateBox.top}" width="${stateBox.right - stateBox.left}" height="${stateBox.bottom - stateBox.top}" rx="16"/></clipPath>
    <clipPath id="interface-trace-clip"><rect x="${tracePanel.left + 2}" y="${traceBox.top}" width="${tracePanel.right - tracePanel.left - 4}" height="${traceBox.bottom - traceBox.top - 2}"/></clipPath>
  </defs>
  <rect x="${stateBox.left}" y="${stateBox.top}" width="${stateBox.right - stateBox.left}" height="${stateBox.bottom - stateBox.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${stateBox.left + 18}" y="${stateBox.top + 28}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">STATE PLANE · GEOMETRICALLY SCALED ORBITS</text>
  ${gridMarkup}
  <g clip-path="url(#interface-state-clip)">
    <rect x="${stateBox.left}" y="${stateBox.top}" width="${stateBox.right - stateBox.left}" height="${Math.max(0, gateY - stateBox.top)}" fill="${theme.danger}" fill-opacity=".08"/>
    ${contourMarkup}
    <line x1="${stateBox.left}" y1="${gateY}" x2="${stateBox.right}" y2="${gateY}" stroke="${theme.danger}" stroke-width="4"/>
    ${statePaths}
  </g>
  <text x="${stateBox.left + 14}" y="${gateY - 10}" fill="${theme.danger}" stroke="${theme.panel}" stroke-width="5" paint-order="stroke fill" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800" text-anchor="start">separate absolute gate · u=${absoluteGate}</text>
  <line x1="${stateBox.left + 20}" y1="${stateBox.top + 78}" x2="${stateBox.left + 70}" y2="${stateBox.top + 78}" stroke="${colors[0]}" stroke-width="7"/><text x="${stateBox.left + 82}" y="${stateBox.top + 83}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13">${backgrounds[0]}→${backgrounds[0] * multiplier}</text>
  <line x1="${stateBox.left + 20}" y1="${stateBox.top + 106}" x2="${stateBox.left + 70}" y2="${stateBox.top + 106}" stroke="${colors[1]}" stroke-width="4" stroke-dasharray="12 8"/><text x="${stateBox.left + 82}" y="${stateBox.top + 111}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13">${backgrounds[1]}→${backgrounds[1] * multiplier}</text>
  <text x="${(stateBox.left + stateBox.right) / 2}" y="${stateBox.bottom + 48}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">reference state r · input units · logarithmic scale</text>
  <text x="26" y="${(stateBox.top + stateBox.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 26 ${(stateBox.top + stateBox.bottom) / 2})">current input u · input units · log scale</text>
  <rect x="${tracePanel.left}" y="${tracePanel.top}" width="${tracePanel.right - tracePanel.left}" height="${tracePanel.bottom - tracePanel.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${tracePanel.left + 18}" y="${tracePanel.top + 26}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">RELATIVE READOUT · COMPLETE TRAJECTORIES COINCIDE</text>
  ${traceGrid}
  <line x1="${traceBox.left}" y1="${traceY(0)}" x2="${traceBox.right}" y2="${traceY(0)}" stroke="${theme.grid}" stroke-width="2"/>
  <g clip-path="url(#interface-trace-clip)">
    <path d="${relativePath}" fill="none" stroke="${colors[0]}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${relativePath}" fill="none" stroke="${colors[1]}" stroke-width="4" stroke-dasharray="12 8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <rect x="${tracePanel.left}" y="${tracePanel.top}" width="${tracePanel.right - tracePanel.left}" height="${tracePanel.bottom - tracePanel.top}" rx="16" fill="none" stroke="${theme.grid}" stroke-width="2"/>
  <text x="${traceBox.left - 12}" y="${traceY(0) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">0</text>
  <text x="${traceBox.left - 12}" y="${traceY(Math.log(multiplier)) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">ln ${multiplier}</text>
  <text x="${(traceBox.left + traceBox.right) / 2}" y="733" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">time t (s)</text>
  <text x="26" y="${(traceBox.top + traceBox.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 26 ${(traceBox.top + traceBox.bottom) / 2})">y = ln(u/r)</text>
  <rect x="${traceBox.left}" y="746" width="${traceBox.right - traceBox.left}" height="46" rx="12" fill="${theme.panel}" stroke="${theme.grid}"/>
  <text x="${traceBox.left + 14}" y="765" fill="${colors[0]}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="800">LOW SCALE · absolute gate remains closed</text>
  <rect x="${traceBox.left + 14}" y="775" width="12" height="9" rx="3" fill="${theme.danger}"/>
  <text x="${traceBox.left + 34}" y="784" fill="${colors[1]}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="800">HIGH SCALE · gate opens at t=${pulseStart}–${pulseEnd} s</text>
  <text x="${width - 42}" y="810" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="end">input levels and gate are illustrative · no biological or trained-system result</text>`;
  return analyticalDocument(spec, layout, content);
}

function interfaceQualifiedRetroactivity(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 840,
    kind: "retroactivity-transient-and-load-envelope",
    theme: "violet",
  });
  const { width, height, theme } = layout;
  const {
    time_min_s: timeMin,
    time_max_s: timeMax,
    samples,
    pulse_start_s: pulseStart,
    pulse_end_s: pulseEnd,
    production_low_u_per_s: productionLow,
    production_high_u_per_s: productionHigh,
    decay_per_s: decay,
    binding_on_per_u_s: bindingOn,
    binding_off_per_s: bindingOff,
    binding_site_total_u: siteTotal,
    state_ratio_min: ratioMin,
    state_ratio_max: ratioMax,
    load_ratios: loadRatios,
  } = spec.parameters;
  const scalars = [
    timeMin, timeMax, pulseStart, pulseEnd, productionLow, productionHigh,
    decay, bindingOn, bindingOff, siteTotal, ratioMin, ratioMax,
  ];
  if (!scalars.every(Number.isFinite)) {
    throw new Error(`${spec.id} requires finite scalar parameters`);
  }
  if (!Number.isInteger(samples) || samples < 101) {
    throw new Error(`${spec.id} requires at least 101 samples`);
  }
  if (!(timeMin < pulseStart && pulseStart < pulseEnd && pulseEnd < timeMax)) {
    throw new Error(`${spec.id} has invalid pulse timing`);
  }
  if (!(productionLow > 0 && productionHigh > productionLow && decay > 0
    && bindingOn > 0 && bindingOff > 0 && siteTotal > 0
    && ratioMin > 0 && ratioMax > ratioMin)) {
    throw new Error(`${spec.id} has invalid positive-domain parameters`);
  }
  if (!Array.isArray(loadRatios) || loadRatios.length !== 3
    || !loadRatios.every((value, index) => Number.isFinite(value) && value > 0
      && (index === 0 || value > loadRatios[index - 1]))) {
    throw new Error(`${spec.id} requires three positive sorted load_ratios`);
  }

  const upper = { left: 92, right: width - 54, top: 150, bottom: 478 };
  const lower = { left: 92, right: width - 54, top: 565, bottom: 748 };
  const dt = (timeMax - timeMin) / (samples - 1);
  const dissociation = bindingOff / bindingOn;
  const productionAt = (time) => (
    time >= pulseStart && time < pulseEnd ? productionHigh : productionLow
  );
  const derivative = (time, state, connected) => {
    const [free, bound] = state;
    const bind = connected ? bindingOn * free * (siteTotal - bound) : 0;
    const unbind = connected ? bindingOff * bound : 0;
    return [productionAt(time) - decay * free - bind + unbind, bind - unbind];
  };
  const step = (time, state, connected) => {
    const k1 = derivative(time, state, connected);
    const s2 = state.map((value, index) => value + 0.5 * dt * k1[index]);
    const k2 = derivative(time + 0.5 * dt, s2, connected);
    const s3 = state.map((value, index) => value + 0.5 * dt * k2[index]);
    const k3 = derivative(time + 0.5 * dt, s3, connected);
    const s4 = state.map((value, index) => value + dt * k3[index]);
    const k4 = derivative(time + dt, s4, connected);
    return state.map((value, index) => Math.max(0, value + (dt / 6)
      * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index])));
  };
  const initialFree = productionLow / decay;
  const initialBound = siteTotal * initialFree / (dissociation + initialFree);
  const times = Array.from({ length: samples }, (_, index) => timeMin + index * dt);
  function simulate(connected) {
    const trajectory = [];
    let state = [initialFree, connected ? initialBound : 0];
    times.forEach((time, index) => {
      trajectory.push([time, state[0], state[1]]);
      if (index < times.length - 1) state = step(time, state, connected);
    });
    return trajectory;
  }
  const isolated = simulate(false);
  const connected = simulate(true);
  const stateMax = Math.max(
    productionHigh / decay,
    ...isolated.map((entry) => entry[1]),
    ...connected.map((entry) => entry[1]),
  ) * 1.08;
  const timeX = (value) => localScale(value, timeMin, timeMax, upper.left, upper.right);
  const stateY = (value) => localScale(value, 0, stateMax, upper.bottom, upper.top);
  const isolatedPath = linePath(isolated.map(([time, free]) => [timeX(time), stateY(free)]));
  const connectedPath = linePath(connected.map(([time, free]) => [timeX(time), stateY(free)]));
  const pulseX = timeX(pulseStart);
  const pulseWidth = timeX(pulseEnd) - pulseX;
  const timeTicks = [0, 4, 8, 12, 16, 20].filter((value) => value >= timeMin && value <= timeMax);
  const stateTicks = Array.from({ length: 5 }, (_, index) => (index / 4) * stateMax);
  const upperGrid = [
    ...timeTicks.map((tick) => `<line x1="${timeX(tick)}" y1="${upper.top}" x2="${timeX(tick)}" y2="${upper.bottom}" stroke="${theme.grid}" opacity=".65"/><text x="${timeX(tick)}" y="${upper.bottom + 22}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick}</text>`),
    ...stateTicks.map((tick) => `<line x1="${upper.left}" y1="${stateY(tick)}" x2="${upper.right}" y2="${stateY(tick)}" stroke="${theme.grid}" opacity=".65"/><text x="${upper.left - 14}" y="${stateY(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(1)}</text>`),
  ].join("");

  const ratioX = (value) => localLogScale(value, ratioMin, ratioMax, lower.left, lower.right);
  const retroY = (value) => localScale(value, 0, 1, lower.bottom, lower.top);
  const ratioSamples = Array.from({ length: 401 }, (_, index) => (
    10 ** (Math.log10(ratioMin) + (index / 400) * (Math.log10(ratioMax) - Math.log10(ratioMin)))
  ));
  const palette = [theme.secondary, theme.accent, theme.danger];
  const retroPaths = loadRatios.map((load, index) => {
    const points = ratioSamples.map((ratio) => {
      const value = 1 / (1 + ((1 + ratio) ** 2) / load);
      return [ratioX(ratio), retroY(value)];
    });
    return `<path d="${linePath(points)}" fill="none" stroke="${palette[index]}" stroke-width="5" stroke-linecap="round"/>`;
  }).join("");
  const ratioTicks = [0.05, 0.1, 0.5, 1, 5, 10, 20].filter((value) => value >= ratioMin && value <= ratioMax);
  const retroTicks = [0, 0.25, 0.5, 0.75, 1];
  const lowerGrid = [
    ...ratioTicks.map((tick) => `<line x1="${ratioX(tick)}" y1="${lower.top}" x2="${ratioX(tick)}" y2="${lower.bottom}" stroke="${theme.grid}" opacity=".65"/><text x="${ratioX(tick)}" y="${lower.bottom + 22}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick}</text>`),
    ...retroTicks.map((tick) => `<line x1="${lower.left}" y1="${retroY(tick)}" x2="${lower.right}" y2="${retroY(tick)}" stroke="${theme.grid}" opacity=".65"/><text x="${lower.left - 14}" y="${retroY(tick) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(2)}</text>`),
  ].join("");
  const legend = [
    [theme.primary, "isolated producer"],
    [theme.accent, "connected free signal"],
  ].map(([color, label], index) => `<line x1="${upper.right - 360 + index * 182}" y1="${upper.top + 28}" x2="${upper.right - 326 + index * 182}" y2="${upper.top + 28}" stroke="${color}" stroke-width="6"/><text x="${upper.right - 316 + index * 182}" y="${upper.top + 33}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12">${label}</text>`).join("");
  const loadLegend = loadRatios.map((load, index) => `<line x1="${lower.right - 425 + index * 136}" y1="${lower.top + 27}" x2="${lower.right - 393 + index * 136}" y2="${lower.top + 27}" stroke="${palette[index]}" stroke-width="5"/><text x="${lower.right - 383 + index * 136}" y="${lower.top + 32}" fill="${theme.text}" font-family="Cascadia Mono, monospace" font-size="11">p/Kd=${load}</text>`).join("");

  const content = `${analyticalHeader(spec, layout, { badge: "DETERMINISTIC TOY MODEL · CONNECTION TEST" })}
  <rect x="${upper.left}" y="${upper.top}" width="${upper.right - upper.left}" height="${upper.bottom - upper.top}" rx="16" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <rect x="${pulseX}" y="${upper.top}" width="${pulseWidth}" height="${upper.bottom - upper.top}" fill="${theme.primary}" fill-opacity=".10"/>
  ${upperGrid}
  <path d="${isolatedPath}" fill="none" stroke="${theme.primary}" stroke-width="7" stroke-linecap="round"/>
  <path d="${connectedPath}" fill="none" stroke="${theme.accent}" stroke-width="5" stroke-linecap="round"/>
  <line x1="${timeX(pulseStart)}" y1="${upper.top}" x2="${timeX(pulseStart)}" y2="${upper.bottom}" stroke="${theme.primary}" stroke-width="2" stroke-dasharray="8 7"/>
  <line x1="${timeX(pulseEnd)}" y1="${upper.top}" x2="${timeX(pulseEnd)}" y2="${upper.bottom}" stroke="${theme.primary}" stroke-width="2" stroke-dasharray="8 7"/>
  <text x="${upper.left + 18}" y="${upper.top + 30}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">PAIRED INTERVENTION · SAME INPUT, CLIENT ATTACHED OR ABSENT</text>
  ${legend}
  <text x="${(upper.left + upper.right) / 2}" y="${upper.bottom + 47}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">time t · s</text>
  <text x="28" y="${(upper.top + upper.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 28 ${(upper.top + upper.bottom) / 2})">free producer signal X · arbitrary concentration unit</text>

  <rect x="${lower.left}" y="${lower.top}" width="${lower.right - lower.left}" height="${lower.bottom - lower.top}" rx="16" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  ${lowerGrid}${retroPaths}
  <text x="${lower.left + 18}" y="${lower.top + 30}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">REDUCED FACTOR · LOAD AND OPERATING POINT BOTH MATTER</text>
  ${loadLegend}
  <text x="${(lower.left + lower.right) / 2}" y="${lower.bottom + 47}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">normalized producer state X / Kd · logarithmic scale</text>
  <text x="28" y="${(lower.top + lower.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 28 ${(lower.top + lower.bottom) / 2})">retroactivity factor R(X) · dimensionless</text>
  <text x="${width - 42}" y="${height - 22}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="end">hypothetical parameters · full ODE above · reduced factor below · no service or energy result</text>`;
  return analyticalDocument(spec, layout, content);
}

function historyConditionedPositionContrast(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 780,
    kind: "position-contrast-interaction",
    theme: "violet",
  });
  const { width, height, theme } = layout;
  const {
    positions,
    shared_capacity_contrast_percentage_points: shared,
    reserved_capacity_contrast_percentage_points: reserved,
  } = spec.parameters;
  const arraysAreValid = Array.isArray(positions)
    && Array.isArray(shared)
    && Array.isArray(reserved)
    && positions.length >= 3
    && positions.length === shared.length
    && positions.length === reserved.length
    && positions.every((value, index) => Number.isFinite(value)
      && (index === 0 || value > positions[index - 1]))
    && shared.every(Number.isFinite)
    && reserved.every(Number.isFinite);
  if (!arraysAreValid) {
    throw new Error(`${spec.id} requires aligned finite position-contrast arrays`);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean(shared)) > 1e-9 || Math.abs(mean(reserved)) > 1e-9) {
    throw new Error(`${spec.id} requires each position-contrast series to be centered`);
  }

  const interaction = reserved.map((value, index) => value - shared[index]);
  const maxMagnitude = Math.max(
    ...shared.map(Math.abs),
    ...reserved.map(Math.abs),
    ...interaction.map(Math.abs),
  );
  const axisLimit = Math.max(2, 2 * Math.ceil((maxMagnitude * 1.25) / 2));
  const yTicks = [-axisLimit, -axisLimit / 2, 0, axisLimit / 2, axisLimit];
  const left = { left: 96, right: 742, top: 205, bottom: 548 };
  const right = { left: 844, right: width - 42, top: 205, bottom: 548 };
  const xMin = positions[0];
  const xMax = positions[positions.length - 1];
  const leftX = (value) => localScale(value, xMin, xMax, left.left + 42, left.right - 42);
  const rightX = (value) => localScale(value, xMin, xMax, right.left + 36, right.right - 36);
  const yMap = (value, panel) => localScale(
    value,
    -axisLimit,
    axisLimit,
    panel.bottom,
    panel.top,
  );
  const signed = (value, digits = 0) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

  const leftGrid = [
    ...yTicks.map((tick) => `<line x1="${left.left}" y1="${yMap(tick, left)}" x2="${left.right}" y2="${yMap(tick, left)}" stroke="${theme.grid}" opacity=".68"/><text x="${left.left - 13}" y="${yMap(tick, left) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${signed(tick)}</text>`),
    ...positions.map((position) => `<line x1="${leftX(position)}" y1="${left.top}" x2="${leftX(position)}" y2="${left.bottom}" stroke="${theme.grid}" opacity=".42"/><text x="${leftX(position)}" y="${left.bottom + 23}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="middle">${position}</text>`),
  ].join("");
  const rightGrid = [
    ...yTicks.map((tick) => `<line x1="${right.left}" y1="${yMap(tick, right)}" x2="${right.right}" y2="${yMap(tick, right)}" stroke="${theme.grid}" opacity=".68"/><text x="${right.left - 12}" y="${yMap(tick, right) + 4}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${signed(tick)}</text>`),
    ...positions.map((position) => `<line x1="${rightX(position)}" y1="${right.top}" x2="${rightX(position)}" y2="${right.bottom}" stroke="${theme.grid}" opacity=".42"/><text x="${rightX(position)}" y="${right.bottom + 23}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="middle">${position}</text>`),
  ].join("");

  const sharedPoints = positions.map((position, index) => [
    leftX(position),
    yMap(shared[index], left),
  ]);
  const reservedPoints = positions.map((position, index) => [
    leftX(position),
    yMap(reserved[index], left),
  ]);
  const sharedMarkers = sharedPoints.map(([x, y]) => (
    `<circle cx="${x}" cy="${y}" r="7" fill="${theme.background}" stroke="${theme.accent}" stroke-width="4"/>`
  )).join("");
  const reservedMarkers = reservedPoints.map(([x, y]) => {
    const radius = 8;
    return `<polygon points="${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}" fill="${theme.background}" stroke="${theme.secondary}" stroke-width="4"/>`;
  }).join("");
  const zeroLeft = yMap(0, left);
  const zeroRight = yMap(0, right);
  const barWidth = Math.min(38, (right.right - right.left) / (positions.length * 2));
  const bars = positions.map((position, index) => {
    const value = interaction[index];
    const x = rightX(position) - barWidth / 2;
    const valueY = yMap(value, right);
    const y = Math.min(zeroRight, valueY);
    const barHeight = Math.max(2, Math.abs(valueY - zeroRight));
    const labelY = value >= 0 ? valueY - 11 : valueY + 22;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${theme.primary}" fill-opacity=".82" stroke="${theme.text}" stroke-width="1.5"/><text x="${rightX(position)}" y="${labelY}" fill="${theme.text}" font-family="Cascadia Mono, monospace" font-size="11" font-weight="700" text-anchor="middle">${signed(value, 1)}</text>`;
  }).join("");

  const content = `${analyticalHeader(spec, layout, {
    badge: "HYPOTHETICAL FACTORIAL DESIGN",
  })}
  <text x="54" y="143" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="850" letter-spacing=".9">CONSTRUCTED VALUES · NO MODEL TRAINED · NO MEASUREMENTS</text>
  <text x="${left.left}" y="184" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">POSITION CONTRAST BY CAPACITY MECHANISM</text>
  <text x="${right.left}" y="184" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800">RESERVED − SHARED</text>

  <rect x="${left.left}" y="${left.top}" width="${left.right - left.left}" height="${left.bottom - left.top}" rx="15" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${leftGrid}
  <line x1="${left.left}" y1="${zeroLeft}" x2="${left.right}" y2="${zeroLeft}" stroke="${theme.text}" stroke-width="2.5" opacity=".85"/>
  <path d="${linePath(sharedPoints)}" fill="none" stroke="${theme.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${linePath(reservedPoints)}" fill="none" stroke="${theme.secondary}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="12 9"/>
  ${sharedMarkers}${reservedMarkers}
  <rect x="425" y="218" width="300" height="63" rx="11" fill="${theme.background}" fill-opacity=".92" stroke="${theme.grid}"/>
  <line x1="442" y1="238" x2="482" y2="238" stroke="${theme.accent}" stroke-width="6"/><circle cx="462" cy="238" r="6" fill="${theme.background}" stroke="${theme.accent}" stroke-width="3"/>
  <text x="494" y="243" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12">shared first-come capacity</text>
  <line x1="442" y1="263" x2="482" y2="263" stroke="${theme.secondary}" stroke-width="5" stroke-dasharray="10 7"/><polygon points="462,256 469,263 462,270 455,263" fill="${theme.background}" stroke="${theme.secondary}" stroke-width="3"/>
  <text x="494" y="268" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12">position-blind reservation cut</text>

  <rect x="${right.left}" y="${right.top}" width="${right.right - right.left}" height="${right.bottom - right.top}" rx="15" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  ${rightGrid}
  <line x1="${right.left}" y1="${zeroRight}" x2="${right.right}" y2="${zeroRight}" stroke="${theme.text}" stroke-width="2.5" opacity=".85"/>
  ${bars}

  <text x="${(left.left + left.right) / 2}" y="${left.bottom + 53}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">admission position j · dimensionless (1 = first)</text>
  <text x="24" y="${(left.top + left.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 24 ${(left.top + left.bottom) / 2})">centered protected-score contrast c_j · percentage points</text>
  <text x="${(right.left + right.right) / 2}" y="${right.bottom + 53}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle">admission position j · dimensionless</text>
  <text x="797" y="${(right.top + right.bottom) / 2}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="middle" transform="rotate(-90 797 ${(right.top + right.bottom) / 2})">Γcap(j) · percentage points</text>

  <rect x="74" y="632" width="${width - 148}" height="91" rx="15" fill="${theme.panelAlt}" stroke="${theme.primary}" stroke-width="2"/>
  <text x="94" y="659" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="850" letter-spacing=".7">HYPOTHETICAL FACTORIAL-DESIGN ILLUSTRATION · NO MEASUREMENTS</text>
  <text x="94" y="683" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13">The constructed reservation cut attenuates the early-position advantage and late-position penalty.</text>
  <text x="94" y="706" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="12">A real run fixes presented tasks, eligible module IDs, exogenous exposure, capacity, optimizer, evaluator and budget.</text>
  <text x="${width - 42}" y="${height - 19}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="end">hypothetical percentage-point contrasts · not evidence or an effect-size target</text>`;
  return analyticalDocument(spec, layout, content);
}

function rsdT01FamilyPropertyOverlap(spec) {
  const layout = analyticalLayout(spec, {
    width: 1180,
    height: 840,
    kind: "family-property-overlap",
    theme: "violet",
  });
  const { width, height, theme } = layout;
  const { families, properties, overlap_examples: overlapExamples } = spec.parameters;
  const validRows = (rows, prefix) => Array.isArray(rows)
    && rows.length === 5
    && rows.every((row, index) => row?.id === `${prefix}${index + 1}`
      && typeof row.label === "string"
      && row.label.length > 0);
  if (
    !validRows(families, "F")
    || !validRows(properties, "P")
    || properties.some((row) => typeof row.values !== "string" || row.values.length === 0)
    || !Array.isArray(overlapExamples)
    || overlapExamples.length !== 2
    || overlapExamples.some((row) => (
      typeof row.label !== "string"
      || !Array.isArray(row.families)
      || !Array.isArray(row.properties)
      || row.families.some((id) => !families.some((family) => family.id === id))
      || row.properties.some((id) => !properties.some((property) => property.id === id))
    ))
  ) throw new Error(`${spec.id} requires five families, five properties, and two valid overlap examples`);

  const familyPalette = ["#ff718d", "#ffc96b", "#64d8cb", "#7bb7ff", "#c4a7ff"];
  const propertyPalette = ["#7bb7ff", "#64d8cb", "#ffc96b", "#c4a7ff", "#ff718d"];
  const familyY = (index) => 222 + index * 66;
  const propertyY = (index) => 215 + index * 69;

  const familyCards = families.map((family, index) => {
    const y = familyY(index);
    const color = familyPalette[index];
    return `<rect x="74" y="${y - 25}" width="312" height="48" rx="12" fill="${theme.background}" stroke="${color}" stroke-width="2.5"/>
    <circle cx="99" cy="${y - 1}" r="15" fill="${color}"/><text x="99" y="${y + 4}" fill="${theme.background}" font-family="Cascadia Mono, monospace" font-size="11" font-weight="900" text-anchor="middle">${family.id}</text>
    <text x="124" y="${y + 4}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700">${esc(family.label)}</text>
    <path d="M386 ${y - 1} C424 ${y - 1}, 430 315, 472 329" fill="none" stroke="${color}" stroke-width="3" stroke-opacity=".74" marker-end="url(#rsdArrow)"/>`;
  }).join("");

  const propertyCards = properties.map((property, index) => {
    const y = propertyY(index);
    const color = propertyPalette[index];
    return `<path d="M686 397 C727 397, 721 ${y}, 756 ${y}" fill="none" stroke="${color}" stroke-width="3.5" stroke-opacity=".88" marker-end="url(#rsdArrow)"/>
    <rect x="776" y="${y - 27}" width="338" height="54" rx="12" fill="${theme.background}" stroke="${color}" stroke-width="2.5"/>
    <rect x="788" y="${y - 16}" width="34" height="32" rx="8" fill="${color}"/><text x="805" y="${y + 4}" fill="${theme.background}" font-family="Cascadia Mono, monospace" font-size="11" font-weight="900" text-anchor="middle">${property.id}</text>
    <text x="836" y="${y - 3}" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800">${esc(property.label)}</text>
    <text x="836" y="${y + 16}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="${index === 4 ? 9 : 10.5}">${esc(property.values)}</text>`;
  }).join("");

  const overlapCard = (example, x, cardWidth, familyColors, propertyColors) => {
    const familyChips = example.families.map((id, index) => `<rect x="${x + 20 + index * 66}" y="706" width="52" height="28" rx="14" fill="${familyColors[index]}"/><text x="${x + 46 + index * 66}" y="725" fill="${theme.background}" font-family="Cascadia Mono, monospace" font-size="11" font-weight="900" text-anchor="middle">${id}</text>`).join("");
    const propertyStart = x + cardWidth - 24 - example.properties.length * 56;
    const propertyChips = example.properties.map((id, index) => `<rect x="${propertyStart + index * 56}" y="706" width="44" height="28" rx="7" fill="none" stroke="${propertyColors[index]}" stroke-width="2.5"/><text x="${propertyStart + 22 + index * 56}" y="725" fill="${propertyColors[index]}" font-family="Cascadia Mono, monospace" font-size="11" font-weight="900" text-anchor="middle">${id}</text>`).join("");
    return `<rect x="${x}" y="654" width="${cardWidth}" height="110" rx="15" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
    <text x="${x + 20}" y="682" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="850">${esc(example.label)}</text>
    ${familyChips}<path d="M${x + 155} 720 L${propertyStart - 14} 720" stroke="${theme.muted}" stroke-width="2.5" stroke-dasharray="7 6" marker-end="url(#rsdArrow)"/>${propertyChips}
    <text x="${x + 20}" y="751" fill="${theme.muted}" font-family="Segoe UI, sans-serif" font-size="11">possible overlap · evaluated separately, never copied from family</text>`;
  };

  const content = `${analyticalHeader(spec, layout, { badge: "RSD-T01 TARGET CONTRACT · NO RESULTS" })}
  <defs><marker id="rsdArrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L9,4.5 L0,9 Z" fill="${theme.muted}"/></marker></defs>
  <rect x="54" y="160" width="352" height="410" rx="18" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <rect x="445" y="160" width="271" height="410" rx="18" fill="${theme.panelAlt}" stroke="${theme.grid}" stroke-width="2"/>
  <rect x="756" y="160" width="380" height="410" rx="18" fill="${theme.panel}" stroke="${theme.grid}" stroke-width="2"/>
  <text x="74" y="188" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="850" letter-spacing=".8">SECONDARY · ONE GENERATOR-FAMILY ID</text>
  <text x="776" y="188" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="850" letter-spacing=".8">TARGET · FIVE CROSS-CUTTING COORDINATES</text>
  ${familyCards}
  <rect x="480" y="300" width="200" height="66" rx="15" fill="${theme.background}" stroke="${theme.accent}" stroke-width="3"/>
  <path d="M505 339 C535 309, 561 369, 592 332 S645 319, 657 339" fill="none" stroke="${theme.accent}" stroke-width="4"/>
  <text x="580" y="286" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800" text-anchor="middle">PAIRED TRAJECTORIES</text>
  <line x1="580" y1="366" x2="580" y2="389" stroke="${theme.muted}" stroke-width="4" marker-end="url(#rsdArrow)"/>
  <rect x="474" y="397" width="212" height="88" rx="17" fill="${theme.background}" stroke="${theme.primary}" stroke-width="3"/>
  <text x="580" y="427" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="900" text-anchor="middle">SEPARATE EVALUATOR</text>
  <text x="580" y="451" fill="${theme.text}" font-family="Segoe UI, sans-serif" font-size="12" text-anchor="middle">grid tests + equations / interventions</text>
  <text x="580" y="471" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10.5" text-anchor="middle">family name is not an input</text>
  ${propertyCards}
  <rect x="470" y="515" width="220" height="38" rx="19" fill="${theme.danger}" fill-opacity=".16" stroke="${theme.danger}" stroke-width="2"/>
  <text x="580" y="539" fill="${theme.danger}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="850" text-anchor="middle">NO FAMILY → PROPERTY LOOKUP</text>
  <text x="54" y="615" fill="${theme.primary}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="850" letter-spacing=".8">OVERLAP EXAMPLES · LOGICAL, NOT OBSERVED FREQUENCIES</text>
  ${overlapCard(overlapExamples[0], 54, 520, [familyPalette[0], familyPalette[4]], [propertyPalette[0], propertyPalette[3]])}
  ${overlapCard(overlapExamples[1], 594, 542, [familyPalette[2], familyPalette[3]], [propertyPalette[1], propertyPalette[2], propertyPalette[0]])}
  <text x="${width - 44}" y="${height - 24}" fill="${theme.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="end">conceptual target schema · no measurements · no trained model · no fixed mapping</text>`;
  return analyticalDocument(spec, layout, content);
}

function fastBoundaryLayerNorms(spec) {
  const {
    epsilon_min: min,
    epsilon_max: max,
    horizon_s: horizon,
    slow_time_constant_s: slowTimeConstant,
    samples,
  } = spec.parameters;
  if (
    !Number.isFinite(min)
    || !Number.isFinite(max)
    || !Number.isFinite(horizon)
    || !Number.isFinite(slowTimeConstant)
    || !Number.isInteger(samples)
    || min <= 0
    || max <= min
    || max > horizon
    || horizon <= 0
    || slowTimeConstant <= 0
    || samples < 32
  ) throw new Error(`${spec.id} requires a positive ordered epsilon range and horizon`);

  const epsilonValues = Array.from({ length: samples }, (_, index) => (
    10 ** (
      Math.log10(min)
      + (index / (samples - 1)) * (Math.log10(max) - Math.log10(min))
    )
  ));
  const rms = (epsilon) => Math.sqrt(
    (
      epsilon
      * slowTimeConstant
      * (1 - Math.exp((-2 * horizon) / (epsilon * slowTimeConstant)))
    ) / (2 * horizon),
  );
  const supPoints = epsilonValues.map((epsilon) => [
    logScale(epsilon, min, max),
    sy(1, 0, 1.05),
  ]);
  const rmsPoints = epsilonValues.map((epsilon) => [
    logScale(epsilon, min, max),
    sy(rms(epsilon), 0, 1.05),
  ]);
  const epsilonTicks = [1 / 128, 1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2]
    .filter((value) => value >= min && value <= max);
  const fractionLabel = (value) => {
    const inverse = Math.round(1 / value);
    return Math.abs(value - 1 / inverse) < 1e-12 ? `1/${inverse}` : value.toFixed(3);
  };
  const legend = `<line x1="690" y1="48" x2="728" y2="48" stroke="${colors.coral}" stroke-width="5"/><text x="739" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">supremum norm</text>
  <line x1="866" y1="48" x2="904" y2="48" stroke="${colors.cyan}" stroke-width="5"/><text x="915" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">RMS over T=1 s</text>`;
  const smallestRms = rms(min);
  const content = `${grid(
    epsilonTicks,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    (value) => logScale(value, min, max),
    (value) => sy(value, 0, 1.05),
    fractionLabel,
    (value) => value.toFixed(1),
  )}<path d="${linePath(supPoints)}" fill="none" stroke="${colors.coral}" stroke-width="6" stroke-linecap="round"/>
  <path d="${linePath(rmsPoints)}" fill="none" stroke="${colors.cyan}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${logScale(min, min, max)}" cy="${sy(1, 0, 1.05)}" r="7" fill="${colors.coral}"/>
  <circle cx="${logScale(min, min, max)}" cy="${sy(smallestRms, 0, 1.05)}" r="7" fill="${colors.cyan}"/>
  <rect x="640" y="382" width="365" height="127" rx="14" fill="${colors.background}" fill-opacity=".94" stroke="${colors.grid}" stroke-width="2"/>
  <text x="660" y="410" fill="${colors.amber}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800">SAME ERROR FUNCTION · DIFFERENT QUESTION</text>
  <text x="660" y="437" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="13">Peak magnitude stays exactly 1.</text>
  <text x="660" y="461" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="13">Its duration shrinks with epsilon.</text>
  <text x="660" y="488" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">A fixed-step sampler can miss both facts.</text>`;
  return frame(spec, content, {
    xLabel: "fast/slow ratio epsilon · logarithmic",
    yLabel: "dimensionless discrepancy norm",
    legend,
    badge: "EXACT NORM COUNTEREXAMPLE",
    footer: "Exact toy boundary layer · not a biological fit or experimental result",
  });
}

function repeatedStimulusSkippingCell(spec) {
  const {
    duration_s: duration,
    period_s: period,
    feedback_world_id: feedbackWorldId,
    feedforward_world_id: feedforwardWorldId,
  } = spec.parameters;
  const feedback = constructFixture026RsdT02SkippingCell(feedbackWorldId, period);
  const feedforward = constructFixture026RsdT02SkippingCell(feedforwardWorldId, period);
  if (feedback.duration_s !== duration || feedforward.duration_s !== duration) {
    throw new Error(`${spec.id} duration differs from the registered skipping constructor`);
  }
  const feedbackIntervals = feedback.periodic_cell.events.reference.intervals;
  const feedforwardIntervals = feedforward.periodic_cell.events.reference.intervals;
  if (feedbackIntervals.length !== feedforwardIntervals.length || feedbackIntervals.length === 0) {
    throw new Error(`${spec.id} requires aligned nonempty pulse intervals`);
  }

  const normalized = (interval, cell) => (
    interval.response_amplitude_u / cell.isolated_calibration.isolated_amplitude_u
  );
  const xMin = 0.5;
  const xMax = feedbackIntervals.length + 0.5;
  const yMin = 0;
  const yMax = 0.65;
  const feedbackPoints = feedbackIntervals.map((interval, index) => [
    sx(index + 1, xMin, xMax),
    sy(normalized(interval, feedback), yMin, yMax),
  ]);
  const feedforwardPoints = feedforwardIntervals.map((interval, index) => [
    sx(index + 1, xMin, xMax),
    sy(normalized(interval, feedforward), yMin, yMax),
  ]);
  const feedbackMarkers = feedbackIntervals.map((interval, index) => {
    const [x, y] = feedbackPoints[index];
    const fill = interval.response ? colors.amber : colors.panel;
    return `<circle cx="${x}" cy="${y}" r="7" fill="${fill}" stroke="${colors.amber}" stroke-width="3"/>`;
  }).join("");
  const feedforwardMarkers = feedforwardIntervals.map((interval, index) => {
    const [x, y] = feedforwardPoints[index];
    const fill = interval.response ? colors.cyan : colors.panel;
    return `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2" fill="${fill}" stroke="${colors.cyan}" stroke-width="3"/>`;
  }).join("");
  const thresholdY = sy(0.25, yMin, yMax);
  const legend = `<line x1="610" y1="48" x2="648" y2="48" stroke="${colors.amber}" stroke-width="5"/><circle cx="629" cy="48" r="6" fill="${colors.amber}"/><text x="660" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">${esc(feedbackWorldId)} · q=${feedback.skipping_signature.recurrence_order}</text>
  <line x1="842" y1="48" x2="880" y2="48" stroke="${colors.cyan}" stroke-width="5"/><rect x="856" y="43" width="10" height="10" rx="2" fill="${colors.panel}" stroke="${colors.cyan}" stroke-width="2"/><text x="892" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">${esc(feedforwardWorldId)} · q=${feedforward.skipping_signature.recurrence_order}</text>`;
  const content = `${grid(
    [1, 5, 10, 15, 20],
    [0, 0.1, 0.25, 0.4, 0.55],
    (value) => sx(value, xMin, xMax),
    (value) => sy(value, yMin, yMax),
    String,
    (value) => value.toFixed(2),
  )}<line x1="${plot.left}" y1="${thresholdY}" x2="${plot.right}" y2="${thresholdY}" stroke="${colors.coral}" stroke-width="3" stroke-dasharray="10 7"/>
  <text x="${plot.right - 12}" y="${thresholdY - 10}" fill="${colors.coral}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="end">registered response threshold = 0.25 A_iso</text>
  <path d="${linePath(feedbackPoints)}" fill="none" stroke="${colors.amber}" stroke-width="4" stroke-linejoin="round"/>
  <path d="${linePath(feedforwardPoints)}" fill="none" stroke="${colors.cyan}" stroke-width="4" stroke-linejoin="round"/>
  ${feedbackMarkers}${feedforwardMarkers}`;
  return frame(spec, content, {
    xLabel: `pulse index · d=${duration.toFixed(2)} s · T=${period.toFixed(2)} s`,
    yLabel: "response amplitude / isolated-pulse amplitude",
    legend,
    badge: "EXECUTED CONSTRUCTION CELL · NO_RESULT",
    footer: "Deterministic public-development constructor · no estimator, comparison, confirmation or biological fit",
  });
}

async function rsdT02LineageCoverage(spec) {
  const registry = JSON.parse(await readFile(path.join(
    root,
    "experiments",
    "workstation",
    "fixture-026",
    "configs",
    "rsd-t02-system-family-registry.json",
  ), "utf8"));
  const summary = summarizeFixture026RsdT02FamilyCoverage(registry);
  if (
    spec.parameters.minimum_lineages !== summary.minimum_distinct_structural_lineages_per_value
    || summary.properties.length !== 4
  ) throw new Error(`${spec.id} parameters drifted from the family registry`);

  const desiredRows = [
    ["drive_transform", "affine-fold", "drive · affine"],
    ["drive_transform", "log-fold", "drive · log"],
    ["reported_output_feedback_edge", "false", "feedback · absent"],
    ["reported_output_feedback_edge", "true", "feedback · present"],
    ["channel_local_state", "false", "channel state · shared"],
    ["channel_local_state", "true", "channel state · local"],
    ["causal_memory", "false", "causal memory · absent"],
    ["causal_memory", "true", "causal memory · present"],
  ];
  const rows = desiredRows.map(([propertyKey, value, label]) => {
    const property = summary.properties.find(({ property_key: key }) => key === propertyKey);
    const observed = property.values.find(({ value: registeredValue }) => registeredValue === value);
    return {
      label,
      count: observed?.distinct_structural_lineage_count ?? 0,
      familyCount: observed?.family_count ?? 0,
      covered: observed?.meets_minimum ?? false,
    };
  });
  const left = 415;
  const right = 1010;
  const top = 166;
  const bottom = 540;
  const maximum = Math.max(
    summary.minimum_distinct_structural_lineages_per_value,
    ...rows.map(({ count }) => count),
  );
  const x = (value) => left + (value / maximum) * (right - left);
  const rowHeight = (bottom - top) / rows.length;
  const ticks = Array.from({ length: maximum + 1 }, (_, index) => index);
  const gridLines = ticks.map((tick) => {
    const position = x(tick);
    return `<line x1="${position}" y1="${top - 10}" x2="${position}" y2="${bottom + 2}" stroke="${colors.grid}" stroke-width="1"/>
    <text x="${position}" y="574" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="middle">${tick}</text>`;
  }).join("");
  const thresholdX = x(summary.minimum_distinct_structural_lineages_per_value);
  const bars = rows.map((row, index) => {
    const y = top + index * rowHeight + 6;
    const barWidth = Math.max(2, x(row.count) - left);
    const fill = row.covered ? colors.green : colors.coral;
    const valueLabel = `${row.count} lineage${row.count === 1 ? "" : "s"} · ${row.familyCount} famil${row.familyCount === 1 ? "y" : "ies"}`;
    const placeLabelInside = row.count === maximum;
    const valueLabelX = placeLabelInside ? right - 10 : Math.max(left + 10, x(row.count) + 10);
    const valueLabelWidth = valueLabel.length * 7.25 + 10;
    const valueLabelBackingX = placeLabelInside
      ? valueLabelX - valueLabelWidth + 5
      : valueLabelX - 5;
    const separator = index > 0 && index % 2 === 0
      ? `<line x1="72" y1="${y - 8}" x2="${right}" y2="${y - 8}" stroke="${colors.grid}" stroke-width="1" opacity=".8"/>`
      : "";
    return `${separator}<text x="${left - 18}" y="${y + 19}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="13" text-anchor="end">${esc(row.label)}</text>
    <rect x="${left}" y="${y}" width="${barWidth}" height="25" rx="6" fill="${fill}" opacity=".92"/>
    <rect x="${valueLabelBackingX}" y="${y + 2}" width="${valueLabelWidth}" height="21" rx="4" fill="${colors.panel}" opacity=".94"/>
    <text x="${valueLabelX}" y="${y + 18}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="${placeLabelInside ? "end" : "start"}">${valueLabel}</text>`;
  }).join("");
  const content = `${gridLines}
  <line x1="${thresholdX}" y1="${top - 16}" x2="${thresholdX}" y2="${bottom + 4}" stroke="${colors.amber}" stroke-width="4" stroke-dasharray="9 7"/>
  <text x="${thresholdX + 10}" y="${top - 22}" fill="${colors.amber}" font-family="Cascadia Mono, monospace" font-size="12">frozen floor = ${summary.minimum_distinct_structural_lineages_per_value}</text>${bars}`;
  const legend = `<circle cx="728" cy="48" r="6" fill="${colors.green}"/><text x="740" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">meets floor</text>
  <circle cx="836" cy="48" r="6" fill="${colors.coral}"/><text x="848" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">thin / absent</text>`;
  return frame(spec, content, {
    xLabel: "distinct structural lineages after equivalence collapse",
    yLabel: "registered property value",
    legend,
    badge: "EXACT REGISTRY COVERAGE · NO_RESULT",
    footer: `${registry.families.length} public families · coverage prerequisite, not power or performance`,
  });
}

function rsdT02ProceduralSeedMap(spec) {
  const {
    seed_start: seedStart,
    seed_count: seedCount,
    background_u: backgroundU,
    time_constant_s: timeConstantS,
    fit_count: fitCount,
    calibration_count: calibrationCount,
    evaluation_count: evaluationCount,
  } = spec.parameters;
  if (
    !Number.isSafeInteger(seedStart)
    || !Number.isSafeInteger(seedCount)
    || !Number.isFinite(backgroundU)
    || !Number.isFinite(timeConstantS)
    || !Number.isSafeInteger(fitCount)
    || !Number.isSafeInteger(calibrationCount)
    || !Number.isSafeInteger(evaluationCount)
    || seedStart < 0
    || seedCount < 2
    || backgroundU <= 0
    || timeConstantS <= 0
    || fitCount + calibrationCount + evaluationCount !== seedCount
  ) throw new Error(`${spec.id} has an invalid seed or partition contract`);

  const mappings = Array.from({ length: seedCount }, (_, index) => {
    const seed = String(seedStart + index);
    const initializationId = fixture026RsdT02InitializationId(seed, backgroundU, timeConstantS);
    const permutation = fixture026RsdT02OpaqueStatePermutation(initializationId);
    return { index: index + 1, seed, h0Target: permutation[0], permutation };
  });
  const distinctMappings = new Set(mappings.map(({ permutation }) => permutation.join("→")));
  if (distinctMappings.size !== 2) {
    throw new Error(`${spec.id} expected exactly two opaque state permutations`);
  }
  const mappingCounts = [0, 1].map((target) => (
    mappings.filter(({ h0Target }) => h0Target === target).length
  ));

  const xMin = 0.5;
  const xMax = seedCount + 0.5;
  const yMap = (value) => sy(value, -0.35, 1.35);
  const roles = [
    { label: `FIT · ${fitCount}`, start: 1, count: fitCount, color: colors.green },
    {
      label: `CALIBRATION · ${calibrationCount}`,
      start: fitCount + 1,
      count: calibrationCount,
      color: colors.amber,
    },
    {
      label: `EVALUATION · ${evaluationCount}`,
      start: fitCount + calibrationCount + 1,
      count: evaluationCount,
      color: colors.violet,
    },
  ];
  const bands = roles.map(({ label, start, count, color }) => {
    const left = sx(start - 0.5, xMin, xMax);
    const right = sx(start + count - 0.5, xMin, xMax);
    return `<rect x="${left}" y="${plot.top}" width="${right - left}" height="${plot.bottom - plot.top}" fill="${color}" opacity=".09"/>
    <line x1="${left}" y1="${plot.top}" x2="${left}" y2="${plot.bottom}" stroke="${color}" stroke-width="2" opacity=".8"/>
    <text x="${(left + right) / 2}" y="${plot.top + 25}" fill="${color}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800" text-anchor="middle">${esc(label)}</text>`;
  }).join("");
  const points = mappings.map(({ index, h0Target }) => {
    const x = sx(index, xMin, xMax);
    const y = yMap(h0Target);
    const color = h0Target === 0 ? colors.cyan : colors.coral;
    const shape = h0Target === 0
      ? `<circle cx="${x}" cy="${y}" r="5.5" fill="${color}"/>`
      : `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2" fill="${color}"/>`;
    return `<line x1="${x}" y1="${yMap(0)}" x2="${x}" y2="${yMap(1)}" stroke="${colors.grid}" stroke-width="1" opacity=".35"/>${shape}`;
  }).join("");
  const boundaries = [fitCount + 0.5, fitCount + calibrationCount + 0.5]
    .map((value) => `<line x1="${sx(value, xMin, xMax)}" y1="${plot.top}" x2="${sx(value, xMin, xMax)}" y2="${plot.bottom}" stroke="${colors.text}" stroke-width="3" stroke-dasharray="8 7" opacity=".8"/>`)
    .join("");
  const ticks = [1, 8, 16, 24, 32, 40, 48, 56, 64].filter((value) => value <= seedCount);
  const annotationX = plot.left + 235;
  const annotationY = yMap(0.5) - 31;
  const legend = `<circle cx="668" cy="48" r="6" fill="${colors.cyan}"/><text x="680" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">H0→state 0 · n=${mappingCounts[0]}</text>
  <rect x="835" y="42" width="12" height="12" rx="2" fill="${colors.coral}"/><text x="856" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">H0→state 1 · n=${mappingCounts[1]}</text>`;
  const content = `${bands}${grid(
    ticks,
    [0, 1],
    (value) => sx(value, xMin, xMax),
    yMap,
    String,
    (value) => `state ${value}`,
  )}${boundaries}${points}
  <rect x="${annotationX}" y="${annotationY}" width="500" height="62" rx="12" fill="${colors.background}" fill-opacity=".96" stroke="${colors.grid}" stroke-width="2"/>
  <text x="${annotationX + 20}" y="${annotationY + 27}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="800">64 procedural labels → 2 opaque handle maps</text>
  <text x="${annotationX + 20}" y="${annotationY + 50}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">independently sampled system instances in this seed axis: 0</text>`;
  return frame(spec, content, {
    xLabel: `ordered public seed label · ${seedStart}…${seedStart + seedCount - 1}`,
    yLabel: "internal coordinate targeted by opaque handle H0",
    legend,
    badge: "EXACT CONSTRUCTOR MAP · INFORMATION CUT",
    footer: "Computed from F-026 initialization IDs · procedural partitions are not replication",
  });
}

function rsdT02PolicyWorkEnvelope(spec) {
  const {
    common_traversal_scalar_operations: common,
    scalar_operation_cap: cap,
    arms,
  } = spec.parameters;
  if (
    !Number.isSafeInteger(common)
    || !Number.isSafeInteger(cap)
    || common < 1
    || cap <= common
    || !Array.isArray(arms)
    || arms.length !== 9
    || arms.some((arm) => (
      typeof arm.id !== "string"
      || !Number.isSafeInteger(arm.total_scalar_operations)
      || arm.total_scalar_operations < common
      || arm.total_scalar_operations > cap
      || !Number.isSafeInteger(arm.transcendental_evaluations)
      || arm.transcendental_evaluations < 0
      || !["raw", "transform", "model", "candidate"].includes(arm.group)
    ))
  ) throw new Error(`${spec.id} has an invalid work-accounting contract`);

  const left = 260;
  const right = 1015;
  const top = 168;
  const bottom = 536;
  const maximumSpecific = Math.ceil(Math.max(...arms.map(
    (arm) => arm.total_scalar_operations - common,
  )) / 5000) * 5000;
  const x = (value) => left + (value / maximumSpecific) * (right - left);
  const rowHeight = (bottom - top) / arms.length;
  const palette = {
    raw: colors.coral,
    transform: colors.cyan,
    model: colors.violet,
    candidate: colors.amber,
  };
  const ticks = Array.from({ length: 6 }, (_, index) => (
    Math.round((maximumSpecific * index) / 5 / 1000) * 1000
  ));
  const gridLines = ticks.map((tick) => {
    const position = x(tick);
    return `<line x1="${position}" y1="${top - 8}" x2="${position}" y2="${bottom + 4}" stroke="${colors.grid}" stroke-width="1"/>
    <text x="${position}" y="572" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${(tick / 1000).toFixed(0)}k</text>`;
  }).join("");
  const bars = arms.map((arm, index) => {
    const specific = arm.total_scalar_operations - common;
    const y = top + index * rowHeight + 5;
    const barWidth = Math.max(2, x(specific) - left);
    const label = `${arm.total_scalar_operations.toLocaleString("en-US")} total · ${arm.transcendental_evaluations.toLocaleString("en-US")} trans`;
    return `<text x="${left - 14}" y="${y + 18}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="12" text-anchor="end">${esc(arm.id)}</text>
    <rect x="${left}" y="${y}" width="${barWidth}" height="22" rx="5" fill="${palette[arm.group]}" opacity=".9"/>
    <text x="${Math.min(x(specific) + 9, right - 183)}" y="${y + 17}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="10">${esc(label)}</text>`;
  }).join("");
  const legend = `<circle cx="604" cy="48" r="6" fill="${colors.coral}"/><text x="616" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">raw</text>
  <circle cx="674" cy="48" r="6" fill="${colors.cyan}"/><text x="686" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">transform</text>
  <circle cx="780" cy="48" r="6" fill="${colors.violet}"/><text x="792" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">model</text>
  <circle cx="858" cy="48" r="6" fill="${colors.amber}"/><text x="870" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">candidate</text>`;
  const content = `${gridLines}${bars}
  <text x="${left}" y="${top - 17}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11">common traversal = ${common.toLocaleString("en-US")} scalar ops · cap = ${cap.toLocaleString("en-US")}</text>`;
  return frame(spec, content, {
    xLabel: "policy-specific scalar operations above the common packet traversal",
    yLabel: "fixed Stage-2b policy",
    legend,
    badge: "EXACT CONTRACT ACCOUNTING · NO_RESULT",
    footer: "Declared operation counts · not latency, energy, accuracy or confirmation evidence",
  });
}

function rsdT02PowerEffectCurve(spec) {
  const {
    family_count: familyCount,
    familywise_alpha: familywiseAlpha,
    target_power: targetPower,
    pre_response_attrition_rate: attritionRate,
    retention_assurance: retentionAssurance,
    effect_min: effectMin,
    effect_max: effectMax,
    samples,
    variance_profiles: varianceProfiles,
  } = spec.parameters;
  if (
    !Number.isSafeInteger(familyCount)
    || familyCount < 2
    || !Number.isFinite(familywiseAlpha)
    || familywiseAlpha <= 0
    || familywiseAlpha >= 1
    || !Number.isFinite(targetPower)
    || targetPower <= 0.5
    || targetPower >= 1
    || !Number.isFinite(attritionRate)
    || attritionRate < 0
    || attritionRate >= 0.5
    || !Number.isFinite(retentionAssurance)
    || retentionAssurance <= 0.5
    || retentionAssurance >= 1
    || !Number.isFinite(effectMin)
    || !Number.isFinite(effectMax)
    || effectMin <= 0
    || effectMax <= effectMin
    || !Number.isSafeInteger(samples)
    || samples < 20
    || !Array.isArray(varianceProfiles)
    || varianceProfiles.length !== 3
    || varianceProfiles.some((profile) => (
      typeof profile.id !== "string"
      || !Number.isFinite(profile.per_family_variance)
      || profile.per_family_variance <= 0
    ))
  ) throw new Error(`${spec.id} has an invalid prospective power-curve contract`);

  const zAlpha = fixture026RsdT02InverseNormal(1 - familywiseAlpha / 4);
  const zPower = fixture026RsdT02InverseNormal(targetPower);
  const effects = Array.from({ length: samples }, (_, index) => (
    effectMin + (effectMax - effectMin) * index / (samples - 1)
  ));
  const count = (effect, variance, attrition = attritionRate) => {
    const coefficient = variance / familyCount;
    const effective = Math.max(2, Math.ceil(coefficient * ((zAlpha + zPower) / effect) ** 2));
    return fixture026RsdT02PlannedCountForRetention({
      effectiveCount: effective,
      attritionRate: attrition,
      perFamilyFailureProbability: (1 - retentionAssurance) / familyCount,
    });
  };
  const series = varianceProfiles.map((profile) => ({
    ...profile,
    points: effects.map((effect) => [effect, count(effect, profile.per_family_variance)]),
  }));
  const minimumY = 2;
  const maximumY = 1000;
  const y = (value) => sy(Math.log10(value), Math.log10(minimumY), Math.log10(maximumY));
  const x = (value) => sx(value, effectMin, effectMax);
  const xTicks = [0.025, 0.05, 0.075, 0.1, 0.15, 0.2]
    .filter((value) => value >= effectMin && value <= effectMax);
  const yTicks = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const gridLines = `${xTicks.map((tick) => `<line x1="${x(tick)}" y1="${plot.top}" x2="${x(tick)}" y2="${plot.bottom}" stroke="${colors.grid}" stroke-width="1"/>
  <text x="${x(tick)}" y="579" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="middle">${tick.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "")}</text>`).join("")}
  ${yTicks.map((tick) => `<line x1="${plot.left}" y1="${y(tick)}" x2="${plot.right}" y2="${y(tick)}" stroke="${colors.grid}" stroke-width="1"/>
  <text x="${plot.left - 12}" y="${y(tick) + 4}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick}</text>`).join("")}`;
  const palette = [colors.green, colors.amber, colors.coral];
  const low = series[0].points.map(([effect, n]) => [x(effect), y(n)]);
  const high = [...series[2].points].reverse().map(([effect, n]) => [x(effect), y(n)]);
  const bandPath = `${linePath(low)} ${high.map(([px, py]) => `L${px.toFixed(2)},${py.toFixed(2)}`).join(" ")} Z`;
  const curves = series.map((profile, index) => `<path d="${linePath(profile.points.map(([effect, n]) => [x(effect), y(n)]))}" fill="none" stroke="${palette[index]}" stroke-width="${index === 1 ? 5 : 3}" stroke-linecap="round"/>`).join("");
  const base = series[1];
  const noAttrition = effects.map((effect) => [
    x(effect),
    y(count(effect, base.per_family_variance, 0)),
  ]);
  const referenceEffect = 0.1;
  const referenceCount = count(referenceEffect, base.per_family_variance);
  const referenceX = x(referenceEffect);
  const referenceY = y(referenceCount);
  const content = `${gridLines}
  <path d="${bandPath}" fill="${colors.violet}" opacity=".10"/>
  ${curves}
  <path d="${linePath(noAttrition)}" fill="none" stroke="${colors.cyan}" stroke-width="2" stroke-dasharray="9 7"/>
  <line x1="${referenceX}" y1="${referenceY}" x2="${referenceX}" y2="${plot.bottom}" stroke="${colors.text}" stroke-width="2" stroke-dasharray="5 6" opacity=".8"/>
  <circle cx="${referenceX}" cy="${referenceY}" r="7" fill="${colors.text}" stroke="${colors.background}" stroke-width="3"/>
  <rect x="${referenceX + 16}" y="${referenceY - 45}" width="270" height="62" rx="10" fill="${colors.background}" fill-opacity=".96" stroke="${colors.grid}"/>
  <text x="${referenceX + 30}" y="${referenceY - 20}" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="800">δ = 0.10 · baseline n = ${referenceCount}/family</text>
  <text x="${referenceX + 30}" y="${referenceY + 2}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="10">support floor is a gate, not an n multiplier</text>`;
  const profileLegend = varianceProfiles.map((profile, index) => {
    const legendX = 570 + index * 150;
    return `<line x1="${legendX}" y1="48" x2="${legendX + 24}" y2="48" stroke="${palette[index]}" stroke-width="${index === 1 ? 5 : 3}"/><text x="${legendX + 32}" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="10">${esc(profile.id)} σ²=${profile.per_family_variance}</text>`;
  }).join("");
  const legend = `<line x1="430" y1="48" x2="454" y2="48" stroke="${colors.cyan}" stroke-width="2" stroke-dasharray="9 7"/><text x="462" y="52" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="10">base · no attrition</text>${profileLegend}`;
  return frame(spec, content, {
    xLabel: "minimum relevant candidate improvement δ (lower loss is better)",
    yLabel: "planned independent system instances per family · log scale",
    legend,
    badge: "NORMAL COUNT · NO_RESULT",
    footer: `Variance-only normal diagnostic · Holm α/4=${(familywiseAlpha / 4).toFixed(4)} · target=${targetPower.toFixed(2)} · bootstrap calibration open`,
  });
}

async function rsdT02BootstrapCalibration(spec) {
  const {
    config_path: configPath,
    null_reference: nullReference,
    illustrative_alternative_reference: alternativeReference,
  } = spec.parameters;
  if (
    typeof configPath !== "string"
    || !configPath.startsWith("experiments/workstation/fixture-026/configs/")
    || configPath.includes("..")
    || !Number.isFinite(nullReference)
    || nullReference <= 0
    || nullReference >= 1
    || !Number.isFinite(alternativeReference)
    || alternativeReference <= nullReference
    || alternativeReference >= 1
  ) throw new Error(`${spec.id} has an invalid calibration-plot contract`);
  const configuration = JSON.parse(await readFile(path.join(root, configPath), "utf8"));
  if (configuration.familywise_alpha !== nullReference) {
    throw new Error(`${spec.id} null reference differs from the analyzer familywise alpha`);
  }
  const report = calibrateFixture026RsdT02PilotTranscripts(configuration);
  if (!report.method_calibration_completed || report.result_label !== "NO_RESULT") {
    throw new Error(`${spec.id} requires a completed public NO_RESULT method calibration`);
  }
  const byId = new Map(report.scenario_reports.map((row) => [row.scenario_id, row]));
  const decisionRows = [
    {
      id: "public-synthetic-null",
      label: "SYNTHETIC NULL",
      target: nullReference,
      color: colors.coral,
    },
    {
      id: "public-synthetic-minimum-relevant-effects",
      label: "MINIMUM EFFECTS",
      target: alternativeReference,
      color: colors.amber,
    },
  ].map((row) => {
    const scenario = byId.get(row.id);
    if (!scenario) throw new Error(`${spec.id} is missing ${row.id}`);
    return {
      ...row,
      summary: scenario.family_wise_any_rejection_probability,
    };
  });
  const hostileRows = [
    {
      id: "hostile-two-instance-bootstrap-zero-se-resamples",
      label: "SMALL-N BOOTSTRAP",
      color: colors.violet,
    },
    {
      id: "hostile-two-instance-zero-variance",
      label: "ZERO VARIANCE",
      color: colors.coral,
    },
  ].map((row) => {
    const scenario = byId.get(row.id);
    if (!scenario) throw new Error(`${spec.id} is missing ${row.id}`);
    return { ...row, scenario };
  });

  const chartTop = 205;
  const chartBottom = 500;
  const y = (value) => chartBottom - value * (chartBottom - chartTop);
  const leftStart = 140;
  const leftEnd = 590;
  const rightStart = 665;
  const rightEnd = 1012;
  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const grids = gridTicks.map((tick) => {
    const py = y(tick);
    return `<line x1="${leftStart}" y1="${py}" x2="${leftEnd}" y2="${py}" stroke="${colors.grid}" stroke-width="1"/>
    <line x1="${rightStart}" y1="${py}" x2="${rightEnd}" y2="${py}" stroke="${colors.grid}" stroke-width="1"/>
    <text x="${leftStart - 12}" y="${py + 4}" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="11" text-anchor="end">${tick.toFixed(2)}</text>`;
  }).join("");
  const leftCenters = [260, 465];
  const decisionBars = decisionRows.map((row, index) => {
    const cx = leftCenters[index];
    const frequency = row.summary.observed_event_frequency;
    const [low, high] = row.summary.monte_carlo_wilson_interval;
    const barTop = y(frequency);
    const targetY = y(row.target);
    return `<rect x="${cx - 48}" y="${barTop}" width="96" height="${chartBottom - barTop}" rx="9" fill="${row.color}" opacity=".92"/>
    <line x1="${cx}" y1="${y(low)}" x2="${cx}" y2="${y(high)}" stroke="${colors.text}" stroke-width="4"/>
    <line x1="${cx - 15}" y1="${y(low)}" x2="${cx + 15}" y2="${y(low)}" stroke="${colors.text}" stroke-width="4"/>
    <line x1="${cx - 15}" y1="${y(high)}" x2="${cx + 15}" y2="${y(high)}" stroke="${colors.text}" stroke-width="4"/>
    <line x1="${cx - 60}" y1="${targetY}" x2="${cx + 60}" y2="${targetY}" stroke="${colors.cyan}" stroke-width="4" stroke-dasharray="8 6"/>
    <text x="${cx}" y="${Math.max(chartTop + 18, barTop - 15)}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="15" font-weight="800" text-anchor="middle">${row.summary.event_count}/${row.summary.monte_carlo_replicate_count} · ${frequency.toFixed(3)}</text>
    <text x="${cx}" y="529" fill="${row.color}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" text-anchor="middle">${row.label}</text>
    <text x="${cx}" y="547" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="middle">reference ${row.target.toFixed(2)}</text>`;
  }).join("");
  const rightCenters = [755, 930];
  const hostileBars = hostileRows.map((row, index) => {
    const cx = rightCenters[index];
    const count = row.scenario.bootstrap_resolution_failure_replicate_count;
    const denominator = report.simulation_replicates_per_scenario;
    const fraction = count / denominator;
    const barTop = y(fraction);
    return `<rect x="${cx - 42}" y="${barTop}" width="84" height="${chartBottom - barTop}" rx="9" fill="${row.color}" opacity=".92"/>
    <rect x="${cx - 46}" y="${chartTop + 17}" width="92" height="31" rx="8" fill="${colors.background}" fill-opacity=".92"/>
    <text x="${cx}" y="${chartTop + 39}" fill="${colors.text}" font-family="Cascadia Mono, monospace" font-size="14" font-weight="800" text-anchor="middle">${count}/${denominator}</text>
    <text x="${cx}" y="529" fill="${row.color}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="800" text-anchor="middle">${row.label}</text>
    <text x="${cx}" y="547" fill="${colors.muted}" font-family="Cascadia Mono, monospace" font-size="10" text-anchor="middle">resolution failure</text>`;
  }).join("");
  const content = `${grids}
  <line x1="625" y1="176" x2="625" y2="548" stroke="${colors.grid}" stroke-width="2"/>
  <text x="${(leftStart + leftEnd) / 2}" y="183" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800" text-anchor="middle">ANY HYPOTHESIS REJECTED</text>
  <text x="${(rightStart + rightEnd) / 2}" y="183" fill="${colors.text}" font-family="Segoe UI, sans-serif" font-size="15" font-weight="800" text-anchor="middle">BOOTSTRAP RESOLUTION FAILED</text>
  ${decisionBars}${hostileBars}`;
  return frame(spec, content, {
    xLabel: `${report.simulation_replicates_per_scenario} deterministic public synthetic replicates per scenario`,
    yLabel: "replicate frequency",
    badge: "SYNTHETIC DIAGNOSTIC · NO_RESULT",
    footer: `Exact Holm/bootstrap method check · config ${report.configuration_sha256.slice(0, 12)}… · not scientific power`,
  });
}

const renderers = {
  "finite-error-erasure": finiteError,
  "adiabatic-crossover": adiabatic,
  "sparse-locality-break-even": sparseBreakEven,
  "lifecycle-break-even": lifecycle,
  "candidate-010-metering-scale": meteringScale,
  "fixture-007-identifiability": fixtureIdentifiability,
  "fixture-012-layout-selection": fixtureLayoutSelection,
  "cross-platform-reach-overlap": crossPlatformReach,
  "spatial-support-transfer": spatialSupportTransfer,
  "stress-path-memory": stressPathMemory,
  "pareto-dominance-uncertainty": paretoDominanceUncertainty,
  "active-acquisition-frontier": activeAcquisitionFrontier,
  "recovery-time-fragility": recoveryTimeFragility,
  "memory-action-price-envelope": memoryActionPriceEnvelope,
  "hysteretic-memory-loop": hystereticMemoryLoop,
  "finite-diffusion-boundary-turnover": finiteDiffusionBoundaryTurnover,
  "memory-kernel-truncation": memoryKernelTruncation,
  "slow-manifold-fold-boundary": slowManifoldFoldBoundary,
  "mission-profile-damage": missionProfileDamage,
  "interface-qualified-scale-symmetry": interfaceQualifiedScaleSymmetry,
  "rsd-t01-family-property-overlap": rsdT01FamilyPropertyOverlap,
  "fast-boundary-layer-norms": fastBoundaryLayerNorms,
  "repeated-stimulus-skipping-cell": repeatedStimulusSkippingCell,
  "rsd-t02-lineage-coverage": rsdT02LineageCoverage,
  "rsd-t02-procedural-seed-map": rsdT02ProceduralSeedMap,
  "rsd-t02-policy-work-envelope": rsdT02PolicyWorkEnvelope,
  "rsd-t02-power-effect-curve": rsdT02PowerEffectCurve,
  "rsd-t02-bootstrap-calibration": rsdT02BootstrapCalibration,
  "interface-qualified-retroactivity": interfaceQualifiedRetroactivity,
  "history-conditioned-position-contrast": historyConditionedPositionContrast,
  "phase-selective-preservation": phaseSelectivePreservation,
};

function githubHeadingSlug(heading) {
  return stripHtmlTagSyntax(heading)
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[`*_~]/gu, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/gu, "-");
}

async function validatePlotSource(spec) {
  if (typeof spec.source !== "string" || spec.source.length === 0) {
    throw new Error(`${spec.id} is missing a source path`);
  }
  const [relativePath, requestedAnchor] = spec.source.split("#", 2);
  const absolutePath = path.resolve(root, relativePath);
  if (path.relative(root, absolutePath).startsWith("..")) {
    throw new Error(`${spec.id} source escapes the repository: ${spec.source}`);
  }
  const source = await readFile(absolutePath, "utf8");
  if (!requestedAnchor) return;

  const counts = new Map();
  const anchors = new Set();
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gmu)) {
    const base = githubHeadingSlug(match[1]);
    const duplicateIndex = counts.get(base) ?? 0;
    counts.set(base, duplicateIndex + 1);
    anchors.add(duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`);
  }
  if (!anchors.has(requestedAnchor)) {
    throw new Error(`${spec.id} source anchor does not resolve: ${spec.source}`);
  }
}

async function readCommittedPlot(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const stalePlots = [];
for (const spec of specs) {
  await validatePlotSource(spec);
  const renderer = renderers[spec.id];
  if (!renderer) throw new Error(`No plot renderer for ${spec.id}`);
  const svg = `${await renderer(spec)}\n`;
  const plotPath = path.join(outputDirectory, `${spec.id}.svg`);
  if (!checkOnly) await writeFile(plotPath, svg, "utf8");
  else if ((await readCommittedPlot(plotPath)) !== svg) stalePlots.push(path.relative(root, plotPath));
}

if (stalePlots.length > 0) {
  console.error(`Plots are missing or stale; run npm run generate:plots:\n${stalePlots.join("\n")}`);
  process.exit(1);
}
const verb = checkOnly ? "Validated" : "Generated";
console.log(`${verb} ${specs.length} plots in ${path.relative(root, outputDirectory)}.`);
