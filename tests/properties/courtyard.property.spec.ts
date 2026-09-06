import fc from "fast-check";
import { expect, test } from "vitest";

import { generateGate, renderGateSVG } from "../../src/core/index.js";
import { PROPERTY_RUNS } from "./property-runs.js";

const PROPERTY_SEED = 20_260_831;
const COORDINATE_SCALE = 10_000;

const canonicalNumber = (value: number): number => {
  const rounded = Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const supportedCaseArbitrary = fc
  .record({
    width: fc.integer({ min: 160, max: 1_600 }),
    height: fc.integer({ min: 96, max: 1_200 }),
    seed: fc.integer({ min: -2_147_483_648, max: 2_147_483_647 }),
    densityStep: fc.integer({ min: 0, max: COORDINATE_SCALE }),
    curvatureStep: fc.integer({ min: 0, max: COORDINATE_SCALE }),
  })
  .filter(({ width, height }) => {
    const aspectRatio = width / height;
    return aspectRatio >= 0.5 && aspectRatio <= 6;
  });

const collectNumbers = (value: unknown, numbers: number[] = []): number[] => {
  if (typeof value === "number") {
    numbers.push(value);
    return numbers;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNumbers(item, numbers);
    }
    return numbers;
  }

  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectNumbers(item, numbers);
    }
  }

  return numbers;
};

test("courtyard geometry preserves its public invariants across supported inputs", () => {
  fc.assert(
    fc.property(supportedCaseArbitrary, ({ width, height, seed, densityStep, curvatureStep }) => {
      const dimensions = { width, height };
      const options = {
        seed,
        family: "courtyard",
        density: densityStep / COORDINATE_SCALE,
        curvature: curvatureStep / COORDINATE_SCALE,
      } as const;
      const geometry = generateGate(dimensions, options);

      for (const value of collectNumbers(geometry)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Object.is(value, -0)).toBe(false);
        expect(Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE).toBe(value);
      }

      const halfStroke = geometry.options.strokeWidth / 2;
      for (const path of [...geometry.structuralPaths, ...geometry.decorativePaths]) {
        for (const command of path) {
          for (const [field, value] of Object.entries(command)) {
            if (typeof value !== "number") {
              continue;
            }

            if (field.startsWith("x")) {
              expect(value).toBeGreaterThanOrEqual(halfStroke);
              expect(value).toBeLessThanOrEqual(width - halfStroke);
            } else {
              expect(value).toBeGreaterThanOrEqual(halfStroke);
              expect(value).toBeLessThanOrEqual(height - halfStroke);
            }
          }
        }
      }

      const { left, right, railY, bottomY } = geometry.bounds;
      expect(geometry.surfacePath.slice(0, 5)).toEqual([
        { kind: "M", x: left, y: railY },
        { kind: "L", x: right, y: railY },
        { kind: "L", x: right, y: bottomY },
        { kind: "L", x: left, y: bottomY },
        { kind: "Z" },
      ]);
      expect(geometry.structuralPaths).toEqual([
        [
          { kind: "M", x: left, y: bottomY },
          { kind: "L", x: left, y: railY },
          { kind: "L", x: right, y: railY },
          { kind: "L", x: right, y: bottomY },
          { kind: "Z" },
        ],
      ]);

      const safe = {
        left: geometry.contentInsets.left,
        right: canonicalNumber(width - geometry.contentInsets.right),
        top: geometry.contentInsets.top,
        bottom: canonicalNumber(height - geometry.contentInsets.bottom),
      };
      expect(safe.left).toBeLessThan(safe.right);
      expect(safe.top).toBeLessThan(safe.bottom);
      expect(geometry.surfacePath.slice(5)).toEqual([
        { kind: "M", x: safe.left, y: safe.top },
        { kind: "L", x: safe.left, y: safe.bottom },
        { kind: "L", x: safe.right, y: safe.bottom },
        { kind: "L", x: safe.right, y: safe.top },
        { kind: "Z" },
      ]);

      for (const path of geometry.decorativePaths) {
        const yCoordinates = path.flatMap((command) =>
          Object.entries(command)
            .filter(([field, value]) => field.startsWith("y") && typeof value === "number")
            .map(([, value]) => value as number),
        );
        expect(
          yCoordinates.every((value) => value <= safe.top) ||
            yCoordinates.every((value) => value >= safe.bottom),
        ).toBe(true);
      }

      const [leftScroll, rightScroll] = geometry.decorativePaths;
      expect(leftScroll).toBeDefined();
      expect(rightScroll).toEqual(
        leftScroll?.map((command) =>
          Object.fromEntries(
            Object.entries(command).map(([field, value]) => [
              field,
              field.startsWith("x") && typeof value === "number"
                ? canonicalNumber(width - value)
                : value,
            ]),
          ),
        ),
      );

      const repeatedGeometry = generateGate(dimensions, options);
      expect(repeatedGeometry).toEqual(geometry);
      expect(renderGateSVG(repeatedGeometry, { stroke: "#202427", surface: "#f2eadb" })).toBe(
        renderGateSVG(geometry, { stroke: "#202427", surface: "#f2eadb" }),
      );
    }),
    { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, verbose: 2 },
  );
});
