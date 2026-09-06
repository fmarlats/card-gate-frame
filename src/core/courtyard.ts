import { canonicalizePath, canonicalNumber, deepFreeze, mirrorPath } from "./geometry-utils.js";
import type {
  GateDimensions,
  GateGenerationOptions,
  GateGeometry,
  GatePath,
  GateSeed,
} from "./types.js";
import { encodeUtf8 } from "./utf8.js";

const DEFAULT_INSET = 8;
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_DENSITY = 0.55;
const DEFAULT_CURVATURE = 0.65;

const normalizeDimensions = (dimensions: GateDimensions): GateDimensions => {
  const { width, height } = dimensions;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError("Gate dimensions must be finite numbers");
  }

  if (width < 160 || width > 1_600 || height < 96 || height > 1_200) {
    throw new RangeError("Gate dimensions are outside the supported range");
  }

  const aspectRatio = width / height;
  if (aspectRatio < 0.5 || aspectRatio > 6) {
    throw new RangeError("Gate dimensions have an unsupported aspect ratio");
  }

  return {
    width: canonicalNumber(width),
    height: canonicalNumber(height),
  };
};

const normalizeSeed = (seed: GateSeed): GateSeed => {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new TypeError("Gate seed numbers must be finite");
    }
    return Object.is(seed, -0) ? 0 : seed;
  }

  if (typeof seed !== "string") {
    throw new TypeError("Gate seeds must be strings or finite numbers");
  }

  if (seed.length === 0) {
    throw new TypeError("Gate seed strings must not be empty");
  }

  return seed;
};

const validateGenerationOptions = (options: GateGenerationOptions): void => {
  if (options.family !== "courtyard") {
    throw new TypeError('GF-01 requires family: "courtyard"');
  }

  if (options.generationVersion !== undefined && options.generationVersion !== 1) {
    throw new TypeError("GF-01 supports only generationVersion 1");
  }
};

const normalizeShapeControl = (
  value: number | undefined,
  fallback: number,
  name: "density" | "curvature",
): number => {
  const normalized = value === undefined ? fallback : value;

  if (!Number.isFinite(normalized)) {
    throw new TypeError(`${name} must be a finite number`);
  }

  if (normalized < 0 || normalized > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive`);
  }

  return canonicalNumber(normalized);
};

const hashByte = (hash: number, byte: number): number => Math.imul(hash ^ byte, 0x01000193) >>> 0;

const hashUtf8 = (value: string): number => {
  let hash = 0x811c9dc5;
  for (const byte of encodeUtf8(value)) hash = hashByte(hash, byte);
  return hash;
};

const seedState = (seed: GateSeed): number =>
  hashUtf8(`${typeof seed === "number" ? "number" : "string"}:${String(seed)}`);

const nextUint32 = (state: number): number => {
  let next = state || 0x6d2b79f5;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
};

export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptions,
): Readonly<GateGeometry> {
  validateGenerationOptions(options);
  const { width, height } = normalizeDimensions(dimensions);
  const seed = normalizeSeed(options.seed);
  const density = normalizeShapeControl(options.density, DEFAULT_DENSITY, "density");
  const curvature = normalizeShapeControl(options.curvature, DEFAULT_CURVATURE, "curvature");
  const halfStroke = DEFAULT_STROKE_WIDTH / 2;
  const edge = canonicalNumber(DEFAULT_INSET + halfStroke);
  const railY = canonicalNumber(Math.max(edge + 24, height * 0.275));
  const bottomY = canonicalNumber(height - edge);
  const frameBand = canonicalNumber(Math.max(12, Math.min(24, Math.min(width, height) * 0.06)));
  const safeLeft = canonicalNumber(edge + frameBand);
  const safeRight = canonicalNumber(width - safeLeft);
  const safeTop = canonicalNumber(railY + frameBand);
  const safeBottom = canonicalNumber(bottomY - frameBand);
  const centerX = canonicalNumber(width / 2);

  const surfacePath: GatePath = [
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
  ];

  const structuralPath: GatePath = [
    { kind: "M", x: edge, y: bottomY },
    { kind: "L", x: edge, y: railY },
    { kind: "L", x: width - edge, y: railY },
    { kind: "L", x: width - edge, y: bottomY },
    { kind: "Z" },
  ];

  const seedVariation = nextUint32(seedState(seed)) / 0xffffffff;
  const availableScrollLift = canonicalNumber(railY - edge - 4);
  const scrollLift = canonicalNumber(Math.min(availableScrollLift, 27 + seedVariation * 6));
  const scrollStart = safeLeft;
  const availableScrollReach = canonicalNumber(centerX - 24 - scrollStart);
  const baseScrollReach = Math.min(width * 0.22, 66 + seedVariation * 8, availableScrollReach);
  const scrollReach = canonicalNumber(baseScrollReach * (0.86 + density * 0.14));
  const scrollEnd = canonicalNumber(scrollStart + scrollReach);
  const curvatureScale = 0.8 + curvature * 0.3;
  const leftScroll: GatePath = [
    { kind: "M", x: scrollStart, y: railY },
    {
      kind: "C",
      x1: scrollStart + 5 * curvatureScale,
      y1: railY - 20 * curvatureScale,
      x2: scrollEnd - 18 * curvatureScale,
      y2: railY - scrollLift,
      x: scrollEnd,
      y: railY - scrollLift,
    },
    {
      kind: "C",
      x1: scrollEnd + 18 * curvatureScale,
      y1: railY - scrollLift,
      x2: scrollEnd + 22 * curvatureScale,
      y2: railY - 9 * curvatureScale,
      x: scrollEnd + 10,
      y: railY - 6,
    },
    {
      kind: "C",
      x1: scrollEnd,
      y1: railY - 3,
      x2: scrollEnd - 8 * curvatureScale,
      y2: railY - 10 * curvatureScale,
      x: scrollEnd - 3,
      y: railY - 16,
    },
  ];

  const spear: GatePath = [
    { kind: "M", x: centerX, y: railY },
    { kind: "L", x: centerX, y: edge + 18 },
    { kind: "M", x: centerX, y: edge },
    { kind: "L", x: centerX + 7, y: edge + 12 },
    { kind: "L", x: centerX, y: edge + 19 },
    { kind: "L", x: centerX - 7, y: edge + 12 },
    { kind: "Z" },
  ];

  const geometry: GateGeometry = {
    schemaVersion: 1,
    generationVersion: 1,
    seed,
    dimensions: { width, height },
    viewBox: { minX: 0, minY: 0, width, height },
    options: {
      generationVersion: 1,
      family: "courtyard",
      density,
      curvature,
      symmetry: 1,
      crest: "spear",
      inset: DEFAULT_INSET,
      strokeWidth: DEFAULT_STROKE_WIDTH,
    },
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
    surfacePath: canonicalizePath(surfacePath),
    structuralPaths: [canonicalizePath(structuralPath)],
    decorativePaths: [
      canonicalizePath(leftScroll),
      mirrorPath(canonicalizePath(leftScroll), width),
      canonicalizePath(spear),
    ],
  };

  return deepFreeze(geometry);
}
