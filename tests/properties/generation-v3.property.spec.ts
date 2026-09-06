import fc from "fast-check";
import { expect, test } from "vitest";
import { generateGate, renderGateSVG } from "../../src/core/index.js";
import { compatibleCrestsForFamily } from "../../src/core/v3/generate.js";
import { hasMirroredPoints, pathPoints, segmentHulls } from "../helpers/geometry.js";
import { PROPERTY_RUNS } from "./property-runs.js";

const families = ["courtyard", "fleuron", "arcade", "vine", "fan", "volute"] as const;
const control = fc.oneof(
  fc.constantFrom(0, 1, 0.0001, 0.9999, 0.25, 0.75),
  fc.integer({ min: 0, max: 10000 }).map((n) => n / 10000),
);
const cases = fc
  .record({
    width: fc.integer({ min: 1600000, max: 16000000 }).map((n) => n / 10000),
    height: fc.integer({ min: 960000, max: 12000000 }).map((n) => n / 10000),
    seed: fc.oneof(fc.integer(), fc.string({ minLength: 1, maxLength: 24 })),
    family: fc.constantFrom(...families),
    crestIndex: fc.integer({ min: 0, max: 2 }),
    density: control,
    curvature: control,
    symmetry: control,
    peakHeight: control,
    sideComplexity: control,
  })
  .filter(({ width, height }) => width / height >= 0.5 && width / height <= 6);

test("keeps v3 canonical, reproducible, stroke-safe and mirrored across supported dimensions and controls", () => {
  fc.assert(
    fc.property(cases, (input) => {
      const { width, height, crestIndex, ...controls } = input;
      const geometry = generateGate(
        { width, height },
        {
          generationVersion: 3,
          ...controls,
          crest: compatibleCrestsForFamily(input.family)[crestIndex] ?? "none",
        },
      );
      const { dimensions, contentInsets } = geometry;
      const groups = [
        { paths: geometry.structuralPaths, radius: 1 },
        { paths: geometry.decorativePaths, radius: 0.9 },
        { paths: geometry.finePaths, radius: 0.6 },
        { paths: geometry.solidPaths, radius: 0.4 },
      ];
      for (const { paths, radius } of groups)
        for (const path of paths) {
          expect(Object.isFrozen(path)).toBe(true);
          for (const point of pathPoints(path)) {
            for (const [axis, value] of Object.entries(point)) {
              expect(Number.isFinite(value)).toBe(true);
              expect(Object.is(value, -0)).toBe(false);
              expect(Math.round(value * 10000) / 10000).toBe(value);
              expect(value).toBeGreaterThanOrEqual(radius);
              expect(value).toBeLessThanOrEqual(
                (axis === "x" ? dimensions.width : dimensions.height) - radius,
              );
            }
          }
          for (const hull of segmentHulls(path)) {
            expect(
              hull.every((p) => p.x + radius <= contentInsets.left) ||
                hull.every((p) => p.x - radius >= dimensions.width - contentInsets.right) ||
                hull.every((p) => p.y + radius <= contentInsets.top) ||
                hull.every((p) => p.y - radius >= dimensions.height - contentInsets.bottom),
            ).toBe(true);
          }
        }
      if (geometry.options.symmetry === 1)
        expect(
          hasMirroredPoints(
            groups.flatMap((group) => group.paths),
            dimensions.width,
          ),
        ).toBe(true);
      const repeated = generateGate(
        { width, height },
        {
          generationVersion: 3,
          ...controls,
          crest: compatibleCrestsForFamily(input.family)[crestIndex] ?? "none",
        },
      );
      expect(repeated).toEqual(geometry);
      expect(renderGateSVG(geometry)).toBe(renderGateSVG(repeated));
    }),
    { numRuns: PROPERTY_RUNS, seed: 20260905, verbose: 1 },
  );
});
