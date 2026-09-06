import { canonicalNumber } from "./geometry-utils.js";
import type {
  GateCrest,
  GateDimensions,
  GateFamily,
  GateGenerationOptionsV2,
  GateGenerationOptionsV3,
  GateSeed,
  NormalizedGateGenerationOptionsV2,
  NormalizedGateGenerationOptionsV3,
} from "./types.js";
import { sampleIndex as sampleIndexV2 } from "./v2/sampler.js";
import { sampleIndex as sampleIndexV3 } from "./v3/sampler.js";

const INSET = 8 as const;
const STROKE_WIDTH = 2 as const;
const FAMILY_ORDER: readonly GateFamily[] = [
  "courtyard",
  "fleuron",
  "arcade",
  "vine",
  "fan",
  "volute",
];
const SPEAR_DIAMOND_CRESTS = ["spear", "diamond", "none"] as const;
const FLEUR_SPEAR_CRESTS = ["fleur", "spear", "none"] as const;
const DIAMOND_SPEAR_CRESTS = ["diamond", "spear", "none"] as const;
const FLEUR_DIAMOND_CRESTS = ["fleur", "diamond", "none"] as const;

export const isGateFamily = (value: unknown): value is GateFamily =>
  typeof value === "string" && FAMILY_ORDER.includes(value as GateFamily);

export const compatibleCrestsForFamily = (family: GateFamily): ReadonlyArray<GateCrest> =>
  family === "courtyard"
    ? SPEAR_DIAMOND_CRESTS
    : family === "vine"
      ? FLEUR_DIAMOND_CRESTS
      : family === "arcade" || family === "fan"
        ? DIAMOND_SPEAR_CRESTS
        : FLEUR_SPEAR_CRESTS;

export const isCompatibleCrest = (family: unknown, crest: unknown): boolean =>
  isGateFamily(family) && compatibleCrestsForFamily(family).includes(crest as GateCrest);
const FAMILY_OPTION_KEYS = new Set([
  "seed",
  "generationVersion",
  "family",
  "density",
  "curvature",
  "symmetry",
  "peakHeight",
  "sideComplexity",
  "crest",
]);

const requirePlainObject = (value: unknown, version: 2 | 3): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`generation-v${version} options must be a plain object`);
  }
  return value as Record<string, unknown>;
};

const ownValue = (input: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(input, key) ? input[key] : undefined;

export const normalizeDimensions = (dimensions: GateDimensions): GateDimensions => {
  if (dimensions === null || typeof dimensions !== "object") {
    throw new TypeError("Gate dimensions must be a plain object");
  }
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
  return { width: canonicalNumber(width), height: canonicalNumber(height) };
};

const normalizeSeed = (value: unknown): GateSeed => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Gate seed numbers must be finite");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Gate seeds must be non-empty strings or finite numbers");
  }
  return value;
};

const normalizeControl = (value: unknown, fallback: number, name: string): number => {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (candidate < 0 || candidate > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive`);
  }
  return canonicalNumber(candidate);
};

export function normalizeFamilyOptions(
  value: GateGenerationOptionsV2,
  version: 2,
): { readonly seed: GateSeed; readonly options: NormalizedGateGenerationOptionsV2 };
export function normalizeFamilyOptions(
  value: GateGenerationOptionsV3,
  version: 3,
): { readonly seed: GateSeed; readonly options: NormalizedGateGenerationOptionsV3 };
export function normalizeFamilyOptions(
  value: GateGenerationOptionsV2 | GateGenerationOptionsV3,
  version: 2 | 3,
): {
  readonly seed: GateSeed;
  readonly options: NormalizedGateGenerationOptionsV2 | NormalizedGateGenerationOptionsV3;
} {
  const sampleIndex = version === 2 ? sampleIndexV2 : sampleIndexV3;
  const input = requirePlainObject(value, version);
  const unsupportedKeys = Reflect.ownKeys(input)
    .filter((key) => typeof key !== "string" || !FAMILY_OPTION_KEYS.has(key))
    .map(String)
    .sort();
  if (unsupportedKeys.length > 0) {
    throw new TypeError(
      `Unsupported generation-v${version} option keys: ${unsupportedKeys.join(", ")}`,
    );
  }
  if (ownValue(input, "generationVersion") !== version) {
    throw new TypeError(`generation-v${version} options require generationVersion ${version}`);
  }

  const seed = normalizeSeed(ownValue(input, "seed"));
  const familyInput = ownValue(input, "family");
  const requestedFamily = familyInput === undefined ? "auto" : familyInput;
  if (requestedFamily !== "auto" && !isGateFamily(requestedFamily)) {
    throw new TypeError(`generation-v${version} family is invalid`);
  }
  const family =
    requestedFamily === "auto"
      ? (FAMILY_ORDER[sampleIndex(seed, "family", FAMILY_ORDER.length)] as GateFamily)
      : (requestedFamily as GateFamily);

  const density = normalizeControl(ownValue(input, "density"), 0.55, "density");
  const curvature = normalizeControl(ownValue(input, "curvature"), 0.65, "curvature");
  const symmetry = normalizeControl(ownValue(input, "symmetry"), 1, "symmetry");
  const peakHeight = normalizeControl(ownValue(input, "peakHeight"), 0.35, "peakHeight");
  const sideComplexity = normalizeControl(ownValue(input, "sideComplexity"), 0.5, "sideComplexity");
  const requestedCrest = ownValue(input, "crest");
  const compatibleCrests = compatibleCrestsForFamily(family);
  if (
    requestedCrest !== undefined &&
    (typeof requestedCrest !== "string" || !compatibleCrests.includes(requestedCrest as never))
  ) {
    throw new TypeError(`crest is incompatible with generation-v${version} family ${family}`);
  }
  const crest =
    requestedCrest === undefined
      ? (compatibleCrests[
          version === 3 ? 0 : sampleIndex(seed, `${family}/crest`, compatibleCrests.length)
        ] as GateCrest)
      : (requestedCrest as NormalizedGateGenerationOptionsV2["crest"]);

  return {
    seed,
    options: {
      generationVersion: version,
      family,
      density,
      curvature,
      symmetry,
      peakHeight,
      sideComplexity,
      crest,
      inset: INSET,
      strokeWidth: STROKE_WIDTH,
    },
  };
}
