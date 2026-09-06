import fc from "fast-check";
import { expect, test } from "vitest";

import {
  type GateGeometryV2,
  type GatePath,
  generateGate,
  renderGateSVG,
} from "../../src/core/index.js";
import { PROPERTY_RUNS } from "./property-runs.js";

const PROPERTY_SEED = 20_260_902;
const CONTROL_EDGES = [0, 1, 0.0001, 0.9999] as const;
const DENSITY_CASES = [...CONTROL_EDGES, 0.34] as const;
const FAMILY_CASES = [
  { family: "courtyard", crest: "spear" },
  { family: "courtyard", crest: "diamond" },
  { family: "courtyard", crest: "none" },
  { family: "fleuron", crest: "fleur" },
  { family: "fleuron", crest: "spear" },
  { family: "fleuron", crest: "none" },
  { family: "arcade", crest: "diamond" },
  { family: "arcade", crest: "spear" },
  { family: "arcade", crest: "none" },
  { family: "vine", crest: "fleur" },
  { family: "vine", crest: "diamond" },
  { family: "vine", crest: "none" },
  { family: "fan", crest: "diamond" },
  { family: "fan", crest: "spear" },
  { family: "fan", crest: "none" },
  { family: "volute", crest: "fleur" },
  { family: "volute", crest: "spear" },
  { family: "volute", crest: "none" },
  { family: "auto", crest: "none" },
] as const;
const EXPLICIT_FAMILIES = ["courtyard", "fleuron", "arcade", "vine", "fan", "volute"] as const;

const supportedCase = fc
  .record({
    width: fc
      .integer({ min: 1_600_000, max: 16_000_000 })
      .map((latticeUnits) => latticeUnits / 10_000),
    height: fc.integer({ min: 96, max: 1_200 }),
    seed: fc.oneof(
      fc.integer({ min: -2_147_483_648, max: 2_147_483_647 }),
      fc.string({ minLength: 1, maxLength: 32 }),
    ),
    density: fc.constantFrom(...DENSITY_CASES),
    curvature: fc.constantFrom(...CONTROL_EDGES),
    symmetry: fc.constantFrom(...CONTROL_EDGES),
    peakHeight: fc.constantFrom(...CONTROL_EDGES),
    sideComplexity: fc.constantFrom(...CONTROL_EDGES),
    familyCase: fc.constantFrom(...FAMILY_CASES),
  })
  .filter(({ width, height }) => width / height >= 0.5 && width / height <= 6);

const coordinates = (path: GatePath): Array<readonly ["x" | "y", number]> =>
  path.flatMap((command) =>
    Object.entries(command).flatMap(([field, value]) => {
      if (typeof value !== "number") return [];
      return [[field.startsWith("x") ? "x" : "y", value] as const];
    }),
  );

type PathPoint = Readonly<{ x: number; y: number }>;

const pathPoints = (path: GatePath): PathPoint[] =>
  path.flatMap((command) => {
    switch (command.kind) {
      case "M":
      case "L":
        return [{ x: command.x, y: command.y }];
      case "C":
        return [
          { x: command.x1, y: command.y1 },
          { x: command.x2, y: command.y2 },
          { x: command.x, y: command.y },
        ];
      case "Q":
        return [
          { x: command.x1, y: command.y1 },
          { x: command.x, y: command.y },
        ];
      case "Z":
        return [];
    }
    return [];
  });

const everyDeclaredEndpointComponentConnectsToFrame = (
  geometry: Readonly<GateGeometryV2>,
): boolean => {
  const { left, right, railY, bottomY } = geometry.bounds;
  const endpointKey = (x: number, y: number): string =>
    `${Math.round(x * 10_000)}:${Math.round(y * 10_000)}`;
  const components: Array<Readonly<{ endpoints: ReadonlySet<string>; touchesFrame: boolean }>> = [];

  for (const paths of [geometry.structuralPaths.slice(1), geometry.decorativePaths]) {
    for (const path of paths) {
      let endpoints = new Set<string>();
      let touchesFrame = false;
      let hasSubpath = false;
      const addEndpoint = (x: number, y: number): void => {
        endpoints.add(endpointKey(x, y));
        if (
          ((x === left || x === right) && y >= railY && y <= bottomY) ||
          ((y === railY || y === bottomY) && x >= left && x <= right)
        ) {
          touchesFrame = true;
        }
      };
      const finishSubpath = (): void => {
        if (hasSubpath) components.push({ endpoints, touchesFrame });
      };

      for (const command of path) {
        if (command.kind === "M") {
          finishSubpath();
          endpoints = new Set<string>();
          touchesFrame = false;
          hasSubpath = true;
          addEndpoint(command.x, command.y);
        } else if (command.kind !== "Z") {
          addEndpoint(command.x, command.y);
        }
      }
      finishSubpath();
    }
  }

  const attached = new Set<number>();
  const attachedEndpoints = new Set<string>();
  for (const [index, component] of components.entries()) {
    if (!component.touchesFrame) continue;
    attached.add(index);
    for (const endpoint of component.endpoints) attachedEndpoints.add(endpoint);
  }
  let foundConnection = true;
  while (foundConnection) {
    foundConnection = false;
    for (const [index, component] of components.entries()) {
      if (attached.has(index)) continue;
      if (![...component.endpoints].some((endpoint) => attachedEndpoints.has(endpoint))) continue;
      attached.add(index);
      for (const endpoint of component.endpoints) attachedEndpoints.add(endpoint);
      foundConnection = true;
    }
  }

  return attached.size === components.length;
};

const hasExactMirroredPointPairs = (paths: readonly GatePath[], width: number): boolean => {
  const widthUnits = Math.round(width * 10_000);
  const counts = new Map<string, number>();
  for (const { x, y } of paths.flatMap(pathPoints)) {
    const key = `${Math.round(x * 10_000)}:${Math.round(y * 10_000)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].every(([key, count]) => {
    const [xUnitsText, yUnitsText] = key.split(":");
    const mirrorKey = `${widthUnits - Number(xUnitsText)}:${yUnitsText}`;
    return counts.get(mirrorKey) === count;
  });
};

const segmentHullOutsideSafeRectangle = (
  points: readonly PathPoint[],
  safe: Readonly<{ left: number; right: number; top: number; bottom: number }>,
  halfStroke: number,
): boolean =>
  points.every(({ x }) => x + halfStroke <= safe.left) ||
  points.every(({ x }) => x - halfStroke >= safe.right) ||
  points.every(({ y }) => y + halfStroke <= safe.top) ||
  points.every(({ y }) => y - halfStroke >= safe.bottom);

const everyStrokedSegmentOutsideSafeRectangle = (
  path: GatePath,
  safe: Readonly<{ left: number; right: number; top: number; bottom: number }>,
  halfStroke: number,
): boolean => {
  let current: PathPoint | undefined;
  let subpathStart: PathPoint | undefined;

  for (const command of path) {
    if (command.kind === "M") {
      current = { x: command.x, y: command.y };
      subpathStart = current;
      continue;
    }
    if (current === undefined) return false;

    const end = command.kind === "Z" ? subpathStart : { x: command.x, y: command.y };
    if (end === undefined) return false;
    const hull =
      command.kind === "C"
        ? [current, { x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 }, end]
        : command.kind === "Q"
          ? [current, { x: command.x1, y: command.y1 }, end]
          : [current, end];
    if (!segmentHullOutsideSafeRectangle(hull, safe, halfStroke)) return false;
    current = end;
  }

  return true;
};

const expectRecursivelyFrozen = (value: unknown): void => {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectRecursivelyFrozen(nested);
};

test("keeps every complete fan ornamental segment span outside the content-safe rectangle", () => {
  const dimensions = [
    { width: 160, height: 320 },
    { width: 600, height: 360 },
    { width: 1_600, height: 1_200 },
    { width: 576, height: 96 },
  ] as const;
  const seeds = ["atlas-0000", "atlas-0004", "atlas-0271"] as const;

  for (const size of dimensions) {
    for (const seed of seeds) {
      for (const control of CONTROL_EDGES) {
        const geometry = generateGate(size, {
          generationVersion: 2,
          seed,
          family: "fan",
          density: control,
          curvature: control,
          symmetry: control,
          peakHeight: control,
          sideComplexity: control,
          crest: "none",
        });
        const halfStroke = geometry.options.strokeWidth / 2;
        const safe = {
          left: geometry.contentInsets.left,
          right: geometry.dimensions.width - geometry.contentInsets.right,
          top: geometry.contentInsets.top,
          bottom: geometry.dimensions.height - geometry.contentInsets.bottom,
        };

        for (const path of [...geometry.structuralPaths.slice(1), ...geometry.decorativePaths]) {
          expect(everyStrokedSegmentOutsideSafeRectangle(path, safe, halfStroke)).toBe(true);
        }
      }
    }
  }
});

test("runs the configured reproducible cross-family generation-v2 oracle", () => {
  fc.assert(
    fc.property(supportedCase, (input) => {
      const dimensions = { width: input.width, height: input.height };
      const options = {
        generationVersion: 2,
        seed: input.seed,
        family: input.familyCase.family,
        density: input.density,
        curvature: input.curvature,
        symmetry: input.symmetry,
        peakHeight: input.peakHeight,
        sideComplexity: input.sideComplexity,
        crest: input.familyCase.crest,
      } as const;
      const geometry = generateGate(dimensions, options);
      const repeated = generateGate(dimensions, options);
      const halfStroke = geometry.options.strokeWidth / 2;
      const safe = {
        left: geometry.contentInsets.left,
        right: geometry.dimensions.width - geometry.contentInsets.right,
        top: geometry.contentInsets.top,
        bottom: geometry.dimensions.height - geometry.contentInsets.bottom,
      };
      const paths = [
        geometry.surfacePath,
        ...geometry.structuralPaths,
        ...geometry.decorativePaths,
      ];

      expect(geometry.generationVersion).toBe(2);
      expect(EXPLICIT_FAMILIES).toContain(geometry.options.family);
      expect(geometry.options).toMatchObject({
        generationVersion: 2,
        density: input.density,
        curvature: input.curvature,
        symmetry: input.symmetry,
        peakHeight: input.peakHeight,
        sideComplexity: input.sideComplexity,
        crest: input.familyCase.crest,
        inset: 8,
        strokeWidth: 2,
      });
      if (input.familyCase.family !== "auto") {
        expect(geometry.options.family).toBe(input.familyCase.family);
      }
      expect(safe.left).toBeLessThan(safe.right);
      expect(safe.top).toBeLessThan(safe.bottom);
      expect(geometry.surfacePath.slice(0, 5)).toEqual([
        { kind: "M", x: geometry.bounds.left, y: geometry.bounds.railY },
        { kind: "L", x: geometry.bounds.right, y: geometry.bounds.railY },
        { kind: "L", x: geometry.bounds.right, y: geometry.bounds.bottomY },
        { kind: "L", x: geometry.bounds.left, y: geometry.bounds.bottomY },
        { kind: "Z" },
      ]);
      expect(geometry.structuralPaths[0]).toEqual([
        { kind: "M", x: geometry.bounds.left, y: geometry.bounds.bottomY },
        { kind: "L", x: geometry.bounds.left, y: geometry.bounds.railY },
        { kind: "L", x: geometry.bounds.right, y: geometry.bounds.railY },
        { kind: "L", x: geometry.bounds.right, y: geometry.bounds.bottomY },
        { kind: "Z" },
      ]);

      for (const path of paths) {
        for (const [axis, value] of coordinates(path)) {
          expect(Number.isFinite(value)).toBe(true);
          expect(Object.is(value, -0)).toBe(false);
          expect(Math.round(value * 10_000) / 10_000).toBe(value);
          expect(value).toBeGreaterThanOrEqual(halfStroke);
          expect(value).toBeLessThanOrEqual(
            (axis === "x" ? geometry.dimensions.width : geometry.dimensions.height) - halfStroke,
          );
        }
      }
      for (const path of [...geometry.structuralPaths.slice(1), ...geometry.decorativePaths]) {
        expect(everyStrokedSegmentOutsideSafeRectangle(path, safe, halfStroke)).toBe(true);
      }
      for (const path of [...geometry.structuralPaths, ...geometry.decorativePaths]) {
        expect(path.length).toBeGreaterThan(0);
        expect(path[0]?.kind).toBe("M");
        for (const [index, command] of path.entries()) {
          if (command.kind === "Z") expect(index).toBe(path.length - 1);
        }
      }
      expect(everyDeclaredEndpointComponentConnectsToFrame(geometry)).toBe(true);
      for (const path of geometry.structuralPaths.slice(1)) {
        expect(
          path.some(
            (command) =>
              command.kind !== "Z" &&
              (command.x === geometry.bounds.left ||
                command.x === geometry.bounds.right ||
                command.y === geometry.bounds.railY ||
                command.y === geometry.bounds.bottomY),
          ),
        ).toBe(true);
        expect(geometry.decorativePaths).not.toContainEqual(path);
      }
      if (input.symmetry === 1 && Math.round(geometry.dimensions.width * 10_000) % 2 === 1) {
        expect(
          hasExactMirroredPointPairs(
            [...geometry.structuralPaths.slice(1), ...geometry.decorativePaths],
            geometry.dimensions.width,
          ),
        ).toBe(true);
      }

      expectRecursivelyFrozen(geometry);
      expect(repeated).toEqual(geometry);
      const svg = renderGateSVG(geometry, { stroke: "#202427", surface: "#f2eadb" });
      expect(renderGateSVG(repeated, { stroke: "#202427", surface: "#f2eadb" })).toBe(svg);
      expect(svg).toContain('data-gate-frame-generation-version="2"');
      expect(svg).not.toMatch(/<script|onload\s*=|url\s*\(/i);
    }),
    { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, verbose: 2 },
  );
});
