import { describe, expect, it } from "vitest";
import { mirrorPath } from "../../src/core/geometry-utils.js";
import { generateGate, renderGateSVG } from "../../src/core/index.js";
import { sampleKeyBytes, sampleUint32 } from "../../src/core/v3/sampler.js";
import { hasMirroredPoints, pathPoints } from "../helpers/geometry.js";

describe("generation 3 French ironwork", () => {
  it("separates typed seeds in the v3 domain and resolves auto reproducibly", () => {
    const prefix = "gate-frame/v3/sample\0n";
    expect(Buffer.from(sampleKeyBytes(42, "family")).subarray(0, prefix.length).toString()).toBe(
      prefix,
    );
    expect(sampleUint32(42, "family")).not.toBe(sampleUint32("42", "family"));
    expect(sampleUint32(-0, "family")).toBe(sampleUint32(0, "family"));
    const families = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const geometry = generateGate({ width: 600, height: 360 }, { generationVersion: 3, seed });
      families.add(geometry.options.family);
      expect(
        generateGate(geometry.dimensions, {
          generationVersion: 3,
          seed,
          family: geometry.options.family,
        }),
      ).toEqual(geometry);
    }
    expect([...families].sort()).toEqual([
      "arcade",
      "courtyard",
      "fan",
      "fleuron",
      "vine",
      "volute",
    ]);
  });
  it("rounds both sides of a centered fleur together at half-lattice offsets", () => {
    const geometry = generateGate(
      { width: 1110.651, height: 709 },
      {
        generationVersion: 3,
        seed: " ",
        family: "fleuron",
        density: 0,
        curvature: 0,
        peakHeight: 0,
        sideComplexity: 0,
      },
    );
    expect(
      hasMirroredPoints([...geometry.finePaths, ...geometry.solidPaths], geometry.dimensions.width),
    ).toBe(true);
  });
  it("keeps exact mirrored canonical points at odd lattice widths", () => {
    const geometry = generateGate(
      { width: 600.0001, height: 360 },
      { generationVersion: 3, seed: "mirror", family: "fleuron" },
    );
    expect(
      hasMirroredPoints(
        [
          ...geometry.structuralPaths,
          ...geometry.decorativePaths,
          ...geometry.finePaths,
          ...geometry.solidPaths,
        ],
        geometry.dimensions.width,
      ),
    ).toBe(true);
  });
  it("lets peak height shape every crown when the crest is disabled", () => {
    for (const family of ["courtyard", "fleuron", "arcade", "vine", "fan", "volute"] as const) {
      const options = { generationVersion: 3, seed: "height", family, crest: "none" } as const;
      const a = generateGate({ width: 600, height: 360 }, { ...options, peakHeight: 0 });
      const b = generateGate({ width: 600, height: 360 }, { ...options, peakHeight: 1 });
      expect([a.structuralPaths, a.decorativePaths]).not.toEqual([
        b.structuralPaths,
        b.decorativePaths,
      ]);
    }
  });
  it("lets curvature shape the arcade and fan even without a crest", () => {
    for (const family of ["arcade", "fan"] as const) {
      const options = { generationVersion: 3, seed: "controls", family, crest: "none" } as const;
      const a = generateGate({ width: 600, height: 360 }, { ...options, curvature: 0 });
      const b = generateGate({ width: 600, height: 360 }, { ...options, curvature: 1 });
      expect([a.structuralPaths, a.decorativePaths]).not.toEqual([
        b.structuralPaths,
        b.decorativePaths,
      ]);
    }
  });
  it("applies bounded asymmetry to joined right-side ornaments while retaining left anchors", () => {
    const options = { generationVersion: 3, seed: "asymmetry", family: "vine" } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, options);
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0 });
    expect(symmetric.decorativePaths[1]).toEqual(
      mirrorPath(symmetric.decorativePaths[0] ?? [], 600),
    );
    expect(asymmetric.decorativePaths[0]).toEqual(symmetric.decorativePaths[0]);
    expect(asymmetric.decorativePaths[1]).not.toEqual(symmetric.decorativePaths[1]);
    expect(asymmetric.decorativePaths[1]?.[0]).toEqual(symmetric.decorativePaths[1]?.[0]);
  });
  it("exports the ironwork stroke hierarchy and solid accents using caller paint", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      { generationVersion: 3, seed: "paint", family: "fleuron" },
    );
    const svg = renderGateSVG(geometry, { stroke: "#31534b", surface: "#f2eadb" });
    expect(svg).toContain('data-gate-frame-generation-version="3"');
    expect(svg).toContain('stroke-width="1.8"');
    expect(svg).toContain('stroke-width="1.2"');
    expect(svg).toContain('stroke-width="0.8" fill="#31534b"');
    expect(svg).toContain('fill="#f2eadb"');
    expect(svg).not.toContain("data-ironwork-study");
    expect(renderGateSVG(geometry, { stroke: "#31534b", surface: "#f2eadb" })).toBe(svg);
    expect(() => renderGateSVG({ ...geometry, finePaths: [] })).toThrow(/canonical/);
  });
  it("draws a lighter outlined fleur with a small filled collar and connected crown", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 3,
        seed: "atlas-0000",
        family: "fleuron",
      },
    );
    expect(geometry.generationVersion).toBe(3);
    expect(geometry.options.crest).toBe("fleur");
    const contour = geometry.finePaths.filter(
      (path) => path.at(-1)?.kind === "Z" && path.some((command) => command.kind === "C"),
    );
    expect(contour).toHaveLength(2);
    expect(geometry.solidPaths.some((path) => path.some((command) => command.kind === "C"))).toBe(
      false,
    );
    const points = contour.flatMap(pathPoints);
    expect(geometry.bounds.railY - Math.min(...points.map((p) => p.y))).toBeLessThan(
      ((geometry.bounds.railY - geometry.bounds.left) * 2) / 3,
    );
    expect(Math.max(...points.map((p) => p.y))).toBe(geometry.bounds.railY - 4);
    const fleurHeight = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    const collar = geometry.solidPaths.find((path) =>
      pathPoints(path).every((point) => point.y < geometry.bounds.railY),
    );
    expect(collar).toBeDefined();
    const collarPoints = pathPoints(collar ?? []);
    const collarTop = Math.min(...collarPoints.map((p) => p.y));
    const collarBottom = Math.max(...collarPoints.map((p) => p.y));
    const collarLeft = Math.min(...collarPoints.map((p) => p.x));
    const collarRight = Math.max(...collarPoints.map((p) => p.x));
    expect((collarBottom - collarTop) / fleurHeight).toBeLessThanOrEqual(0.03);
    expect((collarRight - collarLeft) / fleurHeight).toBeLessThanOrEqual(0.27);
    // Both open contours meet the collar, with no detached petals or projecting crossbar.
    for (const [index, edge] of [collarTop, collarBottom].entries()) {
      const start = contour[index]?.[0];
      expect(start?.kind).toBe("M");
      if (start?.kind !== "M") throw new Error("Missing fleur contour start");
      expect(start.y).toBe(edge);
      expect(start.x).toBeGreaterThanOrEqual(collarLeft);
      expect(start.x).toBeLessThanOrEqual(collarRight);
    }
    expect(Object.isFrozen(contour[0])).toBe(true);
    expect(geometry.decorativePaths[0]?.[0]).toEqual({
      kind: "M",
      x: geometry.bounds.left,
      y: geometry.bounds.railY,
    });
    expect(Object.isFrozen(geometry.solidPaths[0])).toBe(true);
    expect(geometry).not.toHaveProperty("source");
    expect(geometry).not.toHaveProperty("identity");
  });
});
