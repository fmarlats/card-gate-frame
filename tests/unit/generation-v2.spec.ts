import { describe, expect, test } from "vitest";

import {
  type GateFamily,
  type GateGenerationOptions,
  type GateGeometry,
  type GateGeometryV2,
  type GatePath,
  generateGate,
  renderGateSVG,
} from "../../src/core/index.js";
import {
  sampleIndex,
  sampleKeyBytes,
  sampleScalar,
  sampleUint32,
} from "../../src/core/v2/sampler.js";

const collectPathNumbers = (value: unknown, numbers: number[] = []): number[] => {
  if (typeof value === "number") {
    numbers.push(value);
  } else if (Array.isArray(value)) {
    for (const nested of value) collectPathNumbers(nested, numbers);
  } else if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) collectPathNumbers(nested, numbers);
  }
  return numbers;
};

const expectRecursivelyFrozen = (value: unknown): void => {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectRecursivelyFrozen(nested);
};

const reverseObjectKeyOrder = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeyOrder);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeyOrder(nested)]),
  );
};

const commandKinds = (path: GateGeometry["structuralPaths"][number]): string =>
  path.map(({ kind }) => kind).join("");

const mirrorPathForTest = (path: GatePath, width: number): GatePath =>
  path.map((command) => {
    const mirrorX = (value: number): number => Math.round((width - value) * 10_000) / 10_000;
    switch (command.kind) {
      case "M":
      case "L":
        return { ...command, x: mirrorX(command.x) };
      case "C":
        return {
          ...command,
          x1: mirrorX(command.x1),
          x2: mirrorX(command.x2),
          x: mirrorX(command.x),
        };
      case "Q":
        return { ...command, x1: mirrorX(command.x1), x: mirrorX(command.x) };
      case "Z":
        return command;
    }
    throw new Error("unsupported gate path command");
  });

const commandYOperands = (command: GateGeometry["surfacePath"][number]): number[] => {
  switch (command.kind) {
    case "M":
    case "L":
      return [command.y];
    case "C":
      return [command.y1, command.y2, command.y];
    case "Q":
      return [command.y1, command.y];
    case "Z":
      return [];
  }
};

const structuralSignature = (geometry: Readonly<GateGeometryV2>): string => {
  const upperPaths = (
    [
      ["structuralPaths", geometry.structuralPaths],
      ["decorativePaths", geometry.decorativePaths],
    ] as const
  ).flatMap(([collection, paths]) =>
    paths.flatMap((path, index) => {
      const yOperands = path.flatMap(commandYOperands);
      if (!yOperands.some((value) => value < geometry.bounds.railY)) return [];
      return [
        {
          collection,
          index,
          yClasses: yOperands
            .map((value) =>
              value < geometry.bounds.railY ? "U" : value === geometry.bounds.railY ? "R" : "D",
            )
            .join(""),
        },
      ];
    }),
  );

  return JSON.stringify({
    normalized: {
      family: geometry.options.family,
      crest: geometry.options.crest,
    },
    structuralPaths: geometry.structuralPaths.map(commandKinds),
    decorativePaths: geometry.decorativePaths.map(commandKinds),
    upperPaths,
  });
};

type SignatureEntry = Readonly<{ family: GateFamily; signature: string }>;

const requireThreeStructuralSignaturesPerFamily = (
  entries: ReadonlyArray<SignatureEntry>,
): void => {
  const families: readonly GateFamily[] = [
    "courtyard",
    "fleuron",
    "arcade",
    "vine",
    "fan",
    "volute",
  ];
  for (const family of families) {
    const familyEntries = entries.filter((entry) => entry.family === family);
    if (
      familyEntries.length !== 3 ||
      new Set(familyEntries.map(({ signature }) => signature)).size !== 3
    ) {
      throw new Error(`${family} must have exactly three pairwise structural signatures`);
    }
  }
};

const flattenedPathOperands = (geometry: Readonly<GateGeometryV2>): number[] =>
  [...geometry.structuralPaths, ...geometry.decorativePaths].flatMap((path) =>
    path.flatMap((command) =>
      Object.values(command).filter((value): value is number => typeof value === "number"),
    ),
  );

const fixedJoinPoints = (
  geometry: Readonly<GateGeometryV2>,
): ReadonlyArray<readonly [number, number]> =>
  [...geometry.structuralPaths, ...geometry.decorativePaths].flatMap((path) =>
    path.flatMap((command) => {
      if (command.kind === "Z") return [];
      const point = [command.x, command.y] as const;
      return command.x === geometry.bounds.left ||
        command.x === geometry.bounds.right ||
        command.y === geometry.bounds.railY ||
        command.y === geometry.bounds.bottomY
        ? [point]
        : [];
    }),
  );

type TestPoint = Readonly<{ x: number; y: number }>;

const pathPointCoordinates = (path: GatePath): ReadonlyArray<readonly [number, number]> =>
  path
    .flatMap((command) => {
      switch (command.kind) {
        case "M":
        case "L":
          return [[command.x, command.y] as const];
        case "C":
          return [
            [command.x1, command.y1] as const,
            [command.x2, command.y2] as const,
            [command.x, command.y] as const,
          ];
        case "Q":
          return [[command.x1, command.y1] as const, [command.x, command.y] as const];
        case "Z":
          return [];
      }
      return [];
    })
    .sort(([leftX, leftY], [rightX, rightY]) => leftX - rightX || leftY - rightY);

const unpairedMirroredPoints = (paths: readonly GatePath[], width: number): string[] => {
  const widthUnits = Math.round(width * 10_000);
  const counts = new Map<string, number>();
  for (const [x, y] of paths.flatMap(pathPointCoordinates)) {
    const key = `${Math.round(x * 10_000)}:${Math.round(y * 10_000)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].flatMap(([key, count]) => {
    const [xUnitsText, yUnitsText] = key.split(":");
    const xUnits = Number(xUnitsText);
    const mirrorKey = `${widthUnits - xUnits}:${yUnitsText}`;
    return counts.get(mirrorKey) === count ? [] : [key];
  });
};

const pathStaysOutsideSafeRectangle = (
  path: GatePath,
  safe: Readonly<{ left: number; right: number; top: number; bottom: number }>,
  halfStroke: number,
): boolean => {
  let current: TestPoint | undefined;
  let subpathStart: TestPoint | undefined;

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
    if (
      !(
        hull.every(({ x }) => x + halfStroke <= safe.left) ||
        hull.every(({ x }) => x - halfStroke >= safe.right) ||
        hull.every(({ y }) => y + halfStroke <= safe.top) ||
        hull.every(({ y }) => y - halfStroke >= safe.bottom)
      )
    ) {
      return false;
    }
    current = end;
  }

  return true;
};

type DeclaredEndpointComponent = Readonly<{
  label: string;
  endpoints: ReadonlySet<string>;
  touchesFrame: boolean;
}>;

const endpointKey = (x: number, y: number): string =>
  `${Math.round(x * 10_000)}:${Math.round(y * 10_000)}`;

const disconnectedDeclaredEndpointComponents = (geometry: Readonly<GateGeometryV2>): string[] => {
  const { left, right, railY, bottomY } = geometry.bounds;
  const components: DeclaredEndpointComponent[] = [];

  for (const [collection, paths] of [
    ["structural", geometry.structuralPaths.slice(1)],
    ["decorative", geometry.decorativePaths],
  ] as const) {
    for (const [pathIndex, path] of paths.entries()) {
      let endpoints = new Set<string>();
      let touchesFrame = false;
      let subpathIndex = -1;

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
        if (subpathIndex < 0) return;
        components.push({
          label: `${collection}[${pathIndex}]#${subpathIndex}`,
          endpoints,
          touchesFrame,
        });
      };

      for (const command of path) {
        if (command.kind === "M") {
          finishSubpath();
          subpathIndex += 1;
          endpoints = new Set<string>();
          touchesFrame = false;
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

  return components.flatMap((component, index) => (attached.has(index) ? [] : [component.label]));
};

describe("generation v2 family grammar", () => {
  test("connects every V2 ornament subpath through exact declared endpoints to the canonical frame", () => {
    const familyCases = [
      { family: "courtyard", crests: ["spear", "diamond", "none"] },
      { family: "fleuron", crests: ["fleur", "spear", "none"] },
      { family: "arcade", crests: ["diamond", "spear", "none"] },
      { family: "vine", crests: ["fleur", "diamond", "none"] },
      { family: "fan", crests: ["diamond", "spear", "none"] },
      { family: "volute", crests: ["fleur", "spear", "none"] },
    ] as const;
    const failures: string[] = [];

    for (const { family, crests } of familyCases) {
      for (const seed of ["atlas-0000", "atlas-0004", "atlas-0271"] as const) {
        for (const crest of crests) {
          for (const sideComplexity of [0, 0.5, 1] as const) {
            const geometry = generateGate(
              { width: 600, height: 360 },
              { generationVersion: 2, family, seed, crest, sideComplexity },
            );
            const disconnected = disconnectedDeclaredEndpointComponents(geometry);
            if (disconnected.length > 0) {
              failures.push(
                `${family}/${seed}/${crest}/side-${sideComplexity}: ${disconnected.join(",")}`,
              );
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("keeps the rejected Vine review seeds to two or four large attached mirrored curls", () => {
    for (const seed of ["atlas-0000", "atlas-0004", "atlas-0271"] as const) {
      const curlCounts: number[] = [];
      for (const density of [0, 0.55, 1] as const) {
        const geometry = generateGate(
          { width: 600, height: 360 },
          { generationVersion: 2, family: "vine", seed, density, crest: "none" },
        );
        const upperSpan = geometry.bounds.right - geometry.bounds.left;
        const upperHeight = geometry.bounds.railY - geometry.bounds.left;
        const curls = geometry.structuralPaths.slice(1).filter((path) => {
          const start = path[0];
          const finish = path.at(-1);
          const points = pathPointCoordinates(path);
          const xs = points.map(([x]) => x);
          const ys = points.map(([, y]) => y);
          return (
            start?.kind === "M" &&
            start.y === geometry.bounds.railY &&
            finish?.kind === "C" &&
            finish.y < geometry.bounds.railY &&
            path.filter(({ kind }) => kind === "C").length >= 3 &&
            Math.max(...xs) - Math.min(...xs) >= upperSpan * 0.08 &&
            Math.max(...ys) - Math.min(...ys) >= upperHeight * 0.24
          );
        });

        expect(curls.length).toBeGreaterThanOrEqual(2);
        expect(curls.length).toBeLessThanOrEqual(4);
        expect(curls.length % 2).toBe(0);
        for (let index = 0; index < curls.length; index += 2) {
          expect(curls[index + 1]).toEqual(
            mirrorPathForTest(curls[index] as GatePath, geometry.dimensions.width),
          );
        }
        curlCounts.push(curls.length);
      }

      expect(curlCounts).toEqual([...curlCounts].sort((left, right) => left - right));
      expect(new Set(curlCounts).size).toBeGreaterThan(1);
    }
  });

  test("keeps a real quantized labelled displacement at symmetry 0.9999 in every family", () => {
    const cases = [
      ["courtyard", "inert-1"],
      ["fleuron", "inert-0"],
      ["arcade", "inert-9"],
      ["vine", "inert-50"],
      ["fan", "inert-1789"],
      ["volute", "inert-0"],
    ] as const;

    const displacedFamilies: GateFamily[] = [];
    for (const [family, seed] of cases) {
      const dimensions = { width: 160, height: 320 };
      const options = { generationVersion: 2, family, seed, crest: "none" } as const;
      const symmetric = generateGate(dimensions, { ...options, symmetry: 1 });
      const almostSymmetric = generateGate(dimensions, { ...options, symmetry: 0.9999 });
      const symmetricOperands = flattenedPathOperands(symmetric);
      const almostSymmetricOperands = flattenedPathOperands(almostSymmetric);
      const changedLatticeUnits = symmetricOperands.map((value, index) =>
        Math.abs(
          Math.round(value * 10_000) -
            Math.round((almostSymmetricOperands[index] ?? value) * 10_000),
        ),
      );
      const safe = {
        left: almostSymmetric.contentInsets.left,
        right: almostSymmetric.dimensions.width - almostSymmetric.contentInsets.right,
        top: almostSymmetric.contentInsets.top,
        bottom: almostSymmetric.dimensions.height - almostSymmetric.contentInsets.bottom,
      };

      expect(almostSymmetric.structuralPaths.map(commandKinds)).toEqual(
        symmetric.structuralPaths.map(commandKinds),
      );
      expect(almostSymmetric.decorativePaths.map(commandKinds)).toEqual(
        symmetric.decorativePaths.map(commandKinds),
      );
      expect(fixedJoinPoints(almostSymmetric)).toEqual(fixedJoinPoints(symmetric));
      const symmetricOrnaments = [
        ...symmetric.structuralPaths.slice(1),
        ...symmetric.decorativePaths,
      ];
      const almostSymmetricOrnaments = [
        ...almostSymmetric.structuralPaths.slice(1),
        ...almostSymmetric.decorativePaths,
      ];
      expect(unpairedMirroredPoints(symmetricOrnaments, symmetric.dimensions.width)).toEqual([]);
      if (
        Math.max(...changedLatticeUnits) >= 1 &&
        unpairedMirroredPoints(almostSymmetricOrnaments, almostSymmetric.dimensions.width).length >
          0
      ) {
        displacedFamilies.push(family);
      }
      for (const path of almostSymmetricOrnaments) {
        expect(
          pathStaysOutsideSafeRectangle(path, safe, almostSymmetric.options.strokeWidth / 2),
        ).toBe(true);
      }
    }
    expect(displacedFamilies).toEqual(cases.map(([family]) => family));
  });

  test("uses one mirrored tier for the exact two-petal fleuron at full symmetry", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "fleuron",
        density: 0.34,
        symmetry: 1,
        crest: "none",
      },
    );
    const [leftPetal, rightPetal] = geometry.decorativePaths;
    if (leftPetal?.[1]?.kind !== "Q" || rightPetal?.[1]?.kind !== "Q") {
      throw new Error("missing exact two-petal fleuron pair");
    }

    expect([leftPetal[1].y1, rightPetal[1].y1]).toEqual([59.6484, 59.6484]);
    expect(pathPointCoordinates(rightPetal)).toEqual(
      pathPointCoordinates(mirrorPathForTest(leftPetal, geometry.dimensions.width)),
    );
  });

  test("selects one mirrored arcade form for the exact even alternating-bay layout", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0271",
        family: "arcade",
        density: 0,
        symmetry: 1,
        crest: "none",
      },
    );
    const [leftBay, rightBay] = geometry.structuralPaths.slice(1);
    if (leftBay === undefined || rightBay === undefined) {
      throw new Error("missing exact two-bay arcade pair");
    }

    expect(sampleIndex("atlas-0271", "arcade/composition", 3)).toBe(2);
    expect(geometry.structuralPaths.slice(1).map(commandKinds)).toEqual(["MQ", "MQ"]);
    expect(pathPointCoordinates(rightBay)).toEqual(
      pathPointCoordinates(mirrorPathForTest(leftBay, geometry.dimensions.width)),
    );
  });

  test("represents every centered full-symmetry motif as exact pairs at an odd lattice width", () => {
    const familyCases = [
      { family: "courtyard", crests: ["spear", "diamond", "none"] },
      { family: "fleuron", crests: ["fleur", "spear", "none"] },
      { family: "arcade", crests: ["diamond", "spear", "none"] },
      { family: "vine", crests: ["fleur", "diamond", "none"] },
      { family: "fan", crests: ["diamond", "spear", "none"] },
      { family: "volute", crests: ["fleur", "spear", "none"] },
    ] as const;
    const seeds = ["atlas-0000", "atlas-0004", "atlas-0271"] as const;
    const unpairedCases: string[] = [];

    for (const { family, crests } of familyCases) {
      for (const seed of seeds) {
        for (const crest of crests) {
          const geometry = generateGate(
            { width: 160.0001, height: 320 },
            { generationVersion: 2, family, seed, symmetry: 1, crest },
          );
          const ornamentalPaths = [
            ...geometry.structuralPaths.slice(1),
            ...geometry.decorativePaths,
          ];
          const unpaired = unpairedMirroredPoints(ornamentalPaths, geometry.dimensions.width);
          if (unpaired.length > 0) unpairedCases.push(`${family}/${seed}/${crest}`);

          const safe = {
            left: geometry.contentInsets.left,
            right: geometry.dimensions.width - geometry.contentInsets.right,
            top: geometry.contentInsets.top,
            bottom: geometry.dimensions.height - geometry.contentInsets.bottom,
          };
          for (const path of ornamentalPaths) {
            expect(
              pathStaysOutsideSafeRectangle(path, safe, geometry.options.strokeWidth / 2),
            ).toBe(true);
            for (const [x, y] of pathPointCoordinates(path)) {
              expect(Math.round(x * 10_000) / 10_000).toBe(x);
              expect(Math.round(y * 10_000) / 10_000).toBe(y);
            }
          }
          for (const path of geometry.structuralPaths.slice(1)) {
            expect(
              fixedJoinPoints({ ...geometry, structuralPaths: [path], decorativePaths: [] }),
            ).not.toHaveLength(0);
          }
          expect(() => renderGateSVG(geometry)).not.toThrow();
        }
      }
    }

    expect(unpairedCases).toEqual([]);
  });

  test("keeps odd-width arcade topology fixed when symmetry drops below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0000",
      family: "arcade",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 160.0001, height: 320 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate(
      { width: 160.0001, height: 320 },
      { ...options, symmetry: 0.9999 },
    );

    expect(asymmetric.structuralPaths.map(commandKinds)).toEqual(
      symmetric.structuralPaths.map(commandKinds),
    );
    expect(asymmetric.decorativePaths.map(commandKinds)).toEqual(
      symmetric.decorativePaths.map(commandKinds),
    );
  });

  test("derives odd-width paired fleuron coordinates from one canonical side", () => {
    const geometry = generateGate(
      { width: 160.0001, height: 320 },
      {
        generationVersion: 2,
        seed: "odd-2",
        family: "fleuron",
        density: 0.34,
        symmetry: 1,
        crest: "none",
      },
    );
    const [leftStem, rightStem] = geometry.structuralPaths.slice(1);
    const [leftPetal, rightPetal] = geometry.decorativePaths;
    if (
      leftStem?.[0]?.kind !== "M" ||
      rightStem?.[0]?.kind !== "M" ||
      leftPetal?.[0]?.kind !== "M" ||
      rightPetal?.[0]?.kind !== "M"
    ) {
      throw new Error("missing exact odd-width fleuron pairs");
    }

    const widthUnits = Math.round(geometry.dimensions.width * 10_000);
    expect(Math.round(leftStem[0].x * 10_000) + Math.round(rightStem[0].x * 10_000)).toBe(
      widthUnits,
    );
    expect(Math.round(leftPetal[0].x * 10_000) + Math.round(rightPetal[0].x * 10_000)).toBe(
      widthUnits,
    );
    expect(pathPointCoordinates(rightStem)).toEqual(
      pathPointCoordinates(mirrorPathForTest(leftStem, geometry.dimensions.width)),
    );
    expect(pathPointCoordinates(rightPetal)).toEqual(
      pathPointCoordinates(mirrorPathForTest(leftPetal, geometry.dimensions.width)),
    );
  });

  test("resolves courtyard symmetry as an exact mirror at one and labelled displacement below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0000",
      family: "courtyard",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const repeated = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const symmetricLeft = symmetric.structuralPaths[1];
    const symmetricRight = symmetric.structuralPaths[2];
    const asymmetricLeft = asymmetric.structuralPaths[1];
    const asymmetricRight = asymmetric.structuralPaths[2];
    if (
      symmetricLeft === undefined ||
      symmetricRight === undefined ||
      asymmetricLeft === undefined ||
      asymmetricRight === undefined
    ) {
      throw new Error("missing fixed courtyard scroll pair");
    }

    expect(symmetricRight).toEqual(mirrorPathForTest(symmetricLeft, 600));
    expect(asymmetricRight).not.toEqual(mirrorPathForTest(asymmetricLeft, 600));
    expect(asymmetricLeft).toEqual(symmetricLeft);
    expect(asymmetricRight[0]).toEqual(mirrorPathForTest(asymmetricLeft, 600)[0]);
    const asymmetricFinish = asymmetricRight.at(-1);
    const mirroredFinish = mirrorPathForTest(asymmetricLeft, 600).at(-1);
    if (asymmetricFinish?.kind !== "C" || mirroredFinish?.kind !== "C") {
      throw new Error("missing fixed courtyard scroll finish");
    }
    expect({ x: asymmetricFinish.x, y: asymmetricFinish.y }).toEqual({
      x: mirroredFinish.x,
      y: mirroredFinish.y,
    });
    expect(asymmetric.structuralPaths.map(commandKinds)).toEqual(
      symmetric.structuralPaths.map(commandKinds),
    );
    expect(repeated).toEqual(asymmetric);
    expect(() => renderGateSVG(asymmetric)).not.toThrow();
  });

  test("resolves fleuron symmetry as an exact mirror at one and labelled displacement below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0004",
      family: "fleuron",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const repeated = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const symmetricLeft = symmetric.decorativePaths.at(-2);
    const symmetricRight = symmetric.decorativePaths.at(-1);
    const asymmetricLeft = asymmetric.decorativePaths.at(-2);
    const asymmetricRight = asymmetric.decorativePaths.at(-1);
    if (
      symmetricLeft === undefined ||
      symmetricRight === undefined ||
      asymmetricLeft === undefined ||
      asymmetricRight === undefined
    ) {
      throw new Error("missing fixed fleuron side pair");
    }

    expect(symmetricRight).toEqual(mirrorPathForTest(symmetricLeft, 600));
    expect(asymmetricRight).not.toEqual(mirrorPathForTest(asymmetricLeft, 600));
    expect(asymmetricLeft).toEqual(symmetricLeft);
    expect(asymmetricRight[0]).toEqual(mirrorPathForTest(asymmetricLeft, 600)[0]);
    expect(asymmetric.decorativePaths.map(commandKinds)).toEqual(
      symmetric.decorativePaths.map(commandKinds),
    );
    expect(repeated).toEqual(asymmetric);
    expect(() => renderGateSVG(asymmetric)).not.toThrow();
  });

  test("resolves volute symmetry as an exact mirror at one and labelled displacement below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0271",
      family: "volute",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const repeated = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const symmetricLeft = symmetric.decorativePaths.at(-2);
    const symmetricRight = symmetric.decorativePaths.at(-1);
    const asymmetricLeft = asymmetric.decorativePaths.at(-2);
    const asymmetricRight = asymmetric.decorativePaths.at(-1);
    if (
      symmetricLeft === undefined ||
      symmetricRight === undefined ||
      asymmetricLeft === undefined ||
      asymmetricRight === undefined
    ) {
      throw new Error("missing fixed volute side pair");
    }

    expect(symmetricRight).toEqual(mirrorPathForTest(symmetricLeft, 600));
    expect(asymmetricRight).not.toEqual(mirrorPathForTest(asymmetricLeft, 600));
    expect(asymmetricLeft).toEqual(symmetricLeft);
    expect(asymmetricRight[0]).toEqual(mirrorPathForTest(asymmetricLeft, 600)[0]);
    expect(asymmetric.decorativePaths.map(commandKinds)).toEqual(
      symmetric.decorativePaths.map(commandKinds),
    );
    expect(repeated).toEqual(asymmetric);
    expect(() => renderGateSVG(asymmetric)).not.toThrow();
  });

  test("resolves vine symmetry as an exact mirror at one and independently labelled displacement below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0271",
      family: "vine",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const repeated = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const symmetricLeft = symmetric.decorativePaths[0];
    const symmetricRight = symmetric.decorativePaths[1];
    const asymmetricLeft = asymmetric.decorativePaths[0];
    const asymmetricRight = asymmetric.decorativePaths[1];
    if (
      symmetricLeft === undefined ||
      symmetricRight === undefined ||
      asymmetricLeft === undefined ||
      asymmetricRight === undefined
    ) {
      throw new Error("missing fixed vine leaf pair");
    }

    expect(symmetricRight).toEqual(mirrorPathForTest(symmetricLeft, 600));
    expect(asymmetricRight).not.toEqual(mirrorPathForTest(asymmetricLeft, 600));
    expect(asymmetricLeft).not.toEqual(symmetricLeft);
    expect(asymmetricRight[0]).toEqual(mirrorPathForTest(asymmetricLeft, 600)[0]);
    expect(asymmetric.decorativePaths.map(commandKinds)).toEqual(
      symmetric.decorativePaths.map(commandKinds),
    );
    expect(repeated).toEqual(asymmetric);
    expect(() => renderGateSVG(asymmetric)).not.toThrow();
  });

  test("resolves fan symmetry as an exact mirror at one and independently labelled displacement below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0000",
      family: "fan",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const repeated = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const symmetricLeft = symmetric.structuralPaths[1];
    const symmetricRight = symmetric.structuralPaths[2];
    const asymmetricLeft = asymmetric.structuralPaths[1];
    const asymmetricRight = asymmetric.structuralPaths[2];
    if (
      symmetricLeft === undefined ||
      symmetricRight === undefined ||
      asymmetricLeft === undefined ||
      asymmetricRight === undefined
    ) {
      throw new Error("missing fixed fan ray pair");
    }

    expect(symmetricRight).toEqual(mirrorPathForTest(symmetricLeft, 600));
    expect(asymmetricRight).not.toEqual(mirrorPathForTest(asymmetricLeft, 600));
    expect(asymmetricLeft).not.toEqual(symmetricLeft);
    expect(asymmetricRight.slice(0, 2)).toEqual(mirrorPathForTest(asymmetricLeft, 600).slice(0, 2));
    expect(asymmetric.structuralPaths.map(commandKinds)).toEqual(
      symmetric.structuralPaths.map(commandKinds),
    );
    expect(repeated).toEqual(asymmetric);
    expect(() => renderGateSVG(asymmetric)).not.toThrow();
  });

  test("keeps arcade exact at full symmetry and applies its existing labelled displacement below one", () => {
    const options = {
      generationVersion: 2,
      seed: "atlas-0004",
      family: "arcade",
      crest: "none",
    } as const;
    const symmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 1 });
    const asymmetric = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const repeated = generateGate({ width: 600, height: 360 }, { ...options, symmetry: 0.35 });
    const symmetricBay = symmetric.structuralPaths[1];
    const asymmetricBay = asymmetric.structuralPaths[1];
    if (
      symmetricBay?.[0]?.kind !== "M" ||
      symmetricBay[1]?.kind !== "Q" ||
      asymmetricBay?.[0]?.kind !== "M" ||
      asymmetricBay[1]?.kind !== "Q"
    ) {
      throw new Error("missing fixed arcade round bay");
    }
    const symmetricStart = symmetricBay[0];
    const symmetricArch = symmetricBay[1];
    const asymmetricStart = asymmetricBay[0];
    const asymmetricArch = asymmetricBay[1];

    expect(symmetricArch.x1).toBe((symmetricStart.x + symmetricArch.x) / 2);
    expect(asymmetricArch.x1).not.toBe((asymmetricStart.x + asymmetricArch.x) / 2);
    expect({ x: asymmetricStart.x, y: asymmetricStart.y }).toEqual({
      x: symmetricStart.x,
      y: symmetricStart.y,
    });
    expect({ x: asymmetricArch.x, y: asymmetricArch.y }).toEqual({
      x: symmetricArch.x,
      y: symmetricArch.y,
    });
    expect(asymmetric.structuralPaths.map(commandKinds)).toEqual(
      symmetric.structuralPaths.map(commandKinds),
    );
    expect(repeated).toEqual(asymmetric);
    expect(() => renderGateSVG(asymmetric)).not.toThrow();
  });

  test("maps fleuron petal-span against the shared upper-slot width in public geometry", () => {
    const seed = "atlas-0004";
    const geometry = generateGate(
      { width: 600, height: 360 },
      { generationVersion: 2, seed, family: "fleuron", crest: "none" },
    );
    const braceControl = geometry.structuralPaths[1]?.[1];
    if (braceControl?.kind !== "C") throw new Error("missing fixed fleuron brace control");
    const canonical = (value: number): number => Math.round(value * 10_000) / 10_000;
    const upperSlotWidth = geometry.bounds.right - geometry.bounds.left;
    const expectedPetalSpan = canonical(
      upperSlotWidth * (0.12 + 0.1 * sampleScalar(seed, "fleuron/proportion/petal-span")),
    );
    const publicPetalSpan = canonical(geometry.dimensions.width / 2 - braceControl.x2);

    expect(sampleIndex(seed, "fleuron/composition", 3)).toBe(0);
    expect(publicPetalSpan).toBe(expectedPetalSpan);
    expect(braceControl.x2).toBe(canonical(geometry.dimensions.width / 2 - expectedPetalSpan));
  });

  test("maps volute coil-radius against the shared upper-slot width in public geometry", () => {
    const seed = "atlas-0271";
    const geometry = generateGate(
      { width: 600, height: 360 },
      { generationVersion: 2, seed, family: "volute", crest: "none" },
    );
    const firstCoil = geometry.structuralPaths[1]?.[1];
    if (firstCoil?.kind !== "C") throw new Error("missing fixed volute coil control");
    const canonical = (value: number): number => Math.round(value * 10_000) / 10_000;
    const upperSlotWidth = geometry.bounds.right - geometry.bounds.left;
    const expectedCoilRadius = canonical(
      upperSlotWidth * (0.1 + 0.08 * sampleScalar(seed, "volute/proportion/coil-radius")),
    );

    expect(sampleIndex(seed, "volute/composition", 3)).toBe(0);
    expect(firstCoil.x1).toBe(canonical(geometry.bounds.left + expectedCoilRadius * 0.18));
  });

  test("composes the fixed courtyard paired-scroll structure through the public core API", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "courtyard",
        crest: "spear",
      },
    );

    expect(geometry.options).toMatchObject({
      generationVersion: 2,
      family: "courtyard",
      crest: "spear",
    });
    expect(geometry.structuralPaths.map(commandKinds)).toContain("MCC");
    expect(geometry.decorativePaths.some((path) => commandKinds(path).includes("C"))).toBe(true);
  });

  test("composes the fixed fleuron heart-ogee structure through the public core API", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "fleuron",
        crest: "fleur",
      },
    );

    expect(geometry.options).toMatchObject({
      generationVersion: 2,
      family: "fleuron",
      crest: "fleur",
    });
    expect(geometry.structuralPaths.map(commandKinds)).toContain("MCC");
  });

  test("keeps the fleur crest compact and broad within the public upper slot", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "compact-fleur-proportions",
        family: "fleuron",
        crest: "fleur",
      },
    );
    const crest = geometry.decorativePaths.at(-1);
    if (crest === undefined) throw new Error("missing fleur crest");

    const endpoints = crest.flatMap((command) =>
      command.kind === "Z" ? [] : [[command.x, command.y] as const],
    );
    const xs = endpoints.map(([x]) => x);
    const ys = endpoints.map(([, y]) => y);
    const crestHeight = Math.max(...ys) - Math.min(...ys);
    const crestSpan = Math.max(...xs) - Math.min(...xs);
    const upperEdge = geometry.options.inset + geometry.options.strokeWidth / 2;
    const upperSlotHeight = geometry.bounds.railY - upperEdge;

    expect(crestHeight / upperSlotHeight).toBeGreaterThanOrEqual(0.42);
    expect(crestHeight / upperSlotHeight).toBeLessThanOrEqual(0.55);
    expect(crestHeight / crestSpan).toBeGreaterThanOrEqual(1.2);
    expect(crestHeight / crestSpan).toBeLessThanOrEqual(1.55);
  });

  test("renders a recognizable classical fleur crest through the public core API", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "classical-fleur-crest",
        family: "fleuron",
        crest: "fleur",
      },
    );
    const crest = geometry.decorativePaths.at(-1);
    if (crest === undefined) throw new Error("missing fleur crest");

    const centerX = geometry.dimensions.width / 2;
    const upperEdge = geometry.options.inset + geometry.options.strokeWidth / 2;
    const components: Array<Array<GatePath[number]>> = [];
    for (const command of crest) {
      if (command.kind === "M") {
        components.push([command]);
        continue;
      }
      const component = components.at(-1);
      if (component === undefined) throw new Error("fleur command precedes its move");
      component.push(command);
    }
    expect(components.map(commandKinds)).toEqual(["ML", "MCC", "MCC", "ML", "MC", "MC", "MCCZ"]);
    const [stem, leftPetal, rightPetal, collar, leftSepal, rightSepal, centralPetal] = components;
    if (
      stem === undefined ||
      centralPetal === undefined ||
      leftPetal === undefined ||
      rightPetal === undefined ||
      collar === undefined ||
      leftSepal === undefined ||
      rightSepal === undefined
    ) {
      throw new Error("missing connected fleur components");
    }

    const [stemStart, stemEnd] = stem;
    const [centralStart, centralRise, centralReturn] = centralPetal;
    const [leftPetalStart, leftPetalOut, leftPetalReturn] = leftPetal;
    const [rightPetalStart, rightPetalOut, rightPetalReturn] = rightPetal;
    const [collarStart, collarEnd] = collar;
    const [leftSepalStart, leftSepalCurve] = leftSepal;
    const [rightSepalStart, rightSepalCurve] = rightSepal;
    if (
      stemStart?.kind !== "M" ||
      stemEnd?.kind !== "L" ||
      centralStart?.kind !== "M" ||
      centralRise?.kind !== "C" ||
      centralReturn?.kind !== "C" ||
      leftPetalStart?.kind !== "M" ||
      leftPetalOut?.kind !== "C" ||
      leftPetalReturn?.kind !== "C" ||
      rightPetalStart?.kind !== "M" ||
      rightPetalOut?.kind !== "C" ||
      rightPetalReturn?.kind !== "C" ||
      collarStart?.kind !== "M" ||
      collarEnd?.kind !== "L" ||
      leftSepalStart?.kind !== "M" ||
      leftSepalCurve?.kind !== "C" ||
      rightSepalStart?.kind !== "M" ||
      rightSepalCurve?.kind !== "C"
    ) {
      throw new Error("malformed connected fleur components");
    }

    const junction = { x: centerX, y: stemEnd.y };
    const centerTip = { x: centralRise.x, y: centralRise.y };
    const leftTip = { x: leftPetalOut.x, y: leftPetalOut.y };
    const rightTip = { x: rightPetalOut.x, y: rightPetalOut.y };
    const collarWidth = collarEnd.x - collarStart.x;
    const sideReach = centerX - leftTip.x;
    const crestHeight = geometry.bounds.railY - centerTip.y;
    const lateralTipSpan = rightTip.x - leftTip.x;
    const crestPoints = crest.flatMap((command) => {
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

    expect(stemStart).toEqual({ kind: "M", x: centerX, y: geometry.bounds.railY });
    expect(stemEnd.x).toBe(centerX);
    expect(centralStart).toEqual({ kind: "M", ...junction });
    expect({ x: centralReturn.x, y: centralReturn.y }).toEqual(junction);
    expect(centerTip.x).toBe(centerX);
    expect(centerTip.y).toBeGreaterThan(upperEdge);
    expect(centralRise.x1 + centralReturn.x2).toBe(centerX * 2);
    expect(centralRise.y1).toBe(centralReturn.y2);
    expect(centralRise.x2 + centralReturn.x1).toBe(centerX * 2);
    expect(centralRise.y2).toBe(centralReturn.y1);
    expect(
      Math.max(centralRise.x1, centralRise.x2, centralReturn.x1, centralReturn.x2) -
        Math.min(centralRise.x1, centralRise.x2, centralReturn.x1, centralReturn.x2),
    ).toBeGreaterThanOrEqual(14);
    expect(
      Math.max(centralRise.x1, centralRise.x2, centralReturn.x1, centralReturn.x2) -
        Math.min(centralRise.x1, centralRise.x2, centralReturn.x1, centralReturn.x2),
    ).toBeLessThanOrEqual(17);

    expect(leftPetalStart).toEqual({ kind: "M", ...junction });
    expect(rightPetalStart).toEqual({ kind: "M", ...junction });
    expect(rightPetal).toEqual(mirrorPathForTest(leftPetal, geometry.dimensions.width));

    expect(lateralTipSpan / crestHeight).toBeGreaterThanOrEqual(0.65);
    expect(lateralTipSpan / crestHeight).toBeLessThanOrEqual(0.85);
    expect(leftTip.y).toBe(rightTip.y);
    expect((leftTip.y - centerTip.y) / crestHeight).toBeGreaterThanOrEqual(0.35);
    expect(centerX - leftPetalOut.x2).toBeGreaterThanOrEqual(sideReach * 0.5);
    expect(leftPetalOut.y2).toBeLessThan(leftTip.y);
    expect(centerX - leftPetalReturn.x1).toBeGreaterThanOrEqual(sideReach * 0.9);
    expect(leftPetalReturn.y1).toBeGreaterThan(leftTip.y);

    expect(collarStart.y).toBeGreaterThan(leftTip.y);
    expect(collarEnd.y).toBe(collarStart.y);
    expect(collarStart.x + collarEnd.x).toBe(centerX * 2);
    expect(collarWidth).toBeGreaterThanOrEqual(20);
    expect(collarWidth).toBeLessThanOrEqual(28);
    expect({ x: leftPetalReturn.x, y: leftPetalReturn.y }).toEqual({
      x: collarStart.x,
      y: collarStart.y,
    });
    expect({ x: rightPetalReturn.x, y: rightPetalReturn.y }).toEqual({
      x: collarEnd.x,
      y: collarEnd.y,
    });

    expect(leftSepalStart).toEqual({ kind: "M", x: collarStart.x, y: collarStart.y });
    expect(rightSepalStart).toEqual({ kind: "M", x: collarEnd.x, y: collarEnd.y });
    expect(rightSepal).toEqual(mirrorPathForTest(leftSepal, geometry.dimensions.width));
    expect({ x: leftSepalCurve.x, y: leftSepalCurve.y }).toEqual({
      x: centerX,
      y: geometry.bounds.railY,
    });
    expect({ x: rightSepalCurve.x, y: rightSepalCurve.y }).toEqual({
      x: centerX,
      y: geometry.bounds.railY,
    });
    expect(
      [centerX - leftSepalCurve.x1, centerX - leftSepalCurve.x2].every(
        (halfWidth) => halfWidth > collarWidth / 2,
      ),
    ).toBe(true);
    expect(leftSepalCurve.y1).toBeGreaterThan(collarStart.y);
    expect(leftSepalCurve.y2).toBeLessThan(geometry.bounds.railY);

    expect(unpairedMirroredPoints([crest], geometry.dimensions.width)).toEqual([]);
    expect(
      collectPathNumbers(crest).every(
        (value) => !Object.is(value, -0) && Math.round(value * 10_000) / 10_000 === value,
      ),
    ).toBe(true);
    expect(
      crestPoints.every(
        ({ x, y }) =>
          x >= geometry.bounds.left &&
          x <= geometry.bounds.right &&
          y >= upperEdge &&
          y <= geometry.bounds.railY,
      ),
    ).toBe(true);
  });

  test("composes the fixed arcade pointed-ogee structure instead of the round-bay tracer", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "arcade",
        crest: "diamond",
      },
    );

    expect(geometry.options.family).toBe("arcade");
    expect(geometry.structuralPaths.slice(1).map(commandKinds)).toEqual(
      expect.arrayContaining(["MCC"]),
    );
  });

  test("composes the fixed vine swept-branches structure through the public core API", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "vine",
        crest: "fleur",
      },
    );

    expect(geometry.options).toMatchObject({ family: "vine", crest: "fleur" });
    expect(geometry.structuralPaths.map(commandKinds)).toContain("MCCC");
  });

  test("composes the fixed fan sunburst with five rays per half through the public core API", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "fan",
        crest: "diamond",
      },
    );

    expect(geometry.options).toMatchObject({ family: "fan", crest: "diamond" });
    expect(geometry.structuralPaths.slice(1).map(commandKinds)).toEqual(
      Array.from({ length: 10 }, () => "MLL"),
    );
  });

  test("composes the fixed volute rocaille-crown structure through the public core API", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "atlas-0000",
        family: "volute",
        crest: "fleur",
      },
    );

    expect(geometry.options).toMatchObject({ family: "volute", crest: "fleur" });
    expect(geometry.structuralPaths.map(commandKinds)).toContain("MCCCC");
    expect(geometry.decorativePaths.some((path) => commandKinds(path).includes("C"))).toBe(true);
  });

  test("maps omitted and explicit auto family inputs across all six fixed buckets", () => {
    const buckets = [
      ["auto-2", "courtyard"],
      ["auto-3", "fleuron"],
      ["auto-12", "arcade"],
      ["auto-0", "vine"],
      ["auto-1", "fan"],
      ["auto-7", "volute"],
    ] as const;

    for (const [seed, family] of buckets) {
      expect(
        generateGate({ width: 600, height: 360 }, { generationVersion: 2, seed }).options.family,
      ).toBe(family);
      expect(
        generateGate({ width: 600, height: 360 }, { generationVersion: 2, seed, family: "auto" })
          .options.family,
      ).toBe(family);
    }
  });

  test("gives the exact 18-candidate atlas three pairwise structural signatures per family", () => {
    const seeds = ["atlas-0000", "atlas-0004", "atlas-0271"] as const;
    const expected: ReadonlyArray<readonly [GateFamily, readonly [number, number, number]]> = [
      ["courtyard", [0, 2, 1]],
      ["fleuron", [1, 0, 2]],
      ["arcade", [1, 0, 2]],
      ["vine", [2, 1, 0]],
      ["fan", [0, 2, 1]],
      ["volute", [1, 2, 0]],
    ];
    const entries: SignatureEntry[] = [];

    for (const [family, expectedCompositions] of expected) {
      expect(seeds.map((seed) => sampleIndex(seed, `${family}/composition`, 3))).toEqual(
        expectedCompositions,
      );
      for (const seed of seeds) {
        const geometry = generateGate(
          { width: 600, height: 360 },
          { generationVersion: 2, seed, family },
        );
        entries.push({ family, signature: structuralSignature(geometry) });
      }
    }

    expect(entries).toHaveLength(18);
    expect(() => requireThreeStructuralSignaturesPerFamily(entries)).not.toThrow();
  });

  test("keeps each published same-composition witness structurally equal but numerically distinct", () => {
    const witnesses = [
      {
        family: "courtyard",
        seeds: ["courtyard-witness-0013", "courtyard-witness-0015"],
        tuple: [0, 0, 0, 1],
        anchorLabel: "courtyard/anchor/scroll-reach",
        anchors: [907_237_254, 577_104_975],
      },
      {
        family: "fleuron",
        seeds: ["fleuron-witness-0012", "fleuron-witness-0017"],
        tuple: [2, 0, 2, 0],
        anchorLabel: "fleuron/proportion/petal-span",
        anchors: [2_713_009_882, 1_222_226_322],
      },
      {
        family: "arcade",
        seeds: ["arcade-witness-0003", "arcade-witness-0005"],
        tuple: [0, 1, 2, 0],
        anchorLabel: "arcade/anchor/spring-height",
        anchors: [2_969_853_466, 2_841_691_378],
      },
      {
        family: "vine",
        seeds: ["vine-witness-0004", "vine-witness-0016"],
        tuple: [0, 0, 2, 1],
        anchorLabel: "vine/anchor/leaf-node",
        anchors: [1_629_655_058, 3_566_045_730],
      },
      {
        family: "fan",
        seeds: ["fan-witness-0001", "fan-witness-0003"],
        tuple: [0, 0, 2, 2],
        anchorLabel: "fan/anchor/origin-height",
        anchors: [2_044_896_342, 3_994_956_922],
      },
      {
        family: "volute",
        seeds: ["volute-witness-0003", "volute-witness-0009"],
        tuple: [2, 2, 0, 2],
        anchorLabel: "volute/proportion/coil-radius",
        anchors: [4_182_871_243, 795_605_191],
      },
    ] as const;

    for (const witness of witnesses) {
      const geometries = witness.seeds.map((seed) =>
        generateGate(
          { width: 600, height: 360 },
          { generationVersion: 2, seed, family: witness.family },
        ),
      );
      for (const [index, seed] of witness.seeds.entries()) {
        expect([
          sampleIndex(seed, `${witness.family}/composition`, 3),
          sampleIndex(seed, `${witness.family}/crest`, 3),
          sampleIndex(seed, `${witness.family}/sides`, 3),
          sampleIndex(seed, `${witness.family}/motif-count`, 3),
        ]).toEqual(witness.tuple);
        expect(sampleUint32(seed, witness.anchorLabel)).toBe(witness.anchors[index]);
      }

      const first = geometries[0];
      const second = geometries[1];
      if (first === undefined || second === undefined) throw new Error("missing witness geometry");
      expect(structuralSignature(first)).toBe(structuralSignature(second));
      expect(flattenedPathOperands(first)).not.toEqual(flattenedPathOperands(second));
      for (const geometry of geometries) {
        expectRecursivelyFrozen(geometry);
        expect(() =>
          renderGateSVG(geometry, { stroke: "#202427", surface: "#f2eadb" }),
        ).not.toThrow();
        const halfStroke = geometry.options.strokeWidth / 2;
        const safe = {
          left: geometry.contentInsets.left,
          right: geometry.dimensions.width - geometry.contentInsets.right,
          top: geometry.contentInsets.top,
          bottom: geometry.dimensions.height - geometry.contentInsets.bottom,
        };
        for (const path of geometry.decorativePaths) {
          const xs: number[] = [];
          const ys: number[] = [];
          for (const command of path) {
            for (const [field, value] of Object.entries(command)) {
              if (typeof value === "number") (field.startsWith("x") ? xs : ys).push(value);
            }
          }
          expect(
            xs.every((value) => value + halfStroke <= safe.left) ||
              xs.every((value) => value - halfStroke >= safe.right) ||
              ys.every((value) => value + halfStroke <= safe.top) ||
              ys.every((value) => value - halfStroke >= safe.bottom),
          ).toBe(true);
        }
      }
    }
  });

  test("rejects a synthetic corpus collapsed to one signature per family", () => {
    const families: readonly GateFamily[] = [
      "courtyard",
      "fleuron",
      "arcade",
      "vine",
      "fan",
      "volute",
    ];
    const collapsed = families.flatMap((family) =>
      Array.from({ length: 3 }, () => ({ family, signature: "collapsed" })),
    );

    expect(() => requireThreeStructuralSignaturesPerFamily(collapsed)).toThrow(
      "must have exactly three pairwise structural signatures",
    );
  });
});

describe("generation v2 arcade tracer", () => {
  test("generates one explicit arcade through the public core API", () => {
    const geometry = generateGate({ width: 600, height: 360 }, {
      generationVersion: 2,
      seed: "arcade-tracer",
      family: "arcade",
    } as never);

    expect(geometry).toMatchObject({
      schemaVersion: 1,
      generationVersion: 2,
      seed: "arcade-tracer",
      dimensions: { width: 600, height: 360 },
      options: {
        generationVersion: 2,
        family: "arcade",
        density: 0.55,
        curvature: 0.65,
        symmetry: 1,
        peakHeight: 0.35,
        sideComplexity: 0.5,
        inset: 8,
        strokeWidth: 2,
      },
    });
    expect(geometry.structuralPaths.length).toBeGreaterThan(1);
    expect(geometry.decorativePaths.length).toBeGreaterThan(0);
  });

  test("normalizes v2 defaults and auto to concrete arcade choices", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      { generationVersion: 2, seed: "atlas-0000" },
    );

    expect(geometry.options).toEqual({
      generationVersion: 2,
      family: "arcade",
      density: 0.55,
      curvature: 0.65,
      symmetry: 1,
      peakHeight: 0.35,
      sideComplexity: 0.5,
      crest: "spear",
      inset: 8,
      strokeWidth: 2,
    });
  });

  test("uses only own input properties for v2 opt-in and normalization", () => {
    const inheritedVersion = Object.assign(Object.create({ generationVersion: 2 }), {
      seed: "inherited-version",
      family: "courtyard",
    }) as GateGenerationOptions;
    expect(() => generateGate({ width: 600, height: 360 }, inheritedVersion)).toThrowError(
      "GF-01 supports only generationVersion 1",
    );

    const inheritedV2Values = Object.create({
      family: "vine",
      density: 0.1,
      curvature: 0.2,
      symmetry: 0.3,
      peakHeight: 0.4,
      sideComplexity: 0.5,
      crest: "fleur",
    }) as Record<string, unknown>;
    inheritedV2Values.generationVersion = 2;
    inheritedV2Values.seed = "atlas-0000";

    const clean = generateGate(
      { width: 600, height: 360 },
      { generationVersion: 2, seed: "atlas-0000" },
    );
    expect(generateGate({ width: 600, height: 360 }, inheritedV2Values as never)).toEqual(clean);

    const inheritedSeed = Object.create({ seed: "prototype-seed" }) as Record<string, unknown>;
    inheritedSeed.generationVersion = 2;
    inheritedSeed.family = "arcade";
    expect(() => generateGate({ width: 600, height: 360 }, inheritedSeed as never)).toThrowError(
      "Gate seeds must be non-empty strings or finite numbers",
    );
  });

  test("serializes exact raw aspect-boundary dimensions after canonical rounding", () => {
    const lowerWidth = 160.000_04;
    const upperHeight = 96.000_04;
    const cases = [
      {
        dimensions: { width: lowerWidth, height: lowerWidth * 2 },
        expected: { width: 160, height: 320.0001 },
        options: { seed: "v1-lower-aspect", family: "courtyard" },
      },
      {
        dimensions: { width: upperHeight * 6, height: upperHeight },
        expected: { width: 576.0002, height: 96 },
        options: { seed: "v1-upper-aspect", family: "courtyard" },
      },
      {
        dimensions: { width: lowerWidth, height: lowerWidth * 2 },
        expected: { width: 160, height: 320.0001 },
        options: { generationVersion: 2, seed: "v2-lower-aspect", family: "arcade" },
      },
      {
        dimensions: { width: upperHeight * 6, height: upperHeight },
        expected: { width: 576.0002, height: 96 },
        options: { generationVersion: 2, seed: "v2-upper-aspect", family: "arcade" },
      },
    ] as const;

    for (const boundary of cases) {
      const geometry = generateGate(boundary.dimensions, boundary.options as never);
      expect(geometry.dimensions).toEqual(boundary.expected);
      expect(renderGateSVG(geometry)).toContain(
        `width="${boundary.expected.width}" height="${boundary.expected.height}"`,
      );
    }

    for (const options of [
      { seed: "v1-outside-aspect", family: "courtyard" },
      { generationVersion: 2, seed: "v2-outside-aspect", family: "arcade" },
    ] as const) {
      expect(() =>
        generateGate({ width: lowerWidth, height: lowerWidth * 2 + 0.000_001 }, options as never),
      ).toThrowError("Gate dimensions have an unsupported aspect ratio");
      expect(() =>
        generateGate({ width: upperHeight * 6 + 0.000_001, height: upperHeight }, options as never),
      ).toThrowError("Gate dimensions have an unsupported aspect ratio");
    }
  });

  test("rejects invalid versions, families, crests, controls, and v1 control presence", () => {
    const dimensions = { width: 600, height: 360 };
    const invalidOptions: unknown[] = [
      { seed: "v1-control", family: "courtyard", symmetry: undefined },
      { seed: "v1-control", family: "courtyard", generationVersion: 1, peakHeight: 0.2 },
      { seed: "v1-control", family: "courtyard", sideComplexity: 0.2 },
      { seed: "v1-control", family: "courtyard", crest: "spear" },
      { generationVersion: 4, seed: "version", family: "arcade" },
      { generationVersion: 2, seed: "crest", family: "arcade", crest: "fleur" },
      { generationVersion: 2, seed: "crest", family: "arcade", crest: "crown" },
      { generationVersion: 2, seed: "unknown", family: "arcade", strokeWidth: 4 },
    ];
    for (const control of ["density", "curvature", "symmetry", "peakHeight", "sideComplexity"]) {
      for (const value of [null, Number.NaN, Number.NEGATIVE_INFINITY, -0.0001, 1.0001]) {
        invalidOptions.push({
          generationVersion: 2,
          seed: "control",
          family: "arcade",
          [control]: value,
        });
      }
    }

    for (const options of invalidOptions) {
      expect(() => generateGate(dimensions, options as never)).toThrow();
    }
  });

  test("matches every published labelled sampler vector and key byte", () => {
    const vectors = [
      ["lyon-42", "family", undefined, 3_075_099_798, 0.7159774652682245, 4, 6],
      [42, "family", undefined, 3_637_857_891, 0.8470047942828387, 5, 6],
      ["42", "family", undefined, 4_026_066_228, 0.937391591258347, 5, 6],
      ["grille-é", "vine/anchor/leaf-node", undefined, 381_489_204, 0.08882237691432238, 8, 100],
      ["lyon-42", "volute/detail", 3, 3_904_562_741, 0.9091018561739475, 14, 16],
    ] as const;

    for (const [seed, label, index, uint32, scalar, selectedIndex, count] of vectors) {
      expect(sampleUint32(seed, label, index)).toBe(uint32);
      expect(sampleScalar(seed, label, index)).toBe(scalar);
      expect(sampleIndex(seed, label, count, index)).toBe(selectedIndex);
    }

    expect(Buffer.from(sampleKeyBytes("lyon-42", "family")).toString("hex")).toBe(
      "676174652d6672616d652f76322f73616d706c650073070000006c796f6e2d34320600000066616d696c7900",
    );
    expect(Buffer.from(sampleKeyBytes("lyon-42", "volute/detail", 3)).toString("hex")).toBe(
      "676174652d6672616d652f76322f73616d706c650073070000006c796f6e2d34320d000000766f6c7574652f64657461696c0103000000",
    );
  });

  test("keeps arcade bounds, joins, content safety, canonical numbers, and deep freezing", () => {
    const geometry = generateGate(
      { width: 600, height: 360 },
      {
        generationVersion: 2,
        seed: "arcade-invariants",
        family: "arcade",
        symmetry: 1,
        crest: "diamond",
      },
    );
    const { left, right, railY, bottomY } = geometry.bounds;
    const safe = {
      left: geometry.contentInsets.left,
      right: geometry.dimensions.width - geometry.contentInsets.right,
      top: geometry.contentInsets.top,
      bottom: geometry.dimensions.height - geometry.contentInsets.bottom,
    };
    const allPaths = [
      geometry.surfacePath,
      ...geometry.structuralPaths,
      ...geometry.decorativePaths,
    ];

    expect(geometry.surfacePath.slice(0, 5)).toEqual([
      { kind: "M", x: left, y: railY },
      { kind: "L", x: right, y: railY },
      { kind: "L", x: right, y: bottomY },
      { kind: "L", x: left, y: bottomY },
      { kind: "Z" },
    ]);
    expect(safe.left).toBeLessThan(safe.right);
    expect(safe.top).toBeLessThan(safe.bottom);

    for (const path of geometry.structuralPaths.slice(1)) {
      expect(path[0]).toMatchObject({ kind: "M", y: railY });
      expect(path.at(-1)).toMatchObject({ y: railY });
      const start = path[0];
      const finish = path.at(-1);
      const apex = path[1];
      if (start?.kind === "M" && finish?.kind === "Q" && apex?.kind === "Q") {
        expect(apex.x1).toBe((start.x + finish.x) / 2);
      }
    }

    for (const path of geometry.decorativePaths) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const command of path) {
        for (const [field, value] of Object.entries(command)) {
          if (typeof value === "number") (field.startsWith("x") ? xs : ys).push(value);
        }
      }
      expect(
        xs.every((value) => value <= safe.left) ||
          xs.every((value) => value >= safe.right) ||
          ys.every((value) => value <= safe.top) ||
          ys.every((value) => value >= safe.bottom),
      ).toBe(true);
    }

    for (const value of collectPathNumbers(allPaths)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Object.is(value, -0)).toBe(false);
      expect(Math.round(value * 10_000) / 10_000).toBe(value);
    }
    for (const path of allPaths) {
      for (const command of path) {
        for (const [field, value] of Object.entries(command)) {
          if (typeof value !== "number") continue;
          const maximum = field.startsWith("x")
            ? geometry.dimensions.width - geometry.options.strokeWidth / 2
            : geometry.dimensions.height - geometry.options.strokeWidth / 2;
          expect(value).toBeGreaterThanOrEqual(geometry.options.strokeWidth / 2);
          expect(value).toBeLessThanOrEqual(maximum);
        }
      }
    }
    expectRecursivelyFrozen(geometry);
  });

  test("rejects v2 discriminator mismatches and malformed runtime geometry before serialization", () => {
    const source = generateGate(
      { width: 600, height: 360 },
      { generationVersion: 2, seed: "serializer-validation", family: "arcade" },
    );
    const tampered = [
      (geometry: Record<string, unknown>) => {
        (geometry.options as Record<string, unknown>).generationVersion = 1;
      },
      (geometry: Record<string, unknown>) => {
        (geometry.options as Record<string, unknown>).family = "courtyard";
      },
      (geometry: Record<string, unknown>) => {
        (geometry.bounds as Record<string, unknown>).railY = Number.NaN;
      },
      (geometry: Record<string, unknown>) => {
        (geometry.contentInsets as Record<string, unknown>).left = -1;
      },
    ];

    for (const mutate of tampered) {
      const geometry = structuredClone(source) as unknown as Record<string, unknown>;
      mutate(geometry);
      expect(() => renderGateSVG(geometry as unknown as GateGeometry)).toThrow();
    }
  });

  test("rejects semantically noncanonical v1 and v2 geometry before serialization", () => {
    const sources: GateGeometry[] = [
      generateGate({ width: 300, height: 342 }, { seed: "semantic-v1", family: "courtyard" }),
      generateGate(
        { width: 600, height: 360 },
        { generationVersion: 2, seed: "semantic-v2", family: "arcade" },
      ),
    ];
    const tampered = [
      (geometry: Record<string, unknown>) => {
        const bounds = geometry.bounds as { left: number };
        bounds.left = bounds.left + 1;
      },
      (geometry: Record<string, unknown>) => {
        const contentInsets = geometry.contentInsets as { left: number };
        contentInsets.left = contentInsets.left + 1;
      },
      (geometry: Record<string, unknown>) => {
        geometry.structuralPaths = [[]];
      },
      (geometry: Record<string, unknown>) => {
        const dimensions = geometry.dimensions as { width: number };
        const contentInsets = geometry.contentInsets as { left: number; top: number };
        const safeLeft = contentInsets.left;
        const safeTop = contentInsets.top;
        geometry.decorativePaths = [
          [
            { kind: "M", x: safeLeft + 1, y: safeTop + 1 },
            { kind: "L", x: Math.min(safeLeft + 2, dimensions.width - 1), y: safeTop + 2 },
          ],
        ];
      },
    ];

    for (const source of sources) {
      const canonicalSvg = renderGateSVG(source);
      expect(renderGateSVG(reverseObjectKeyOrder(source) as GateGeometry)).toBe(canonicalSvg);
      for (const mutate of tampered) {
        const geometry = structuredClone(source) as unknown as Record<string, unknown>;
        mutate(geometry);
        expect(() => renderGateSVG(geometry as unknown as GateGeometry)).toThrow();
      }
    }
  });

  test("serializes only validated geometry when a getter mutates the caller object", () => {
    const sources: GateGeometry[] = [
      generateGate({ width: 300, height: 342 }, { seed: "getter-v1", family: "courtyard" }),
      generateGate(
        { width: 600, height: 360 },
        { generationVersion: 2, seed: "getter-v2", family: "arcade" },
      ),
    ];

    for (const source of sources) {
      const geometry = structuredClone(source) as GateGeometry;
      const command = geometry.structuralPaths[0]?.[0] as unknown as
        | Record<string, unknown>
        | undefined;
      if (command === undefined || !("x" in command)) {
        throw new Error("expected a structural path command with an x coordinate");
      }

      const injectedCoordinate = '0" onload="alert(1)';
      const canonicalCoordinate = command.x;
      let swapGeometry = false;
      Object.defineProperty(command, "x", {
        configurable: true,
        enumerable: true,
        get: () => (swapGeometry ? injectedCoordinate : canonicalCoordinate),
      });
      const paint = {
        get stroke(): string {
          swapGeometry = true;
          return "currentColor";
        },
      };

      const svg = renderGateSVG(geometry, paint);
      expect(svg).toBe(renderGateSVG(source));
      expect(svg).not.toContain(injectedCoordinate);
    }
  });

  test("repeats geometry and SVG bytes while preserving typed seeds and label independence", () => {
    const dimensions = { width: 600, height: 360 };
    const options = {
      generationVersion: 2,
      seed: 42,
      family: "arcade",
      crest: "diamond",
    } as const;
    const first = generateGate(dimensions, options);
    const second = generateGate(dimensions, options);
    const stringSeed = generateGate(dimensions, { ...options, seed: "42" });
    const paint = { stroke: "#202427", surface: "#f2eadb" };
    const compositionBeforeUnrelatedSample = sampleUint32(42, "arcade/composition");
    sampleUint32(42, "arcade/independent-label");

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(renderGateSVG(first, paint)).toBe(renderGateSVG(second, paint));
    expect(stringSeed).not.toEqual(first);
    expect(renderGateSVG(stringSeed, paint)).not.toBe(renderGateSVG(first, paint));
    expect(sampleUint32(42, "arcade/composition")).toBe(compositionBeforeUnrelatedSample);
  });
});
