import { generateGate as generateCourtyardV1 } from "./courtyard.js";
import type {
  GateDimensions,
  GateGenerationOptions,
  GateGenerationOptionsV1,
  GateGenerationOptionsV2,
  GateGenerationOptionsV3,
  GateGeometry,
  GateGeometryV1,
  GateGeometryV2,
  GateGeometryV3,
} from "./types.js";
import { generateGateV2 } from "./v2/generate.js";
import { generateGateV3 } from "./v3/generate.js";

const V2_ONLY_OPTION_KEYS = ["symmetry", "peakHeight", "sideComplexity", "crest"] as const;

export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptionsV3,
): Readonly<GateGeometryV3>;
export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptionsV1,
): Readonly<GateGeometryV1>;
export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptionsV2,
): Readonly<GateGeometryV2>;
export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptionsV2 | GateGenerationOptionsV3,
): Readonly<GateGeometryV2 | GateGeometryV3>;
export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptions,
): Readonly<GateGeometry>;
export function generateGate(
  dimensions: GateDimensions,
  options: GateGenerationOptions,
): Readonly<GateGeometry> {
  if (
    options !== null &&
    typeof options === "object" &&
    Object.hasOwn(options, "generationVersion") &&
    options.generationVersion === 3
  ) {
    return generateGateV3(dimensions, options);
  }
  if (
    options !== null &&
    typeof options === "object" &&
    Object.hasOwn(options, "generationVersion") &&
    (options as { readonly generationVersion?: unknown }).generationVersion === 2
  ) {
    return generateGateV2(dimensions, options as GateGenerationOptionsV2);
  }

  if (options !== null && typeof options === "object") {
    for (const key of V2_ONLY_OPTION_KEYS) {
      if (Object.hasOwn(options, key)) {
        throw new TypeError(`${key} requires generationVersion 2`);
      }
    }
  }

  return generateCourtyardV1(
    dimensions,
    options as GateGenerationOptionsV1,
  ) as Readonly<GateGeometryV1>;
}
