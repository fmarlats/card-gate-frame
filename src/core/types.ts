export type GateSeed = string | number;

export type GateGenerationVersion = 1 | 2 | 3;

export type GateFamily = "courtyard" | "fleuron" | "arcade" | "vine" | "fan" | "volute";

export type GateCrest = "spear" | "fleur" | "diamond" | "none";

export interface GateDimensions {
  readonly width: number;
  readonly height: number;
}

export interface GateGenerationOptionsV1 {
  readonly seed: GateSeed;
  readonly generationVersion?: 1;
  readonly family: "courtyard";
  readonly density?: number;
  readonly curvature?: number;
  readonly symmetry?: never;
  readonly peakHeight?: never;
  readonly sideComplexity?: never;
  readonly crest?: never;
}

export interface GateGenerationOptionsV2 {
  readonly seed: GateSeed;
  readonly generationVersion: 2;
  readonly family?: GateFamily | "auto";
  readonly density?: number;
  readonly curvature?: number;
  readonly symmetry?: number;
  readonly peakHeight?: number;
  readonly sideComplexity?: number;
  readonly crest?: GateCrest;
}

export interface GateGenerationOptionsV3
  extends Omit<GateGenerationOptionsV2, "generationVersion"> {
  readonly generationVersion: 3;
}

export type GateGenerationOptions =
  | GateGenerationOptionsV1
  | GateGenerationOptionsV2
  | GateGenerationOptionsV3;

export interface NormalizedGateGenerationOptionsV1 {
  readonly generationVersion: 1;
  readonly family: "courtyard";
  readonly density: number;
  readonly curvature: number;
  readonly symmetry: 1;
  readonly crest: "spear";
  readonly inset: 8;
  readonly strokeWidth: 2;
}

export interface NormalizedGateGenerationOptionsV2 {
  readonly generationVersion: 2;
  readonly family: GateFamily;
  readonly density: number;
  readonly curvature: number;
  readonly symmetry: number;
  readonly peakHeight: number;
  readonly sideComplexity: number;
  readonly crest: GateCrest;
  readonly inset: 8;
  readonly strokeWidth: 2;
}

export interface NormalizedGateGenerationOptionsV3
  extends Omit<NormalizedGateGenerationOptionsV2, "generationVersion"> {
  readonly generationVersion: 3;
}

export type NormalizedGateGenerationOptions =
  | NormalizedGateGenerationOptionsV1
  | NormalizedGateGenerationOptionsV2
  | NormalizedGateGenerationOptionsV3;

export interface GatePaintOptions {
  readonly stroke?: string;
  readonly surface?: string;
}

export type GatePathCommand =
  | Readonly<{ kind: "M" | "L"; x: number; y: number }>
  | Readonly<{
      kind: "C";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }>
  | Readonly<{ kind: "Q"; x1: number; y1: number; x: number; y: number }>
  | Readonly<{ kind: "Z" }>;

export type GatePath = ReadonlyArray<GatePathCommand>;

export interface GateInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface GateGeometryBase {
  readonly schemaVersion: 1;
  readonly seed: GateSeed;
  readonly dimensions: Readonly<GateDimensions>;
  readonly viewBox: Readonly<{
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
    readonly height: number;
  }>;
  readonly bounds: Readonly<{
    readonly left: number;
    readonly right: number;
    readonly railY: number;
    readonly bottomY: number;
  }>;
  readonly contentInsets: Readonly<GateInsets>;
  readonly surfacePath: GatePath;
  readonly structuralPaths: ReadonlyArray<GatePath>;
  readonly decorativePaths: ReadonlyArray<GatePath>;
}

export interface GateGeometryV1 extends GateGeometryBase {
  readonly generationVersion: 1;
  readonly options: Readonly<NormalizedGateGenerationOptionsV1>;
}

export interface GateGeometryV2 extends GateGeometryBase {
  readonly generationVersion: 2;
  readonly options: Readonly<NormalizedGateGenerationOptionsV2>;
}

export interface GateGeometryV3 extends GateGeometryBase {
  readonly generationVersion: 3;
  readonly options: Readonly<NormalizedGateGenerationOptionsV3>;
  readonly finePaths: ReadonlyArray<GatePath>;
  readonly solidPaths: ReadonlyArray<GatePath>;
}

export type GateGeometry = GateGeometryV1 | GateGeometryV2 | GateGeometryV3;
