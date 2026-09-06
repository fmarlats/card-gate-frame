import { normalizeDimensions, normalizeFamilyOptions } from "../family-options.js";

export { compatibleCrestsForFamily, isCompatibleCrest, isGateFamily } from "../family-options.js";

import { canonicalizePath, canonicalNumber, deepFreeze, mirrorPath } from "../geometry-utils.js";
import type {
  GateDimensions,
  GateGenerationOptionsV3,
  GateGeometryV3,
  GatePath,
  GatePathCommand,
} from "../types.js";
import { sampleScalar } from "./sampler.js";

export function generateGateV3(
  dimensions: GateDimensions,
  optionsInput: GateGenerationOptionsV3,
): Readonly<GateGeometryV3> {
  const { seed, options } = normalizeFamilyOptions(optionsInput, 3);
  dimensions = normalizeDimensions(dimensions);
  const { width, height } = dimensions;
  const edge = 9;
  const railY = canonicalNumber(Math.max(edge + 32, height * 0.3));
  const bottomY = canonicalNumber(height - edge);
  const frameBand = canonicalNumber(Math.max(12, Math.min(24, Math.min(width, height) * 0.06)));
  const safeLeft = canonicalNumber(edge + frameBand);
  const safeRight = canonicalNumber(width - safeLeft);
  const safeTop = canonicalNumber(railY + frameBand);
  const safeBottom = canonicalNumber(bottomY - frameBand);
  const source = {
    seed,
    options,
    dimensions,
    bounds: { left: edge, right: canonicalNumber(width - edge), railY, bottomY },
    contentInsets: {
      left: safeLeft,
      right: canonicalNumber(width - safeRight),
      top: safeTop,
      bottom: canonicalNumber(height - safeBottom),
    },
    surfacePath: canonicalizePath([
      m(edge, railY),
      l(width - edge, railY),
      l(width - edge, bottomY),
      l(edge, bottomY),
      z,
      m(safeLeft, safeTop),
      l(safeLeft, safeBottom),
      l(safeRight, safeBottom),
      l(safeRight, safeTop),
      z,
    ]),
    structuralPaths: [
      canonicalizePath([
        m(edge, bottomY),
        l(edge, railY),
        l(width - edge, railY),
        l(width - edge, bottomY),
        z,
      ]),
    ],
  };
  const { railY: rail, bottomY: bottom } = source.bounds;
  const { family, crest, density, curvature, peakHeight, sideComplexity } = source.options;
  const upper = (rail - edge) * (0.94 + peakHeight * 0.06);
  const center = width / 2;
  const half = center - edge;
  const band = source.contentInsets.left - edge;
  const structure: GatePath[] = [source.structuralPaths[0] as GatePath];
  const ornaments: GatePath[] = [];
  const fine: GatePath[] = [];
  const solid: GatePath[] = [];
  const centered = (collection: GatePath[], paths: readonly GatePath[]): void => {
    for (const path of paths) {
      const canonical = canonicalizePath(path);
      collection.push(canonical);
      if (Math.round(width * 10_000) % 2 === 1) collection.push(mirrorPath(canonical, width));
    }
  };
  const rightHeightFactor =
    1 -
    (1 - options.symmetry) * (0.06 + 0.04 * sampleScalar(seed, `${family}/proportion/right-lift`));
  const pair = (collection: GatePath[], path: GatePath): void => {
    const canonical = canonicalizePath(path);
    const right = mirrorPath(canonical, width);
    const isUpper = path.every((command) =>
      Object.entries(command).every(
        ([key, value]) => !key.startsWith("y") || Number(value) <= rail,
      ),
    );
    collection.push(
      canonical,
      isUpper && options.symmetry < 1
        ? place(right, 0, rail * (1 - rightHeightFactor), 1, rightHeightFactor)
        : right,
    );
  };

  // A second bar and small collars give the border the rhythm of assembled ironwork.
  const barX = edge + Math.min(7, band * 0.36);
  pair(fine, [m(barX, rail), l(barX, bottom)]);
  fine.push(canonicalizePath([m(edge, bottom - 7), l(width - edge, bottom - 7)]));
  for (const fraction of sideComplexity > 0.65 ? [0.2, 0.5, 0.8] : [0.28, 0.72]) {
    const y = rail + (bottom - rail) * fraction;
    pair(solid, [
      m(edge, y - 1.5),
      l(barX + 2, y - 1.5),
      l(barX + 2, y + 1.5),
      l(edge, y + 1.5),
      z,
    ]);
  }

  const crestHeight = Math.min(upper * (0.7 + peakHeight * 0.12), width * 0.29);
  const crestTop = rail - crestHeight - 4;
  const reserve = crest === "fleur" ? crestHeight * 0.44 + 7 : crest === "none" ? 9 : 16;
  if (crest === "fleur") {
    const fleurHeight = crestHeight * 0.84;
    const [crown, collar, foot] = fleurDeLys(center, rail - fleurHeight - 4, fleurHeight);
    centered(fine, [crown, foot]);
    centered(solid, [collar]);
    centered(structure, [[m(center, rail), l(center, rail - 4)]]);
  } else if (crest !== "none") {
    const capHeight = Math.min(22, crestHeight * 0.35);
    const capWidth = capHeight * (crest === "diamond" ? 0.32 : 0.22);
    centered(solid, [
      placeEmblem(
        [
          m(0, 0),
          l(capWidth, capHeight * 0.58),
          l(0, capHeight),
          l(-capWidth, capHeight * 0.58),
          z,
        ],
        center,
        crestTop,
        1,
      ),
    ]);
    centered(structure, [[m(center, crestTop + capHeight), l(center, rail)]]);
    centered(fine, [
      canonicalizePath([
        m(center - 4, crestTop + capHeight + 4),
        l(center + 4, crestTop + capHeight + 4),
      ]),
    ]);
  }

  const usable = half - reserve - 9;
  const variation = sampleScalar(source.seed, `${family}/proportion/study-lift`);
  const count = Math.max(
    1,
    Math.min(
      family === "arcade" ? 2 + Math.round(density * 2) : 1 + Math.round(density * 2),
      Math.floor(usable / 46),
    ),
  );
  const cell = usable / count;

  if (family === "fan") {
    // Every ray terminates on the same cubic canopy, at its evaluated point.
    const span = half - reserve;
    const lift = Math.min(upper * (0.6 + variation * 0.12) * (0.86 + curvature * 0.14), span * 0.9);
    const a = { x: edge, y: rail };
    const b = { x: edge + span * 0.2, y: rail - lift * 0.7 };
    const d = { x: edge + span, y: rail - lift };
    const p = { x: edge + span * 0.65, y: rail - lift };
    pair(structure, [m(a.x, a.y), c(b.x, b.y, p.x, p.y, d.x, d.y), l(d.x, rail)]);
    const rays = Math.min(3 + Math.round(density * 3), Math.max(2, Math.floor(span / 16)));
    for (let index = 1; index < rays; index++) {
      const tip = cubicPoint(a, b, p, d, index / rays);
      pair(ornaments, [m(edge + span, rail), l(tip.x, tip.y)]);
    }
  } else if (family === "arcade") {
    // Piers meet rounded arch spring points; neighbouring bays have their own breathing room.
    for (let index = 0; index < count; index++) {
      const x = edge + 7 + cell * index;
      const w = cell - 9;
      const h = Math.min(
        upper * (0.6 + variation * 0.1 + (0.1 * index) / count) * (0.86 + curvature * 0.14),
        w * 1.15,
      );
      const shoulder = rail - h * 0.5;
      pair(ornaments, [
        m(x, rail),
        l(x, shoulder),
        c(x, rail - h * 0.82, x + w * 0.22, rail - h, x + w * 0.5, rail - h),
        c(x + w * 0.78, rail - h, x + w, rail - h * 0.82, x + w, shoulder),
        l(x + w, rail),
      ]);
    }
  } else if (family !== "vine") {
    const span = half - reserve;
    const coilWidth = Math.min(span * 0.57, upper * (family === "volute" ? 1.12 : 0.9));
    const coilX = edge + span - coilWidth;
    const height = Math.min(
      upper *
        (family === "courtyard" ? 0.61 : family === "fleuron" ? 0.79 : 0.88) *
        (0.94 + curvature * 0.06 + variation * 0.035),
      coilWidth * 1.25,
    );
    const top = rail - height;
    const curl = scroll(coilX, top, coilWidth, height);
    pair(ornaments, [
      m(edge, rail),
      c(edge, rail - height * 0.72, coilX + coilWidth * 0.18, top, coilX + coilWidth * 0.53, top),
      ...curl.slice(2, coilWidth < 34 ? 5 : undefined),
    ]);
    // A second, lower curl fits below the rising crown instead of crossing it.
    if (span > 120 && density > 0.25) {
      const smallWidth = Math.min(upper * 0.49, span * 0.25);
      const smallHeight = height * (family === "volute" ? 0.36 : 0.29);
      pair(
        fine,
        scroll(edge + span * 0.24, rail - smallHeight, smallWidth, smallHeight).slice(0, 5),
      );
    }
  } else {
    for (let index = 0; index < count; index++) {
      const w = Math.min(cell - 10, upper * 0.94);
      const x = edge + 7 + cell * index + (cell - 10 - w) / 2;
      const hierarchy = count === 1 ? 0.78 : 0.54 + (0.24 * index) / (count - 1);
      const h = Math.min(
        upper * hierarchy * (0.88 + curvature * 0.12 + variation * 0.08),
        w * 1.25,
      );
      const top = rail - h;
      // Small slots omit the tight terminal turn rather than compressing it into a knot.
      const curl = scroll(x, top, w, h);
      pair(ornaments, w < 34 ? curl.slice(0, 5) : curl);
      if (family === "vine") {
        // Leaves grow from the rising bar, on its outside; there are no free-standing buds.
        for (const t of w > 50 ? [0.24, 0.45] : [0.34]) {
          const node = cubicPoint(
            { x, y: rail },
            { x, y: top + h * 0.48 },
            { x: x + w * 0.18, y: top },
            { x: x + w * 0.53, y: top },
            t,
          );
          const size = Math.min(11, w * 0.16);
          pair(solid, [
            m(node.x, node.y),
            c(
              node.x - size * 0.6,
              node.y - size * 0.05,
              node.x - size,
              node.y - size * 0.75,
              node.x - size * 0.7,
              node.y - size * 1.5,
            ),
            c(
              node.x - size * 0.05,
              node.y - size,
              node.x + size * 0.12,
              node.y - size * 0.5,
              node.x,
              node.y,
            ),
            z,
          ]);
        }
      }
    }
  }

  return deepFreeze({
    schemaVersion: 1,
    generationVersion: 3,
    seed,
    options,
    dimensions,
    viewBox: { minX: 0, minY: 0, width, height },
    bounds: source.bounds,
    contentInsets: source.contentInsets,
    surfacePath: source.surfacePath,
    structuralPaths: structure,
    finePaths: fine,
    decorativePaths: ornaments,
    solidPaths: solid,
  });
}

type Point = Readonly<{ x: number; y: number }>;
const cubicPoint = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
  };
};

const m = (x: number, y: number): GatePathCommand => ({ kind: "M", x, y });
const l = (x: number, y: number): GatePathCommand => ({ kind: "L", x, y });
const c = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): GatePathCommand => ({ kind: "C", x1, y1, x2, y2, x, y });
const z: GatePathCommand = { kind: "Z" };

const place = (path: GatePath, x: number, y: number, sx: number, sy = sx): GatePath =>
  canonicalizePath(
    path.map((command) => {
      if (command.kind === "Z") return command;
      const point = { x: x + command.x * sx, y: y + command.y * sy };
      if (command.kind === "C")
        return {
          kind: "C",
          ...point,
          x1: x + command.x1 * sx,
          y1: y + command.y1 * sy,
          x2: x + command.x2 * sx,
          y2: y + command.y2 * sy,
        };
      if (command.kind === "Q")
        return { kind: "Q", ...point, x1: x + command.x1 * sx, y1: y + command.y1 * sy };
      return { kind: command.kind, ...point };
    }),
  );

/** Heraldic silhouette selected in ART-01. */
const placeEmblem = (path: GatePath, center: number, top: number, scale: number): GatePath => {
  const centerUnits = Math.round(center * 10_000);
  return canonicalizePath(
    path.map(
      (command) =>
        Object.fromEntries(
          Object.entries(command).map(([key, value]) => [
            key,
            key.startsWith("x")
              ? (centerUnits +
                  Math.sign(Number(value)) * Math.round(Math.abs(Number(value)) * scale * 10_000)) /
                10_000
              : key.startsWith("y")
                ? top + Number(value) * scale
                : value,
          ]),
        ) as unknown as GatePathCommand,
    ),
  );
};

export function fleurDeLys(x: number, top: number, height: number): [GatePath, GatePath, GatePath] {
  const crown = [
    m(-0.12, 0.682),
    c(-0.14, 0.55, -0.25, 0.39, -0.3, 0.44),
    c(-0.35, 0.49, -0.3, 0.55, -0.25, 0.5),
    c(-0.28, 0.68, -0.47, 0.55, -0.36, 0.36),
    c(-0.29, 0.25, -0.15, 0.32, -0.055, 0.51),
    c(-0.13, 0.3, -0.14, 0.16, 0, 0),
    c(0.14, 0.16, 0.13, 0.3, 0.055, 0.51),
    c(0.15, 0.32, 0.29, 0.25, 0.36, 0.36),
    c(0.47, 0.55, 0.28, 0.68, 0.25, 0.5),
    c(0.3, 0.55, 0.35, 0.49, 0.3, 0.44),
    c(0.25, 0.39, 0.14, 0.55, 0.12, 0.682),
    l(-0.12, 0.682),
    z,
  ];
  const collar = [m(-0.13, 0.682), l(0.13, 0.682), l(0.13, 0.708), l(-0.13, 0.708), z];
  const foot = [
    m(-0.075, 0.708),
    c(-0.08, 0.81, -0.14, 0.85, -0.2, 0.86),
    c(-0.14, 0.93, -0.07, 0.91, -0.035, 0.86),
    c(-0.04, 0.93, -0.03, 0.97, 0, 1),
    c(0.03, 0.97, 0.04, 0.93, 0.035, 0.86),
    c(0.07, 0.91, 0.14, 0.93, 0.2, 0.86),
    c(0.14, 0.85, 0.08, 0.81, 0.075, 0.708),
    l(-0.075, 0.708),
    z,
  ];
  return [
    placeEmblem(crown, x, top, height),
    placeEmblem(collar, x, top, height),
    placeEmblem(foot, x, top, height),
  ];
}

export function scroll(x: number, top: number, width: number, height: number): GatePath {
  return place(
    [
      m(0, 1),
      c(0, 0.48, 0.18, 0, 0.53, 0),
      c(0.82, 0, 1, 0.18, 1, 0.44),
      c(1, 0.68, 0.83, 0.83, 0.65, 0.83),
      c(0.49, 0.83, 0.39, 0.72, 0.39, 0.6),
      c(0.39, 0.49, 0.47, 0.42, 0.56, 0.42),
      c(0.64, 0.42, 0.69, 0.48, 0.69, 0.54),
    ],
    x,
    top,
    width,
    height,
  );
}
