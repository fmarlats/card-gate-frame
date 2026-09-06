import { normalizeDimensions, normalizeFamilyOptions } from "../family-options.js";

export { compatibleCrestsForFamily, isCompatibleCrest, isGateFamily } from "../family-options.js";

import { canonicalizePath, canonicalNumber, deepFreeze, mirrorPath } from "../geometry-utils.js";
import type {
  GateDimensions,
  GateGenerationOptionsV2,
  GateGeometryV2,
  GatePath,
  GateSeed,
  NormalizedGateGenerationOptionsV2,
} from "../types.js";
import { sampleIndex, sampleScalar } from "./sampler.js";

const INSET = 8 as const;
const STROKE_WIDTH = 2 as const;
const COORDINATE_SCALE = 10_000;
const centerPairForWidth = (width: number): Readonly<{ left: number; right: number }> => {
  const widthLatticeUnits = Math.round(width * COORDINATE_SCALE);
  const leftLatticeUnits = Math.floor(widthLatticeUnits / 2);
  return {
    left: leftLatticeUnits / COORDINATE_SCALE,
    right: (widthLatticeUnits - leftLatticeUnits) / COORDINATE_SCALE,
  };
};

const pairedCenteredPaths = (path: GatePath, width: number): GatePath[] => {
  const centerPair = centerPairForWidth(width);
  return centerPair.left === centerPair.right ? [path] : [path, mirrorPath(path, width)];
};

const displaceInteriorY = (path: GatePath, displacement: number): GatePath =>
  canonicalizePath(
    path.map((command, index) => {
      if (command.kind === "C") {
        return {
          ...command,
          y1: command.y1 + displacement,
          y2: command.y2 + displacement,
        };
      }
      if (command.kind === "Q") {
        return { ...command, y1: command.y1 + displacement };
      }
      if (command.kind === "L" && index < path.length - 1) {
        return { ...command, y: command.y + displacement };
      }
      return command;
    }),
  );

const quantizedSymmetryDisplacement = (
  symmetry: number,
  signedSample: number,
  maximumSpan: number,
): number => {
  if (symmetry === 1) return 0;
  const maximumLatticeUnits = Math.max(1, Math.floor((maximumSpan * COORDINATE_SCALE) / 2));
  const sampledLatticeUnits = Math.round(
    (1 - symmetry) * signedSample * maximumSpan * COORDINATE_SCALE,
  );
  const direction = signedSample < 0 ? -1 : 1;
  const magnitude = Math.min(maximumLatticeUnits, Math.max(1, Math.abs(sampledLatticeUnits)));
  return (direction * magnitude) / COORDINATE_SCALE;
};

const createCrestPath = (
  crest: NormalizedGateGenerationOptionsV2["crest"],
  centerX: number,
  edge: number,
  railY: number,
  peakHeight: number,
): GatePath | undefined => {
  if (crest === "none") {
    return undefined;
  }
  const upperHeight = railY - edge;
  const tipY = edge;
  const shoulderY = canonicalNumber(edge + Math.min(18, upperHeight * (0.28 + peakHeight * 0.16)));
  const halfWidth = canonicalNumber(Math.min(8, upperHeight * 0.18));
  if (crest === "spear") {
    return canonicalizePath([
      { kind: "M", x: centerX, y: railY },
      { kind: "L", x: centerX, y: tipY },
      { kind: "M", x: centerX, y: tipY },
      { kind: "L", x: centerX + halfWidth, y: shoulderY },
      { kind: "L", x: centerX, y: shoulderY + halfWidth },
      { kind: "L", x: centerX - halfWidth, y: shoulderY },
      { kind: "Z" },
    ]);
  }
  if (crest === "fleur") {
    const crestHeight = canonicalNumber(upperHeight * (0.44 + peakHeight * 0.04));
    const crestTopY = canonicalNumber(railY - crestHeight);
    const sidePetalHalfWidth = canonicalNumber(crestHeight * 0.39);
    const collarHalfWidth = canonicalNumber(crestHeight * 0.26);
    const centralPetalHalfWidth = canonicalNumber(crestHeight * 0.18);
    const lowerSepalHalfWidth = canonicalNumber(crestHeight * 0.37);
    const sidePetalY = canonicalNumber(crestTopY + crestHeight * 0.38);
    const collarY = canonicalNumber(crestTopY + crestHeight * 0.7);
    const centralPetal = canonicalizePath([
      { kind: "M", x: centerX, y: collarY },
      {
        kind: "C",
        x1: centerX - centralPetalHalfWidth,
        y1: crestTopY + crestHeight * 0.52,
        x2: centerX - centralPetalHalfWidth,
        y2: crestTopY + crestHeight * 0.16,
        x: centerX,
        y: crestTopY,
      },
      {
        kind: "C",
        x1: centerX + centralPetalHalfWidth,
        y1: crestTopY + crestHeight * 0.16,
        x2: centerX + centralPetalHalfWidth,
        y2: crestTopY + crestHeight * 0.52,
        x: centerX,
        y: collarY,
      },
      { kind: "Z" },
    ]);
    const leftSidePetal = canonicalizePath([
      { kind: "M", x: centerX, y: collarY },
      {
        kind: "C",
        x1: centerX - collarHalfWidth * 0.35,
        y1: crestTopY + crestHeight * 0.56,
        x2: centerX - sidePetalHalfWidth * 0.72,
        y2: crestTopY + crestHeight * 0.23,
        x: centerX - sidePetalHalfWidth,
        y: sidePetalY,
      },
      {
        kind: "C",
        x1: centerX - sidePetalHalfWidth * 1.02,
        y1: crestTopY + crestHeight * 0.52,
        x2: centerX - collarHalfWidth * 1.25,
        y2: crestTopY + crestHeight * 0.66,
        x: centerX - collarHalfWidth,
        y: collarY,
      },
    ]);
    const leftSepal = canonicalizePath([
      { kind: "M", x: centerX - collarHalfWidth, y: collarY },
      {
        kind: "C",
        x1: centerX - lowerSepalHalfWidth,
        y1: crestTopY + crestHeight * 0.79,
        x2: centerX - lowerSepalHalfWidth,
        y2: crestTopY + crestHeight * 0.91,
        x: centerX,
        y: railY,
      },
    ]);
    return canonicalizePath([
      { kind: "M", x: centerX, y: railY },
      { kind: "L", x: centerX, y: collarY },
      ...leftSidePetal,
      ...mirrorPath(leftSidePetal, centerX * 2),
      { kind: "M", x: centerX - collarHalfWidth, y: collarY },
      { kind: "L", x: centerX + collarHalfWidth, y: collarY },
      ...leftSepal,
      ...mirrorPath(leftSepal, centerX * 2),
      ...centralPetal,
    ]);
  }
  return canonicalizePath([
    { kind: "M", x: centerX, y: railY },
    { kind: "L", x: centerX, y: tipY },
    { kind: "M", x: centerX, y: tipY },
    { kind: "L", x: centerX + halfWidth, y: shoulderY },
    { kind: "L", x: centerX, y: shoulderY + halfWidth * 2 },
    { kind: "L", x: centerX - halfWidth, y: shoulderY },
    { kind: "Z" },
  ]);
};

type ComposedFamilyPaths = Readonly<{
  structural: GatePath[];
  decorative: GatePath[];
}>;

const composeCourtyard = (
  seed: GateSeed,
  options: NormalizedGateGenerationOptionsV2,
  layout: Readonly<{
    width: number;
    edge: number;
    railY: number;
    bottomY: number;
    frameBand: number;
    safeLeft: number;
  }>,
): ComposedFamilyPaths => {
  const { width, edge, railY, bottomY, frameBand, safeLeft } = layout;
  const composition = sampleIndex(seed, "courtyard/composition", 3);
  const motifLevel = Math.min(
    2,
    Math.floor(3 * options.density + sampleScalar(seed, "courtyard/motif-count")),
  );
  const sideLevel = Math.min(
    2,
    Math.floor(3 * options.sideComplexity + sampleScalar(seed, "courtyard/sides")),
  );
  const scrollPairs = [1, 2, 3][motifLevel] as number;

  const upperHeight = railY - edge;
  const halfSpan = width / 2 - edge;
  const scrollReach = canonicalNumber(
    halfSpan * (0.42 + 0.26 * sampleScalar(seed, "courtyard/anchor/scroll-reach")),
  );
  const lift = canonicalNumber(
    upperHeight * (0.42 + options.curvature * 0.18 + options.peakHeight * 0.12),
  );
  const structural: GatePath[] = [];

  if (composition === 1) {
    const bayWidth = (width - edge * 2) / 3;
    for (let index = 0; index < 3; index += 1) {
      const left = canonicalNumber(edge + bayWidth * index);
      const right = canonicalNumber(edge + bayWidth * (index + 1));
      const bayLift = canonicalNumber(lift * (index === 1 ? 1 : 0.72));
      const bayPath = canonicalizePath([
        { kind: "M", x: left, y: railY },
        { kind: "Q", x1: (left + right) / 2, y1: railY - bayLift, x: right, y: railY },
      ]);
      structural.push(...(index === 1 ? pairedCenteredPaths(bayPath, width) : [bayPath]));
    }
    const centerPair = centerPairForWidth(width);
    if (centerPair.left !== centerPair.right) {
      const leftBay = structural[0] as GatePath;
      structural[structural.length - 1] = mirrorPath(leftBay, width);
    }
  } else if (composition === 2) {
    const shoulder = canonicalNumber(width / 2 - Math.min(scrollReach * 0.38, halfSpan * 0.34));
    const crownY = canonicalNumber(edge + upperHeight * (0.28 - options.peakHeight * 0.08));
    const bridgePath = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      { kind: "L", x: shoulder, y: railY - lift * 0.48 },
      { kind: "Q", x1: width / 2, y1: crownY, x: width - shoulder, y: railY - lift * 0.48 },
      { kind: "L", x: width - edge, y: railY },
    ]);
    structural.push(...pairedCenteredPaths(bridgePath, width));
    const centerStem = canonicalizePath([
      { kind: "M", x: width / 2, y: railY },
      { kind: "L", x: width / 2, y: crownY },
    ]);
    structural.push(...pairedCenteredPaths(centerStem, width));
  }

  for (let index = 0; index < scrollPairs; index += 1) {
    const nesting = 1 - index * 0.17;
    const startX = canonicalNumber(edge + index * Math.min(5, frameBand * 0.22));
    const endX = canonicalNumber(edge + scrollReach * nesting);
    const scrollLift = canonicalNumber(lift * nesting);
    const leftScroll = canonicalizePath([
      { kind: "M", x: startX, y: railY },
      {
        kind: "C",
        x1: startX + (endX - startX) * 0.18,
        y1: railY - scrollLift * 0.52,
        x2: startX + (endX - startX) * 0.54,
        y2: railY - scrollLift,
        x: endX,
        y: railY - scrollLift * 0.58,
      },
      {
        kind: "C",
        x1: endX + (endX - startX) * 0.08,
        y1: railY - scrollLift * 0.26,
        x2: endX - (endX - startX) * 0.12,
        y2: railY - scrollLift * 0.08,
        x: endX - (endX - startX) * 0.28,
        y: railY,
      },
    ]);
    const rightDisplacement = quantizedSymmetryDisplacement(
      options.symmetry,
      sampleScalar(seed, "courtyard/detail", index) - 0.5,
      lift * 0.08,
    );
    structural.push(
      leftScroll,
      displaceInteriorY(mirrorPath(leftScroll, width), rightDisplacement),
    );
  }

  const sideMiddle = canonicalNumber((railY + bottomY) / 2);
  const sideReach = canonicalNumber(safeLeft - edge - 1.0001);
  const leftSide =
    sideLevel === 0
      ? canonicalizePath([
          { kind: "M", x: edge, y: railY },
          { kind: "L", x: edge + sideReach * 0.52, y: sideMiddle },
          { kind: "L", x: edge, y: bottomY },
        ])
      : canonicalizePath([
          { kind: "M", x: edge, y: railY },
          {
            kind: "C",
            x1: edge + sideReach,
            y1: railY + (sideMiddle - railY) * 0.42,
            x2: edge + sideReach,
            y2: sideMiddle - frameBand * 0.35,
            x: edge + sideReach * 0.5,
            y: sideMiddle,
          },
          {
            kind: "C",
            x1: edge,
            y1: sideMiddle + frameBand * 0.35,
            x2: edge,
            y2: bottomY - (bottomY - sideMiddle) * 0.42,
            x: edge,
            y: bottomY,
          },
        ]);
  const decorative = [leftSide, mirrorPath(leftSide, width)];

  return { structural, decorative };
};

const composeFleuron = (
  seed: GateSeed,
  options: NormalizedGateGenerationOptionsV2,
  layout: Readonly<{
    width: number;
    edge: number;
    railY: number;
    bottomY: number;
    frameBand: number;
    safeLeft: number;
  }>,
): ComposedFamilyPaths => {
  const { width, edge, railY, bottomY, frameBand, safeLeft } = layout;
  const composition = sampleIndex(seed, "fleuron/composition", 3);
  const motifLevel = Math.min(
    2,
    Math.floor(3 * options.density + sampleScalar(seed, "fleuron/motif-count")),
  );
  const sideLevel = Math.min(
    2,
    Math.floor(3 * options.sideComplexity + sampleScalar(seed, "fleuron/sides")),
  );
  const clusterCount = [1, 2, 3][motifLevel] as number;

  const upperHeight = railY - edge;
  const upperRight = canonicalNumber(width - edge);
  const upperWidth = canonicalNumber(upperRight - edge);
  const petalSpan = canonicalNumber(
    upperWidth * (0.12 + 0.1 * sampleScalar(seed, "fleuron/proportion/petal-span")),
  );
  const lift = canonicalNumber(
    upperHeight * (0.5 + options.curvature * 0.16 + options.peakHeight * 0.16),
  );
  const centerX = width / 2;
  const structural: GatePath[] = [];
  const clusterTier = (index: number): number => Math.min(index, clusterCount - 1 - index) % 2;

  if (composition === 0) {
    const leftBrace = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      {
        kind: "C",
        x1: edge + petalSpan * 0.3,
        y1: railY - lift * 0.5,
        x2: centerX - petalSpan,
        y2: railY - lift,
        x: centerX,
        y: railY - lift * 0.58,
      },
      {
        kind: "C",
        x1: centerX - petalSpan * 0.3,
        y1: railY - lift * 0.34,
        x2: centerX - petalSpan * 0.18,
        y2: railY - lift * 0.12,
        x: centerX,
        y: railY,
      },
    ]);
    structural.push(leftBrace, mirrorPath(leftBrace, width));
    const centerStem = canonicalizePath([
      { kind: "M", x: centerX, y: railY },
      { kind: "L", x: centerX, y: edge + upperHeight * 0.2 },
    ]);
    structural.push(...pairedCenteredPaths(centerStem, width));
  } else if (composition === 1) {
    const heartPath = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      {
        kind: "C",
        x1: edge + petalSpan * 0.55,
        y1: railY - lift * 0.58,
        x2: centerX - petalSpan * 0.72,
        y2: railY - lift,
        x: centerX,
        y: railY - lift * 0.42,
      },
      {
        kind: "C",
        x1: centerX + petalSpan * 0.72,
        y1: railY - lift,
        x2: width - edge - petalSpan * 0.55,
        y2: railY - lift * 0.58,
        x: width - edge,
        y: railY,
      },
    ]);
    structural.push(...pairedCenteredPaths(heartPath, width));
  }

  const decorative: GatePath[] = [];
  const stemPairSources = new Map<number, GatePath>();
  const petalPairSources = new Map<number, GatePath>();
  for (let index = 0; index < clusterCount; index += 1) {
    const mirrorIndex = clusterCount - 1 - index;
    if (index > mirrorIndex) {
      const stemSource = stemPairSources.get(mirrorIndex) as GatePath;
      const source = petalPairSources.get(mirrorIndex) as GatePath;
      structural.push(mirrorPath(stemSource, width));
      decorative.push(mirrorPath(source, width));
      continue;
    }
    const offset = (index - (clusterCount - 1) / 2) * petalSpan * 0.72;
    const rootX = canonicalNumber(centerX + offset * 1.45);
    const flowerX = canonicalNumber(centerX + offset);
    const flowerY = canonicalNumber(railY - lift * (0.58 + (clusterTier(index) === 0 ? 0.16 : 0)));
    const halfPetal = canonicalNumber(Math.min(petalSpan * 0.22, upperHeight * 0.2));
    const stemPath = canonicalizePath([
      { kind: "M", x: rootX, y: railY },
      {
        kind: "Q",
        x1: rootX + (flowerX - rootX) * 0.35,
        y1: railY - lift * 0.36,
        x: flowerX,
        y: flowerY + halfPetal,
      },
    ]);
    const petalPath = canonicalizePath([
      { kind: "M", x: flowerX, y: flowerY + halfPetal },
      {
        kind: "Q",
        x1: flowerX - halfPetal,
        y1: flowerY,
        x: flowerX,
        y: flowerY - halfPetal,
      },
      {
        kind: "Q",
        x1: flowerX + halfPetal,
        y1: flowerY,
        x: flowerX,
        y: flowerY + halfPetal,
      },
      { kind: "Z" },
    ]);
    if (index === mirrorIndex) {
      structural.push(...pairedCenteredPaths(stemPath, width));
      decorative.push(...pairedCenteredPaths(petalPath, width));
    } else {
      stemPairSources.set(index, stemPath);
      petalPairSources.set(index, petalPath);
      structural.push(stemPath);
      decorative.push(petalPath);
    }
  }

  const sideMiddle = canonicalNumber((railY + bottomY) / 2);
  const sideReach = canonicalNumber(safeLeft - edge - 1.0001);
  const leftSide =
    sideLevel === 0
      ? canonicalizePath([
          { kind: "M", x: edge, y: bottomY },
          { kind: "L", x: edge + sideReach * 0.72, y: sideMiddle },
          { kind: "L", x: edge, y: railY },
        ])
      : sideLevel === 1
        ? canonicalizePath([
            { kind: "M", x: edge, y: sideMiddle + frameBand * 0.42 },
            {
              kind: "Q",
              x1: edge + sideReach,
              y1: sideMiddle,
              x: edge,
              y: sideMiddle - frameBand * 0.42,
            },
            {
              kind: "Q",
              x1: edge + sideReach * 0.45,
              y1: sideMiddle,
              x: edge,
              y: sideMiddle + frameBand * 0.42,
            },
            { kind: "Z" },
          ])
        : canonicalizePath([
            { kind: "M", x: edge, y: railY },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: railY + (sideMiddle - railY) * 0.34,
              x2: edge + sideReach,
              y2: sideMiddle - frameBand * 0.28,
              x: edge + sideReach * 0.35,
              y: sideMiddle,
            },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: sideMiddle + frameBand * 0.28,
              x2: edge + sideReach,
              y2: bottomY - (bottomY - sideMiddle) * 0.34,
              x: edge,
              y: bottomY,
            },
          ]);
  const rightSideDisplacement = quantizedSymmetryDisplacement(
    options.symmetry,
    sampleScalar(seed, "fleuron/detail", clusterCount) - 0.5,
    frameBand * 0.12,
  );
  decorative.push(leftSide, displaceInteriorY(mirrorPath(leftSide, width), rightSideDisplacement));

  return { structural, decorative };
};

const composeVine = (
  seed: GateSeed,
  options: NormalizedGateGenerationOptionsV2,
  layout: Readonly<{
    width: number;
    edge: number;
    railY: number;
    bottomY: number;
    frameBand: number;
    safeLeft: number;
  }>,
): ComposedFamilyPaths => {
  const { width, edge, railY, bottomY, frameBand, safeLeft } = layout;
  const composition = sampleIndex(seed, "vine/composition", 3);
  const motifLevel = Math.min(
    2,
    Math.floor(3 * options.density + sampleScalar(seed, "vine/motif-count")),
  );
  const sideLevel = Math.min(
    2,
    Math.floor(3 * options.sideComplexity + sampleScalar(seed, "vine/sides")),
  );
  const leafPairs = [2, 4, 6][motifLevel] as number;
  const curlPairCount = [1, 1, 2][motifLevel] as number;

  const upperHeight = railY - edge;
  const halfSpan = width / 2 - edge;
  const leafNode = 0.22 + 0.56 * sampleScalar(seed, "vine/anchor/leaf-node");
  const lift = canonicalNumber(
    upperHeight * (0.52 + options.curvature * 0.16 + options.peakHeight * 0.14),
  );
  const structural: GatePath[] = [];

  if (composition === 0) {
    const leftStem = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      {
        kind: "C",
        x1: edge + halfSpan * 0.12,
        y1: railY - lift * 0.28,
        x2: edge + halfSpan * 0.28,
        y2: railY - lift * 0.78,
        x: edge + halfSpan * 0.62,
        y: railY - lift,
      },
      {
        kind: "C",
        x1: edge + halfSpan * 0.78,
        y1: railY - lift * 0.96,
        x2: width / 2 - halfSpan * 0.08,
        y2: railY - lift * 0.5,
        x: width / 2,
        y: railY,
      },
    ]);
    structural.push(leftStem, mirrorPath(leftStem, width));
  } else if (composition === 1) {
    const leftCanopy = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      {
        kind: "C",
        x1: edge + halfSpan * 0.18,
        y1: railY - lift * 0.72,
        x2: edge + halfSpan * 0.52,
        y2: railY - lift,
        x: width / 2,
        y: railY - lift * 0.62,
      },
      {
        kind: "C",
        x1: width / 2 + halfSpan * 0.18,
        y1: railY - lift * 0.38,
        x2: width / 2 + halfSpan * 0.3,
        y2: railY - lift * 0.82,
        x: width / 2 + halfSpan * 0.48,
        y: railY - lift * 0.54,
      },
      {
        kind: "C",
        x1: width / 2 + halfSpan * 0.62,
        y1: railY - lift * 0.3,
        x2: width - edge - halfSpan * 0.08,
        y2: railY - lift * 0.16,
        x: width - edge,
        y: railY,
      },
    ]);
    structural.push(leftCanopy, mirrorPath(leftCanopy, width));
  } else {
    const leftBranch = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      {
        kind: "C",
        x1: edge + halfSpan * 0.08,
        y1: railY - lift * 0.22,
        x2: edge + halfSpan * 0.2,
        y2: railY - lift * 0.86,
        x: edge + halfSpan * 0.48,
        y: railY - lift * 0.82,
      },
      {
        kind: "C",
        x1: edge + halfSpan * 0.7,
        y1: railY - lift * 0.78,
        x2: width / 2 - halfSpan * 0.12,
        y2: railY - lift * 0.34,
        x: width / 2,
        y: railY - lift * 0.56,
      },
      {
        kind: "C",
        x1: width / 2 - halfSpan * 0.04,
        y1: railY - lift * 0.28,
        x2: width / 2 - halfSpan * 0.02,
        y2: railY - lift * 0.12,
        x: width / 2,
        y: railY,
      },
    ]);
    structural.push(leftBranch, mirrorPath(leftBranch, width));
    const centerStem = canonicalizePath([
      { kind: "M", x: width / 2, y: railY },
      { kind: "L", x: width / 2, y: railY - lift * 0.56 },
    ]);
    structural.push(...pairedCenteredPaths(centerStem, width));
  }

  for (let index = 0; index < curlPairCount; index += 1) {
    const rootX = canonicalNumber(edge + halfSpan * (0.16 + index * 0.11));
    const reach = canonicalNumber(halfSpan * (0.28 - index * 0.06));
    const curlLift = canonicalNumber(lift * (0.68 - index * 0.12));
    const leftCurl = canonicalizePath([
      { kind: "M", x: rootX, y: railY },
      {
        kind: "C",
        x1: rootX + reach * 0.12,
        y1: railY - curlLift * 0.48,
        x2: rootX + reach * 0.54,
        y2: railY - curlLift,
        x: rootX + reach * 0.82,
        y: railY - curlLift * 0.72,
      },
      {
        kind: "C",
        x1: rootX + reach * 1.08,
        y1: railY - curlLift * 0.52,
        x2: rootX + reach,
        y2: railY - curlLift * 0.18,
        x: rootX + reach * 0.76,
        y: railY - curlLift * 0.28,
      },
      {
        kind: "C",
        x1: rootX + reach * 0.56,
        y1: railY - curlLift * 0.38,
        x2: rootX + reach * 0.6,
        y2: railY - curlLift * 0.58,
        x: rootX + reach * 0.73,
        y: railY - curlLift * 0.5,
      },
    ]);
    const rightDisplacement = quantizedSymmetryDisplacement(
      options.symmetry,
      sampleScalar(seed, "vine/detail", leafPairs * 2 + index) - 0.5,
      curlLift * 0.06,
    );
    structural.push(leftCurl, displaceInteriorY(mirrorPath(leftCurl, width), rightDisplacement));
  }

  const decorative: GatePath[] = [];
  const leafHalfWidth = canonicalNumber(Math.min(halfSpan * 0.035, upperHeight * 0.12));
  const leafHalfHeight = canonicalNumber(Math.min(upperHeight * 0.075, 7));
  for (let index = 0; index < leafPairs; index += 1) {
    const detail = sampleScalar(seed, "vine/detail", index);
    const along = 0.18 + (0.64 * (index + leafNode)) / (leafPairs + 1);
    const leafX = canonicalNumber(edge + halfSpan * along);
    const leftLeafDisplacement = quantizedSymmetryDisplacement(
      options.symmetry,
      0.5 - detail,
      lift * 0.08,
    );
    const leafY = canonicalNumber(railY - lift * (0.28 + along * 0.56) + leftLeafDisplacement);
    const leftLeaf = canonicalizePath([
      { kind: "M", x: leafX, y: leafY + leafHalfHeight },
      {
        kind: "Q",
        x1: leafX - leafHalfWidth,
        y1: leafY,
        x: leafX,
        y: leafY - leafHalfHeight,
      },
      {
        kind: "Q",
        x1: leafX + leafHalfWidth,
        y1: leafY,
        x: leafX,
        y: leafY + leafHalfHeight,
      },
      { kind: "Z" },
    ]);
    const leftTwig = canonicalizePath([
      { kind: "M", x: leafX, y: railY },
      {
        kind: "Q",
        x1: leafX + (index % 2 === 0 ? -leafHalfWidth : leafHalfWidth),
        y1: (railY + leafY) / 2,
        x: leafX,
        y: leafY + leafHalfHeight,
      },
    ]);
    const rightLeafDisplacement = quantizedSymmetryDisplacement(
      options.symmetry,
      sampleScalar(seed, "vine/detail", index + leafPairs) - 0.5,
      leafHalfHeight * 0.24,
    );
    structural.push(leftTwig, mirrorPath(leftTwig, width));
    decorative.push(
      leftLeaf,
      displaceInteriorY(mirrorPath(leftLeaf, width), rightLeafDisplacement),
    );
  }

  const sideMiddle = canonicalNumber((railY + bottomY) / 2);
  const sideReach = canonicalNumber(safeLeft - edge - 1.0001);
  const leftSide =
    sideLevel === 0
      ? canonicalizePath([
          { kind: "M", x: edge, y: bottomY },
          { kind: "L", x: edge + sideReach * 0.62, y: railY },
        ])
      : sideLevel === 1
        ? canonicalizePath([
            { kind: "M", x: edge, y: bottomY },
            {
              kind: "Q",
              x1: edge + sideReach,
              y1: sideMiddle,
              x: edge,
              y: railY,
            },
            { kind: "L", x: edge + sideReach * 0.72, y: sideMiddle },
          ])
        : canonicalizePath([
            { kind: "M", x: edge, y: bottomY },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: bottomY - (bottomY - sideMiddle) * 0.46,
              x2: edge,
              y2: sideMiddle + frameBand * 0.3,
              x: edge + sideReach * 0.58,
              y: sideMiddle,
            },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: sideMiddle - frameBand * 0.3,
              x2: edge,
              y2: railY + (sideMiddle - railY) * 0.46,
              x: edge,
              y: railY,
            },
          ]);
  decorative.push(leftSide, mirrorPath(leftSide, width));

  return { structural, decorative };
};

const composeFan = (
  seed: GateSeed,
  options: NormalizedGateGenerationOptionsV2,
  layout: Readonly<{
    width: number;
    edge: number;
    railY: number;
    bottomY: number;
    frameBand: number;
    safeLeft: number;
  }>,
): ComposedFamilyPaths => {
  const { width, edge, railY, bottomY, frameBand, safeLeft } = layout;
  const composition = sampleIndex(seed, "fan/composition", 3);
  const motifLevel = Math.min(
    2,
    Math.floor(3 * options.density + sampleScalar(seed, "fan/motif-count")),
  );
  const sideLevel = Math.min(
    2,
    Math.floor(3 * options.sideComplexity + sampleScalar(seed, "fan/sides")),
  );
  const raysPerHalf = [3, 5, 7][motifLevel] as number;

  const upperHeight = railY - edge;
  const halfSpan = width / 2 - edge;
  const originRatio = 0.58 + 0.24 * sampleScalar(seed, "fan/anchor/origin-height");
  const originY = canonicalNumber(railY + (bottomY - railY) * originRatio);
  const lift = canonicalNumber(
    upperHeight * (0.48 + options.peakHeight * 0.22 + options.curvature * 0.1),
  );
  const structural: GatePath[] = [];

  for (let index = 0; index < raysPerHalf; index += 1) {
    const fraction = (index + 1) / (raysPerHalf + 1);
    const detail = sampleScalar(seed, "fan/detail", index);
    const targetX = canonicalNumber(edge + halfSpan * fraction);
    const leftTargetDisplacement = quantizedSymmetryDisplacement(
      options.symmetry,
      0.5 - detail,
      lift * 0.06,
    );
    const targetY = canonicalNumber(
      railY - lift * (0.34 + fraction * 0.62) + leftTargetDisplacement,
    );
    const leftRay =
      composition === 0
        ? canonicalizePath([
            { kind: "M", x: edge, y: originY },
            { kind: "L", x: edge, y: railY },
            { kind: "L", x: targetX, y: targetY },
          ])
        : composition === 1
          ? canonicalizePath([
              { kind: "M", x: edge, y: originY },
              { kind: "L", x: edge, y: railY },
              {
                kind: "L",
                x: edge + halfSpan * fraction * 0.24,
                y: railY + frameBand * (0.72 - fraction * 0.24),
              },
              {
                kind: "L",
                x: edge + halfSpan * fraction * 0.58,
                y: railY - lift * fraction * 0.34,
              },
              { kind: "L", x: targetX, y: targetY },
            ])
          : canonicalizePath([
              { kind: "M", x: edge, y: originY },
              { kind: "L", x: edge, y: railY },
              {
                kind: "Q",
                x1: edge + halfSpan * fraction * 0.38,
                y1: railY - lift * fraction * 0.18,
                x: targetX,
                y: targetY,
              },
              { kind: "L", x: width / 2, y: railY },
            ]);
    const mirroredRightRay = mirrorPath(leftRay, width);
    const rightTargetIndex =
      composition === 2 ? mirroredRightRay.length - 2 : mirroredRightRay.length - 1;
    const rightTargetDisplacement = quantizedSymmetryDisplacement(
      options.symmetry,
      sampleScalar(seed, "fan/detail", index + raysPerHalf) - 0.5,
      lift * 0.05,
    );
    const rightRay = canonicalizePath(
      mirroredRightRay.map((command, commandIndex) =>
        commandIndex === rightTargetIndex && (command.kind === "L" || command.kind === "Q")
          ? { ...command, y: command.y + rightTargetDisplacement }
          : command,
      ),
    );
    structural.push(leftRay, rightRay);
  }

  const decorative: GatePath[] = [];
  const sideMiddle = canonicalNumber((railY + bottomY) / 2);
  const sideReach = canonicalNumber(safeLeft - edge - 1.0001);
  const leftSide =
    sideLevel === 0
      ? canonicalizePath([
          { kind: "M", x: edge + sideReach * 0.32, y: railY },
          { kind: "L", x: edge + sideReach * 0.32, y: bottomY },
        ])
      : sideLevel === 1
        ? canonicalizePath([
            { kind: "M", x: edge, y: railY },
            { kind: "L", x: edge + sideReach * 0.42, y: sideMiddle - frameBand * 0.48 },
            { kind: "L", x: edge + sideReach, y: sideMiddle },
            { kind: "L", x: edge, y: bottomY },
          ])
        : canonicalizePath([
            { kind: "M", x: edge, y: railY },
            { kind: "L", x: edge + sideReach * 0.72, y: sideMiddle },
            { kind: "L", x: edge, y: bottomY },
          ]);
  decorative.push(leftSide, mirrorPath(leftSide, width));

  return { structural, decorative };
};

const composeVolute = (
  seed: GateSeed,
  options: NormalizedGateGenerationOptionsV2,
  layout: Readonly<{
    width: number;
    edge: number;
    railY: number;
    bottomY: number;
    frameBand: number;
    safeLeft: number;
  }>,
): ComposedFamilyPaths => {
  const { width, edge, railY, bottomY, frameBand, safeLeft } = layout;
  const composition = sampleIndex(seed, "volute/composition", 3);
  const motifLevel = Math.min(
    2,
    Math.floor(3 * options.density + sampleScalar(seed, "volute/motif-count")),
  );
  const sideLevel = Math.min(
    2,
    Math.floor(3 * options.sideComplexity + sampleScalar(seed, "volute/sides")),
  );
  const pairCount = [1, 2, 3][motifLevel] as number;

  const upperHeight = railY - edge;
  const halfSpan = width / 2 - edge;
  const upperRight = canonicalNumber(width - edge);
  const upperWidth = canonicalNumber(upperRight - edge);
  const coilRadius = canonicalNumber(
    upperWidth * (0.1 + 0.08 * sampleScalar(seed, "volute/proportion/coil-radius")),
  );
  const lift = canonicalNumber(
    upperHeight * (0.5 + options.curvature * 0.2 + options.peakHeight * 0.14),
  );
  const structural: GatePath[] = [];

  if (composition === 0) {
    for (let index = 0; index < pairCount; index += 1) {
      const nesting = 1 - index * 0.18;
      const startX = canonicalNumber(edge + index * Math.min(5, frameBand * 0.2));
      const centerX = canonicalNumber(
        edge + Math.min(halfSpan * 0.78, coilRadius * (1.3 + index * 0.2)),
      );
      const coilLift = canonicalNumber(lift * nesting);
      const leftVolute = canonicalizePath([
        { kind: "M", x: startX, y: railY },
        {
          kind: "C",
          x1: startX + coilRadius * 0.18,
          y1: railY - coilLift * 0.54,
          x2: centerX - coilRadius * 0.5,
          y2: railY - coilLift,
          x: centerX,
          y: railY - coilLift * 0.66,
        },
        {
          kind: "C",
          x1: centerX + coilRadius * 0.32,
          y1: railY - coilLift * 0.4,
          x2: centerX + coilRadius * 0.16,
          y2: railY - coilLift * 0.18,
          x: centerX - coilRadius * 0.08,
          y: railY - coilLift * 0.28,
        },
        {
          kind: "C",
          x1: centerX - coilRadius * 0.2,
          y1: railY - coilLift * 0.36,
          x2: centerX - coilRadius * 0.24,
          y2: railY - coilLift * 0.1,
          x: centerX - coilRadius * 0.42,
          y: railY,
        },
      ]);
      structural.push(leftVolute, mirrorPath(leftVolute, width));
    }
  } else if (composition === 1) {
    const crownPath = canonicalizePath([
      { kind: "M", x: edge, y: railY },
      {
        kind: "C",
        x1: edge + coilRadius * 0.4,
        y1: railY - lift * 0.66,
        x2: width / 2 - coilRadius * 1.15,
        y2: railY - lift,
        x: width / 2 - coilRadius * 0.42,
        y: railY - lift * 0.6,
      },
      {
        kind: "C",
        x1: width / 2 - coilRadius * 0.08,
        y1: railY - lift * 0.36,
        x2: width / 2 - coilRadius * 0.28,
        y2: railY - lift * 0.14,
        x: width / 2,
        y: railY - lift * 0.72,
      },
      {
        kind: "C",
        x1: width / 2 + coilRadius * 0.28,
        y1: railY - lift * 0.14,
        x2: width / 2 + coilRadius * 0.08,
        y2: railY - lift * 0.36,
        x: width / 2 + coilRadius * 0.42,
        y: railY - lift * 0.6,
      },
      {
        kind: "C",
        x1: width / 2 + coilRadius * 1.15,
        y1: railY - lift,
        x2: width - edge - coilRadius * 0.4,
        y2: railY - lift * 0.66,
        x: width - edge,
        y: railY,
      },
    ]);
    structural.push(...pairedCenteredPaths(crownPath, width));
    for (let index = 0; index < pairCount; index += 1) {
      const spread = canonicalNumber(coilRadius * (0.45 + index * 0.32));
      const bracePath = canonicalizePath([
        { kind: "M", x: width / 2 - spread, y: railY },
        {
          kind: "Q",
          x1: width / 2,
          y1: railY - lift * (0.28 + index * 0.08),
          x: width / 2 + spread,
          y: railY,
        },
      ]);
      structural.push(...pairedCenteredPaths(bracePath, width));
    }
  } else {
    for (let index = 0; index < pairCount; index += 1) {
      const nesting = 1 - index * 0.16;
      const startX = canonicalNumber(edge + index * Math.min(6, frameBand * 0.22));
      const reach = canonicalNumber(Math.min(halfSpan * 0.86, coilRadius * (1.25 + index * 0.28)));
      const cascadeLift = canonicalNumber(lift * nesting);
      const leftCascade = canonicalizePath([
        { kind: "M", x: startX, y: railY },
        {
          kind: "C",
          x1: startX + reach * 0.22,
          y1: railY - cascadeLift * 0.84,
          x2: startX + reach * 0.68,
          y2: railY - cascadeLift,
          x: startX + reach,
          y: railY - cascadeLift * 0.54,
        },
        {
          kind: "C",
          x1: startX + reach * 0.88,
          y1: railY - cascadeLift * 0.22,
          x2: startX + reach * 0.58,
          y2: railY - cascadeLift * 0.14,
          x: startX + reach * 0.42,
          y: railY,
        },
      ]);
      structural.push(leftCascade, mirrorPath(leftCascade, width));
    }
    const centerStem = canonicalizePath([
      { kind: "M", x: width / 2, y: railY },
      { kind: "L", x: width / 2, y: railY - lift * 0.64 },
    ]);
    structural.push(...pairedCenteredPaths(centerStem, width));
  }

  const decorative: GatePath[] = [];
  const sideMiddle = canonicalNumber((railY + bottomY) / 2);
  const sideReach = canonicalNumber(safeLeft - edge - 1.0001);
  const leftSide =
    sideLevel === 0
      ? canonicalizePath([
          { kind: "M", x: edge, y: railY },
          {
            kind: "C",
            x1: edge + sideReach,
            y1: railY + (sideMiddle - railY) * 0.42,
            x2: edge + sideReach,
            y2: sideMiddle - frameBand * 0.24,
            x: edge,
            y: sideMiddle,
          },
        ])
      : sideLevel === 1
        ? canonicalizePath([
            { kind: "M", x: edge, y: railY },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: railY + (sideMiddle - railY) * 0.38,
              x2: edge,
              y2: sideMiddle - frameBand * 0.28,
              x: edge + sideReach * 0.62,
              y: sideMiddle,
            },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: sideMiddle + frameBand * 0.28,
              x2: edge,
              y2: bottomY - (bottomY - sideMiddle) * 0.38,
              x: edge,
              y: bottomY,
            },
          ])
        : canonicalizePath([
            { kind: "M", x: edge, y: railY },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: railY + (sideMiddle - railY) * 0.28,
              x2: edge + sideReach,
              y2: sideMiddle - frameBand * 0.4,
              x: edge + sideReach * 0.46,
              y: sideMiddle - frameBand * 0.18,
            },
            {
              kind: "C",
              x1: edge,
              y1: sideMiddle,
              x2: edge + sideReach,
              y2: sideMiddle + frameBand * 0.12,
              x: edge + sideReach * 0.68,
              y: sideMiddle + frameBand * 0.3,
            },
            {
              kind: "C",
              x1: edge + sideReach,
              y1: sideMiddle + frameBand * 0.5,
              x2: edge,
              y2: bottomY - (bottomY - sideMiddle) * 0.28,
              x: edge,
              y: bottomY,
            },
          ]);
  const rightSideDisplacement = quantizedSymmetryDisplacement(
    options.symmetry,
    sampleScalar(seed, "volute/detail", pairCount) - 0.5,
    frameBand * 0.12,
  );
  decorative.push(leftSide, displaceInteriorY(mirrorPath(leftSide, width), rightSideDisplacement));

  return { structural, decorative };
};

export function generateGateV2(
  dimensionsInput: GateDimensions,
  optionsInput: GateGenerationOptionsV2,
): Readonly<GateGeometryV2> {
  const dimensions = normalizeDimensions(dimensionsInput);
  const { seed, options } = normalizeFamilyOptions(optionsInput, 2);
  const { width, height } = dimensions;
  const edge = canonicalNumber(INSET + STROKE_WIDTH / 2);
  const railY = canonicalNumber(Math.max(edge + 32, height * 0.3));
  const bottomY = canonicalNumber(height - edge);
  const frameBand = canonicalNumber(Math.max(12, Math.min(24, Math.min(width, height) * 0.06)));
  const safeLeft = canonicalNumber(edge + frameBand);
  const safeRight = canonicalNumber(width - safeLeft);
  const safeTop = canonicalNumber(railY + frameBand);
  const safeBottom = canonicalNumber(bottomY - frameBand);
  const centerX = canonicalNumber(width / 2);

  const surfacePath = canonicalizePath([
    { kind: "M", x: edge, y: railY },
    { kind: "L", x: width - edge, y: railY },
    { kind: "L", x: width - edge, y: bottomY },
    { kind: "L", x: edge, y: bottomY },
    { kind: "Z" },
    { kind: "M", x: safeLeft, y: safeTop },
    { kind: "L", x: safeLeft, y: safeBottom },
    { kind: "L", x: safeRight, y: safeBottom },
    { kind: "L", x: safeRight, y: safeTop },
    { kind: "Z" },
  ]);
  const framePath = canonicalizePath([
    { kind: "M", x: edge, y: bottomY },
    { kind: "L", x: edge, y: railY },
    { kind: "L", x: width - edge, y: railY },
    { kind: "L", x: width - edge, y: bottomY },
    { kind: "Z" },
  ]);

  if (
    options.family === "courtyard" ||
    options.family === "fleuron" ||
    options.family === "vine" ||
    options.family === "fan" ||
    options.family === "volute"
  ) {
    const familyLayout = {
      width,
      edge,
      railY,
      bottomY,
      frameBand,
      safeLeft,
    };
    const composed =
      options.family === "courtyard"
        ? composeCourtyard(seed, options, familyLayout)
        : options.family === "fleuron"
          ? composeFleuron(seed, options, familyLayout)
          : options.family === "vine"
            ? composeVine(seed, options, familyLayout)
            : options.family === "fan"
              ? composeFan(seed, options, familyLayout)
              : composeVolute(seed, options, familyLayout);
    const decorativePaths = [...composed.decorative];
    const crestPath = createCrestPath(options.crest, centerX, edge, railY, options.peakHeight);
    if (crestPath !== undefined) {
      decorativePaths.push(...pairedCenteredPaths(crestPath, width));
    }

    return deepFreeze({
      schemaVersion: 1,
      generationVersion: 2,
      seed,
      dimensions,
      viewBox: { minX: 0, minY: 0, width, height },
      options,
      bounds: {
        left: edge,
        right: canonicalNumber(width - edge),
        railY,
        bottomY,
      },
      contentInsets: {
        top: safeTop,
        right: canonicalNumber(width - safeRight),
        bottom: canonicalNumber(height - safeBottom),
        left: safeLeft,
      },
      surfacePath,
      structuralPaths: [framePath, ...composed.structural],
      decorativePaths,
    });
  }

  const composition = sampleIndex(seed, "arcade/composition", 3);
  const motifLevel = Math.min(
    2,
    Math.floor(3 * options.density + sampleScalar(seed, "arcade/motif-count")),
  );
  const sideLevel = Math.min(
    2,
    Math.floor(3 * options.sideComplexity + sampleScalar(seed, "arcade/sides")),
  );
  const bayCount = [2, 3, 5][motifLevel] as number;
  const span = width - edge * 2;
  const upperHeight = railY - edge;
  const springRatio = 0.32 + 0.26 * sampleScalar(seed, "arcade/anchor/spring-height");
  const archLift = canonicalNumber(
    upperHeight *
      springRatio *
      (0.72 + options.curvature * 0.28) *
      (0.78 + options.peakHeight * 0.22),
  );
  const boundaries = Array.from({ length: bayCount + 1 }, (_, index) =>
    canonicalNumber(edge + (span * index) / bayCount),
  );
  const arches: GatePath[] = [];
  for (let index = 0; index < bayCount; index += 1) {
    const left = boundaries[index] as number;
    const right = boundaries[index + 1] as number;
    const detail = sampleScalar(seed, "arcade/detail", index);
    const displacement = quantizedSymmetryDisplacement(
      options.symmetry,
      detail - 0.5,
      (right - left) * 0.16,
    );
    const roundBay = canonicalizePath([
      { kind: "M", x: left, y: railY },
      {
        kind: "Q",
        x1: (left + right) / 2 + displacement,
        y1: railY - archLift,
        x: right,
        y: railY,
      },
    ]);
    const center = (left + right) / 2;
    const pointedBay = canonicalizePath([
      { kind: "M", x: left, y: railY },
      {
        kind: "C",
        x1: left + (right - left) * 0.2 + displacement,
        y1: railY - archLift * 0.42,
        x2: center - (right - left) * 0.12 + displacement,
        y2: railY - archLift,
        x: center + displacement,
        y: railY - archLift,
      },
      {
        kind: "C",
        x1: center + (right - left) * 0.12 + displacement,
        y1: railY - archLift,
        x2: right - (right - left) * 0.2 + displacement,
        y2: railY - archLift * 0.42,
        x: right,
        y: railY,
      },
    ]);
    const mirroredPairIndex = Math.min(index, bayCount - 1 - index);
    arches.push(
      composition === 0 || (composition === 2 && mirroredPairIndex % 2 === 0)
        ? roundBay
        : pointedBay,
    );
  }

  const centerPair = centerPairForWidth(width);
  if (centerPair.left !== centerPair.right) {
    if (options.symmetry === 1) {
      for (let index = 0; index < Math.floor(bayCount / 2); index += 1) {
        const leftBay = arches[index] as GatePath;
        arches[bayCount - 1 - index] = mirrorPath(leftBay, width);
      }
    }
    if (bayCount % 2 === 1) {
      const middleIndex = Math.floor(bayCount / 2);
      const middleBay = arches[middleIndex] as GatePath;
      arches.splice(middleIndex + 1, 0, mirrorPath(middleBay, width));
    }
  }

  const decorativePaths: GatePath[] = [];
  const crestPath = createCrestPath(options.crest, centerX, edge, railY, options.peakHeight);
  if (crestPath !== undefined) {
    decorativePaths.push(...pairedCenteredPaths(crestPath, width));
  }

  const sideCenterY = canonicalNumber((railY + bottomY) / 2);
  const sideReach = canonicalNumber(safeLeft - edge - 2);
  const leftSide: GatePath =
    sideLevel === 0
      ? canonicalizePath([
          { kind: "M", x: edge + sideReach * 0.34, y: railY },
          { kind: "L", x: edge + sideReach * 0.34, y: bottomY },
        ])
      : sideLevel === 1
        ? canonicalizePath([
            { kind: "M", x: edge, y: railY },
            {
              kind: "Q",
              x1: edge + sideReach * (0.65 + options.curvature * 0.25),
              y1: sideCenterY,
              x: edge,
              y: bottomY,
            },
          ])
        : canonicalizePath([
            { kind: "M", x: edge, y: railY },
            { kind: "L", x: edge + sideReach * 0.55, y: sideCenterY - frameBand * 0.5 },
            { kind: "L", x: edge + sideReach, y: sideCenterY },
            { kind: "L", x: edge + sideReach * 0.55, y: sideCenterY + frameBand * 0.5 },
            { kind: "L", x: edge, y: bottomY },
          ]);
  decorativePaths.push(leftSide, mirrorPath(leftSide, width));

  return deepFreeze({
    schemaVersion: 1,
    generationVersion: 2,
    seed,
    dimensions,
    viewBox: { minX: 0, minY: 0, width, height },
    options,
    bounds: {
      left: edge,
      right: canonicalNumber(width - edge),
      railY,
      bottomY,
    },
    contentInsets: {
      top: safeTop,
      right: canonicalNumber(width - safeRight),
      bottom: canonicalNumber(height - safeBottom),
      left: safeLeft,
    },
    surfacePath,
    structuralPaths: [framePath, ...arches],
    decorativePaths,
  });
}
