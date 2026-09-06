import { describe, expect, test } from "vitest";

import {
  generateGate,
  renderGateSVG,
  type GateGenerationOptions,
  type GateGeometry,
  type GatePath,
  type GatePathCommand,
} from "../../src/core/index.js";

const canonicalNumber = (value: number): number => Number(value.toFixed(4));

const expectMirroredPaths = (left: GatePath, right: GatePath, width: number): void => {
  expect(right).toHaveLength(left.length);

  for (const [index, leftCommand] of left.entries()) {
    const rightCommand = right[index];
    expect(rightCommand?.kind).toBe(leftCommand.kind);

    if (rightCommand === undefined || leftCommand.kind === "Z" || rightCommand.kind === "Z") {
      continue;
    }

    expect(rightCommand.x).toBe(canonicalNumber(width - leftCommand.x));
    expect(rightCommand.y).toBe(leftCommand.y);

    if (leftCommand.kind === "C" && rightCommand.kind === "C") {
      expect(rightCommand.x1).toBe(canonicalNumber(width - leftCommand.x1));
      expect(rightCommand.y1).toBe(leftCommand.y1);
      expect(rightCommand.x2).toBe(canonicalNumber(width - leftCommand.x2));
      expect(rightCommand.y2).toBe(leftCommand.y2);
    }
  }
};

const expectNumericCommands = (path: GatePath): void => {
  for (const command of path) {
    for (const value of Object.values(command)) {
      if (typeof value !== "string") {
        expect(typeof value).toBe("number");
      }
    }
  }
};

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

const expectRecursivelyFrozen = (value: unknown): void => {
  if (value === null || typeof value !== "object") {
    return;
  }

  expect(Object.isFrozen(value)).toBe(true);
  for (const nestedValue of Object.values(value)) {
    expectRecursivelyFrozen(nestedValue);
  }
};

describe("courtyard core", () => {
  test("generates and serializes one fixed courtyard through the public API", () => {
    const geometry = generateGate(
      { width: 300, height: 342 },
      { seed: "courtyard-fixed", family: "courtyard" },
    );

    expect(geometry.schemaVersion).toBe(1);
    expect(geometry.generationVersion).toBe(1);
    expect(geometry.seed).toBe("courtyard-fixed");
    expect(geometry.dimensions).toEqual({ width: 300, height: 342 });
    expect(geometry.options).toEqual({
      generationVersion: 1,
      family: "courtyard",
      density: 0.55,
      curvature: 0.65,
      symmetry: 1,
      crest: "spear",
      inset: 8,
      strokeWidth: 2,
    });

    const safeRegion = {
      left: geometry.contentInsets.left,
      right: geometry.dimensions.width - geometry.contentInsets.right,
      top: geometry.contentInsets.top,
      bottom: geometry.dimensions.height - geometry.contentInsets.bottom,
    };

    expect(geometry.surfacePath).toContainEqual({
      kind: "M",
      x: geometry.bounds.left,
      y: geometry.bounds.railY,
    });
    expect(geometry.surfacePath).toContainEqual({
      kind: "M",
      x: safeRegion.left,
      y: safeRegion.top,
    });

    expect(geometry.structuralPaths).toHaveLength(1);
    expect(geometry.structuralPaths[0]).toEqual([
      { kind: "M", x: geometry.bounds.left, y: geometry.bounds.bottomY },
      { kind: "L", x: geometry.bounds.left, y: geometry.bounds.railY },
      { kind: "L", x: geometry.bounds.right, y: geometry.bounds.railY },
      { kind: "L", x: geometry.bounds.right, y: geometry.bounds.bottomY },
      { kind: "Z" },
    ] satisfies GatePathCommand[]);

    expect(geometry.decorativePaths).toHaveLength(3);
    const [leftScroll, rightScroll, spear] = geometry.decorativePaths;
    expect(leftScroll).toBeDefined();
    expect(rightScroll).toBeDefined();
    expect(spear).toBeDefined();

    if (leftScroll === undefined || rightScroll === undefined || spear === undefined) {
      throw new Error("Expected paired scrollwork and one spear");
    }

    expectMirroredPaths(leftScroll, rightScroll, geometry.dimensions.width);
    expect(spear[0]).toEqual({
      kind: "M",
      x: geometry.dimensions.width / 2,
      y: geometry.bounds.railY,
    });
    expect(spear[1]).toMatchObject({
      kind: "L",
      x: geometry.dimensions.width / 2,
    });

    for (const path of [
      geometry.surfacePath,
      ...geometry.structuralPaths,
      ...geometry.decorativePaths,
    ]) {
      expectNumericCommands(path);
    }

    const svg = renderGateSVG(geometry, {
      stroke: "#171717",
      surface: "#d6c4a1",
    });

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="342"');
    expect(svg).toContain('viewBox="0 0 300 342"');
    expect(svg).toContain('fill="#d6c4a1"');
    expect(svg).toContain('stroke="#171717"');
    expect(svg.match(/<path /g)).toHaveLength(5);
  });

  test("normalizes density and curvature and applies their supported range", () => {
    const dimensions = { width: 300, height: 342 };
    const defaults = generateGate(dimensions, {
      seed: "shape-controls",
      family: "courtyard",
    });
    const lowDensity = generateGate(dimensions, {
      seed: "shape-controls",
      family: "courtyard",
      density: 0,
    });
    const highDensity = generateGate(dimensions, {
      seed: "shape-controls",
      family: "courtyard",
      density: 1,
    });
    const lowCurvature = generateGate(dimensions, {
      seed: "shape-controls",
      family: "courtyard",
      curvature: 0,
    });
    const highCurvature = generateGate(dimensions, {
      seed: "shape-controls",
      family: "courtyard",
      curvature: 1,
    });

    expect(defaults.options).toMatchObject({ density: 0.55, curvature: 0.65, symmetry: 1 });
    expect(lowDensity.options.density).toBe(0);
    expect(highDensity.options.density).toBe(1);
    expect(lowCurvature.options.curvature).toBe(0);
    expect(highCurvature.options.curvature).toBe(1);
    expect(lowDensity.decorativePaths[0]).not.toEqual(highDensity.decorativePaths[0]);
    expect(lowCurvature.decorativePaths[0]).not.toEqual(highCurvature.decorativePaths[0]);
    expect(lowCurvature.decorativePaths[0]?.[0]).toEqual(highCurvature.decorativePaths[0]?.[0]);

    for (const option of ["density", "curvature"] as const) {
      for (const value of [
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        -0.0001,
        1.0001,
      ]) {
        expect(() =>
          generateGate(dimensions, {
            seed: "invalid-shape-control",
            family: "courtyard",
            [option]: value,
          }),
        ).toThrow();
      }
    }
  });

  test("rejects null density and curvature from runtime callers", () => {
    const dimensions = { width: 300, height: 342 };

    for (const option of ["density", "curvature"] as const) {
      const options = {
        seed: "null-shape-control",
        family: "courtyard",
        [option]: null,
      } as unknown as GateGenerationOptions;

      expect(() => generateGate(dimensions, options)).toThrow(`${option} must be a finite number`);
    }
  });

  test("keeps numeric seed 42 distinct from string seed 42", () => {
    const dimensions = { width: 300, height: 342 };
    const numericSeed = generateGate(dimensions, { seed: 42, family: "courtyard" });
    const stringSeed = generateGate(dimensions, { seed: "42", family: "courtyard" });

    expect(numericSeed.decorativePaths).not.toEqual(stringSeed.decorativePaths);
  });

  test("validates finite supported inputs and canonicalizes public numbers", () => {
    const geometry = generateGate(
      { width: 300.123_456, height: 342.987_654 },
      { seed: -0, family: "courtyard" },
    );

    expect(geometry.seed).toBe(0);
    expect(Object.is(geometry.seed, -0)).toBe(false);
    expect(geometry.dimensions).toEqual({ width: 300.1235, height: 342.9877 });

    for (const value of collectNumbers(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Object.is(value, -0)).toBe(false);
      expect(value).toBe(Number(value.toFixed(4)));
    }

    const invalidCases = [
      [
        { width: Number.NaN, height: 342 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 300, height: Number.POSITIVE_INFINITY },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 159, height: 342 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 1_601, height: 342 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 300, height: 95 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 300, height: 1_201 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 160, height: 1_000 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 1_600, height: 96 },
        { seed: "x", family: "courtyard" },
      ],
      [
        { width: 300, height: 342 },
        { seed: Number.NEGATIVE_INFINITY, family: "courtyard" },
      ],
      [
        { width: 300, height: 342 },
        { seed: "", family: "courtyard" },
      ],
    ] as const;

    for (const [dimensions, options] of invalidCases) {
      expect(() => generateGate(dimensions, options)).toThrow();
    }
  });

  test("keeps the safe region and path points inside the smallest supported frame", () => {
    const geometry = generateGate(
      { width: 160, height: 96 },
      { seed: "minimum", family: "courtyard" },
    );
    const safeRight = geometry.dimensions.width - geometry.contentInsets.right;
    const safeBottom = geometry.dimensions.height - geometry.contentInsets.bottom;
    const strokeEdge = geometry.options.inset + geometry.options.strokeWidth / 2;

    expect(geometry.contentInsets.left).toBeLessThan(safeRight);
    expect(geometry.contentInsets.top).toBeLessThan(safeBottom);

    for (const path of [
      geometry.surfacePath,
      ...geometry.structuralPaths,
      ...geometry.decorativePaths,
    ]) {
      for (const command of path) {
        for (const [key, value] of Object.entries(command)) {
          if (typeof value !== "number") {
            continue;
          }

          if (key.startsWith("x")) {
            expect(value).toBeGreaterThanOrEqual(strokeEdge);
            expect(value).toBeLessThanOrEqual(geometry.dimensions.width - strokeEdge);
          } else {
            expect(value).toBeGreaterThanOrEqual(strokeEdge);
            expect(value).toBeLessThanOrEqual(geometry.dimensions.height - strokeEdge);
          }
        }
      }
    }
  });

  test("accepts safe literal paint and rejects active or XML-breaking paint", () => {
    const geometry = generateGate(
      { width: 300, height: 342 },
      { seed: "paint", family: "courtyard" },
    );
    const svg = renderGateSVG(geometry, {
      stroke: "rgba(23, 17, 9, 0.75)",
      surface: "hsl(40, 20%, 80%)",
    });

    expect(svg).toContain('stroke="rgba(23, 17, 9, 0.75)"');
    expect(svg).toContain('fill="hsl(40, 20%, 80%)"');

    const unsafePaint = [
      "url(https://example.invalid/paint.svg#iron)",
      "var(--gate-iron)",
      'red" onload="alert(1)',
      "red><script>alert(1)</script>",
    ];

    for (const value of unsafePaint) {
      expect(() => renderGateSVG(geometry, { stroke: value })).toThrow();
      expect(() => renderGateSVG(geometry, { surface: value })).toThrow();
    }
  });

  test("rejects tampered runtime geometry before SVG serialization", () => {
    const geometry = structuredClone(
      generateGate(
        { width: 300, height: 342 },
        { seed: "tampered-runtime-geometry", family: "courtyard" },
      ),
    );

    (geometry.dimensions as { width: unknown }).width = '300" onload="alert(1)';

    expect(() => renderGateSVG(geometry as unknown as GateGeometry)).toThrow();
  });

  test("keeps surface fill separate from the structural iron stroke", () => {
    const geometry = generateGate(
      { width: 300, height: 342 },
      { seed: "surface", family: "courtyard" },
    );
    const svg = renderGateSVG(geometry, { stroke: "#171717", surface: "#d6c4a1" });

    expect(svg).toContain('fill="#d6c4a1" fill-rule="evenodd" stroke="none"');
    expect(svg.indexOf('fill="#d6c4a1"')).toBeLessThan(svg.indexOf('<g stroke="#171717"'));
  });

  test("recursively freezes returned geometry, arrays, and commands", () => {
    const geometry = generateGate(
      { width: 300, height: 342 },
      { seed: "immutable", family: "courtyard" },
    );

    expectRecursivelyFrozen(geometry);
    expect(() => {
      (geometry.dimensions as { width: number }).width = 1;
    }).toThrow(TypeError);
    expect(() => {
      (geometry.decorativePaths as GatePath[]).push([]);
    }).toThrow(TypeError);
    expect(() => {
      (geometry.decorativePaths[0]?.[0] as { x: number }).x = 1;
    }).toThrow(TypeError);
  });

  test("returns deeply equal geometry and byte-identical canonical SVG for equal input", () => {
    const dimensions = { width: 300, height: 342 };
    const options = { seed: "repeatable", family: "courtyard" } as const;
    const first = generateGate(dimensions, options);
    const second = generateGate(dimensions, options);
    const firstSvg = renderGateSVG(first, { stroke: "#171717", surface: "transparent" });
    const secondSvg = renderGateSVG(second, { stroke: "#171717", surface: "transparent" });

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(firstSvg).toBe(secondSvg);
    expect(firstSvg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="300" height="342" viewBox="0 0 300 342" data-gate-frame-generation-version="1">/,
    );
  });

  test("rejects options outside the courtyard generation-version-1 slice", () => {
    const dimensions = { width: 300, height: 342 };
    const unsupportedOptions = [
      { seed: "x" },
      { seed: "x", family: "auto" },
      { seed: "x", family: "arcade" },
    ];

    for (const options of unsupportedOptions) {
      expect(() => generateGate(dimensions, options as GateGenerationOptions)).toThrow();
    }
  });

  test("rejects seed values that are neither strings nor finite numbers", () => {
    const dimensions = { width: 300, height: 342 };

    for (const seed of [true, false, {}, []]) {
      const options = { seed, family: "courtyard" } as unknown as GateGenerationOptions;
      expect(() => generateGate(dimensions, options)).toThrow();
    }
  });

  test("hashes lone UTF-16 surrogates with UTF-8 replacement semantics", () => {
    const dimensions = { width: 300, height: 342 };
    const replacement = generateGate(dimensions, { seed: "\uFFFD", family: "courtyard" });

    for (const seed of ["\uD800", "\uDC00"]) {
      const geometry = generateGate(dimensions, { seed, family: "courtyard" });
      expect(geometry.decorativePaths).toEqual(replacement.decorativePaths);
    }
  });
});
