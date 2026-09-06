import type {
  GateCrest,
  GateFamily,
  GateGenerationOptions,
  GateGenerationOptionsV1,
  GateGenerationOptionsV2,
  GateGenerationOptionsV3,
  GateGenerationVersion,
  GateGeometry,
  GateGeometryV1,
  GateGeometryV2,
  GateGeometryV3,
  GatePaintOptions,
  GateSeed,
} from "../core/index.js";
import { generateGate, renderGateSVG } from "../core/index.js";
import { isCompatibleCrest, isGateFamily } from "../core/v2/generate.js";

export type {
  GateCrest,
  GateFamily,
  GateGenerationVersion,
  GateGeometry,
  GateGeometryV1,
  GateGeometryV2,
  GateGeometryV3,
};

export interface GateOptionsV1 {
  readonly seed?: GateSeed;
  readonly generationVersion?: 1;
  readonly family?: "courtyard";
  readonly density?: number;
  readonly curvature?: number;
  readonly symmetry?: never;
  readonly peakHeight?: never;
  readonly sideComplexity?: never;
  readonly crest?: never;
  readonly stroke?: string;
  readonly surface?: string;
  readonly responsive?: boolean;
}

export interface GateOptionsV2 {
  readonly seed?: GateSeed;
  readonly generationVersion: 2;
  readonly family?: GateFamily | "auto";
  readonly density?: number;
  readonly curvature?: number;
  readonly symmetry?: number;
  readonly peakHeight?: number;
  readonly sideComplexity?: number;
  readonly crest?: GateCrest;
  readonly stroke?: string;
  readonly surface?: string;
  readonly responsive?: boolean;
}

export interface GateOptionsV3 extends Omit<GateOptionsV2, "generationVersion"> {
  readonly generationVersion: 3;
}

export type GateOptions = GateOptionsV1 | GateOptionsV2 | GateOptionsV3;

export type GateOptionUpdate =
  | Partial<GateOptionsV1>
  | (Partial<Omit<GateOptionsV2, "generationVersion">> & {
      readonly generationVersion?: 2;
    })
  | (Partial<Omit<GateOptionsV3, "generationVersion">> & { readonly generationVersion?: 3 });

export interface GateSnapshotBase {
  readonly seed: GateSeed;
  readonly paint: Readonly<Required<GatePaintOptions>>;
}

export interface GateSnapshotV1 extends GateSnapshotBase {
  readonly generationVersion: 1;
  readonly geometry: Readonly<GateGeometryV1>;
}

export interface GateSnapshotV2 extends GateSnapshotBase {
  readonly generationVersion: 2;
  readonly geometry: Readonly<GateGeometryV2>;
}

export interface GateSnapshotV3 extends GateSnapshotBase {
  readonly generationVersion: 3;
  readonly geometry: Readonly<GateGeometryV3>;
}

export type GateSnapshot = GateSnapshotV1 | GateSnapshotV2 | GateSnapshotV3;

export type GateFrameErrorCode =
  | "INVALID_SELECTOR"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_HTML_ELEMENT"
  | "UNSUPPORTED_TARGET"
  | "POSITIONING_CONFLICT"
  | "ALREADY_MOUNTED"
  | "INVALID_OPTIONS"
  | "UNSUPPORTED_DIMENSIONS"
  | "INSUFFICIENT_CONTENT_SPACE"
  | "NOT_READY"
  | "DESTROYED";

const freezeContext = <Context extends Record<string, unknown>>(
  context: Context,
): Readonly<Context> => {
  for (const value of Object.values(context)) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      freezeContext(value as Record<string, unknown>);
    }
  }
  return Object.freeze(context);
};

export class GateFrameError extends Error {
  declare readonly code: GateFrameErrorCode;
  declare readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: GateFrameErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    name = "GateFrameError",
  ) {
    super(message);
    Object.defineProperties(this, {
      name: { value: name, enumerable: false },
      code: { value: code, enumerable: true },
      context: { value: freezeContext(context), enumerable: true },
    });
  }
}

export class GateFrameInvalidSelectorError extends GateFrameError {
  constructor(selector: string) {
    super(
      "INVALID_SELECTOR",
      "Gate Frame received an invalid selector",
      { selector },
      "GateFrameInvalidSelectorError",
    );
  }
}

export class GateFrameTargetNotFoundError extends GateFrameError {
  constructor(selector: string) {
    super(
      "TARGET_NOT_FOUND",
      "Gate Frame could not find a target for the selector",
      { selector },
      "GateFrameTargetNotFoundError",
    );
  }
}

export class GateFrameTargetNotHTMLElementError extends GateFrameError {
  constructor(
    context:
      | {
          readonly source: "selector";
          readonly selector: string;
          readonly tagName: string;
        }
      | { readonly source: "direct"; readonly tagName: string }
      | { readonly source: "direct"; readonly valueType: string },
  ) {
    super(
      "TARGET_NOT_HTML_ELEMENT",
      "Gate Frame targets must be HTML elements",
      { ...context },
      "GateFrameTargetNotHTMLElementError",
    );
  }
}

export class GateFrameAlreadyMountedError extends GateFrameError {
  constructor(target: HTMLElement) {
    super(
      "ALREADY_MOUNTED",
      "Gate Frame is already mounted on this target",
      { tagName: target.localName },
      "GateFrameAlreadyMountedError",
    );
  }
}

type UnsupportedTargetReason =
  | "replaced-element"
  | "restricted-form-control"
  | "table-internal"
  | "display-inline"
  | "display-contents"
  | "unsupported-display"
  | "content-model"
  | "writing-mode"
  | "fragmented"
  | "shadow-host";

export class GateFrameUnsupportedTargetError extends GateFrameError {
  constructor(
    target: HTMLElement,
    reason: UnsupportedTargetReason,
    details: Record<string, unknown> = {},
  ) {
    super(
      "UNSUPPORTED_TARGET",
      "Gate Frame does not support this target",
      { tagName: target.localName, reason, ...details },
      "GateFrameUnsupportedTargetError",
    );
  }
}

export class GateFramePositioningConflictError extends GateFrameError {
  constructor(target: HTMLElement, descendant: Element) {
    super(
      "POSITIONING_CONFLICT",
      "Gate Frame will not change the containing block of an absolute descendant",
      { tagName: target.localName, descendantTagName: descendant.localName },
      "GateFramePositioningConflictError",
    );
  }
}

export class GateFrameInvalidOptionsError extends GateFrameError {
  constructor(context: {
    readonly optionKeys: ReadonlyArray<string>;
    readonly reason: string;
    readonly category?:
      | "shape"
      | "unknown-key"
      | "responsive"
      | "version"
      | "family"
      | "seed"
      | "value"
      | "crest"
      | "paint";
  }) {
    super(
      "INVALID_OPTIONS",
      "Gate Frame received invalid options",
      context.category === undefined
        ? { optionKeys: [...context.optionKeys], reason: context.reason }
        : {
            category: context.category,
            optionKeys: [...context.optionKeys],
            reason: context.reason,
          },
      "GateFrameInvalidOptionsError",
    );
  }
}

export class GateFrameUnsupportedDimensionsError extends GateFrameError {
  constructor(dimensions: Readonly<{ width: number; height: number }>) {
    super(
      "UNSUPPORTED_DIMENSIONS",
      "Gate Frame cannot generate geometry for the measured dimensions",
      { dimensions: { ...dimensions } },
      "GateFrameUnsupportedDimensionsError",
    );
  }
}

interface PhysicalInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export class GateFrameInsufficientSpaceError extends GateFrameError {
  constructor(measured: PhysicalInsets, required: PhysicalInsets) {
    super(
      "INSUFFICIENT_CONTENT_SPACE",
      "Gate Frame requires more existing target padding",
      { measured: { ...measured }, required: { ...required } },
      "GateFrameInsufficientSpaceError",
    );
  }
}

export class GateFrameNotReadyError extends GateFrameError {
  constructor() {
    super("NOT_READY", "Gate Frame has not committed a render", {}, "GateFrameNotReadyError");
  }
}

export class GateFrameDestroyedError extends GateFrameError {
  constructor() {
    super("DESTROYED", "Gate Frame controller is destroyed", {}, "GateFrameDestroyedError");
  }
}

export type GateFrameStatus =
  | Readonly<{ state: "pending" }>
  | Readonly<{ state: "ready"; snapshot: Readonly<GateSnapshot> }>
  | Readonly<{ state: "error"; error: GateFrameError }>
  | Readonly<{ state: "destroyed" }>;

export interface GateFrameController {
  status(): GateFrameStatus;
  whenReady(): Promise<Readonly<GateSnapshot>>;
  update(options: GateOptionUpdate): GateFrameController;
  randomize(seed?: GateSeed): GateSeed;
  snapshot(): Readonly<GateSnapshot> | null;
  toSVG(): string;
  destroy(): void;
}

interface ReadyWaiter {
  readonly resolve: (snapshot: Readonly<GateSnapshot>) => void;
  readonly reject: (error: Error) => void;
}

interface NormalizedControllerOptionsBase {
  readonly seed: GateSeed;
  readonly density: number;
  readonly curvature: number;
  readonly stroke: string;
  readonly surface: string;
  readonly responsive: boolean;
}

interface NormalizedControllerOptionsV1 extends NormalizedControllerOptionsBase {
  readonly generationVersion: 1;
  readonly family: "courtyard";
}

interface NormalizedControllerOptionsV2 extends NormalizedControllerOptionsBase {
  readonly generationVersion: 2;
  readonly family: GateFamily | "auto";
  readonly symmetry: number;
  readonly peakHeight: number;
  readonly sideComplexity: number;
  readonly crest: GateCrest | undefined;
}

interface NormalizedControllerOptionsV3
  extends Omit<NormalizedControllerOptionsV2, "generationVersion"> {
  readonly generationVersion: 3;
}

type NormalizedControllerOptions =
  | NormalizedControllerOptionsV1
  | NormalizedControllerOptionsV2
  | NormalizedControllerOptionsV3;

const PENDING_STATUS: GateFrameStatus = Object.freeze({ state: "pending" });
const DESTROYED_STATUS: GateFrameStatus = Object.freeze({ state: "destroyed" });
const mountedTargets = new WeakMap<HTMLElement, GateFrameController>();
const REPLACED_TAGS = new Set(["AUDIO", "CANVAS", "EMBED", "IFRAME", "IMG", "OBJECT", "VIDEO"]);
const RESTRICTED_FORM_TAGS = new Set([
  "BUTTON",
  "INPUT",
  "METER",
  "OPTION",
  "PROGRESS",
  "SELECT",
  "TEXTAREA",
]);
const TABLE_TAGS = new Set([
  "CAPTION",
  "COL",
  "COLGROUP",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
]);
const SUPPORTED_TARGET_TAGS = new Set(["ARTICLE", "ASIDE", "DIV", "SECTION"]);
const SUPPORTED_DISPLAYS = new Set(["block", "flex", "grid", "inline-block", "none"]);
const V1_OPTION_KEYS = new Set([
  "seed",
  "family",
  "generationVersion",
  "density",
  "curvature",
  "stroke",
  "surface",
  "responsive",
]);
const V2_OPTION_KEYS = new Set([
  ...V1_OPTION_KEYS,
  "symmetry",
  "peakHeight",
  "sideComplexity",
  "crest",
]);

const classifyTarget = (target: HTMLElement, style: CSSStyleDeclaration): void => {
  const display = style.display || target.style.display || "block";
  const writingMode = style.writingMode || target.style.writingMode || "horizontal-tb";
  const columnCountValue = style.columnCount || target.style.columnCount || "auto";
  const columnWidth = style.columnWidth || target.style.columnWidth || "auto";
  if (target.shadowRoot !== null) {
    throw new GateFrameUnsupportedTargetError(target, "shadow-host");
  }
  if (RESTRICTED_FORM_TAGS.has(target.tagName)) {
    throw new GateFrameUnsupportedTargetError(target, "restricted-form-control");
  }
  if (TABLE_TAGS.has(target.tagName)) {
    throw new GateFrameUnsupportedTargetError(target, "table-internal");
  }
  if (REPLACED_TAGS.has(target.tagName)) {
    throw new GateFrameUnsupportedTargetError(target, "replaced-element");
  }
  if (display === "inline") {
    throw new GateFrameUnsupportedTargetError(target, "display-inline", {
      display,
    });
  }
  if (display === "contents") {
    throw new GateFrameUnsupportedTargetError(target, "display-contents", {
      display,
    });
  }
  if (!SUPPORTED_DISPLAYS.has(display)) {
    throw new GateFrameUnsupportedTargetError(target, "unsupported-display", {
      display,
    });
  }
  if (!SUPPORTED_TARGET_TAGS.has(target.tagName)) {
    throw new GateFrameUnsupportedTargetError(target, "content-model");
  }
  if (!writingMode.startsWith("horizontal")) {
    throw new GateFrameUnsupportedTargetError(target, "writing-mode", {
      writingMode,
    });
  }
  const columnCount = Number.parseInt(columnCountValue, 10);
  if (
    (columnCountValue !== "auto" && Number.isFinite(columnCount) && columnCount > 1) ||
    columnWidth !== "auto"
  ) {
    throw new GateFrameUnsupportedTargetError(target, "fragmented", {
      columnCount: columnCountValue,
      columnWidth,
    });
  }
};

const createRandomSeed = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const invalidOptions = (options: unknown, reason: string): GateFrameInvalidOptionsError => {
  const optionKeys =
    options !== null && typeof options === "object" && !Array.isArray(options)
      ? Object.keys(options).sort()
      : [];
  return new GateFrameInvalidOptionsError({ optionKeys, reason });
};

const assertV1OptionKeys = (options: Record<string, unknown>): void => {
  const unsupportedKeys = Reflect.ownKeys(options)
    .filter((key) => typeof key !== "string" || !V1_OPTION_KEYS.has(key))
    .map(String)
    .sort();
  if (unsupportedKeys.length > 0) {
    throw new GateFrameInvalidOptionsError({
      optionKeys: unsupportedKeys,
      reason: "unsupported option keys",
    });
  }
};

type V2InvalidOptionsCategory =
  | "shape"
  | "unknown-key"
  | "responsive"
  | "version"
  | "family"
  | "seed"
  | "value"
  | "crest"
  | "paint";

const invalidV2Options = (
  category: V2InvalidOptionsCategory,
  optionKeys: ReadonlyArray<string>,
  reason: string,
): GateFrameInvalidOptionsError =>
  new GateFrameInvalidOptionsError({ category, optionKeys: [...optionKeys].sort(), reason });

const assertV2OptionShape = (options: unknown): Record<string, unknown> => {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw invalidV2Options("shape", [], "options must be a plain object");
  }
  const record = options as Record<string, unknown>;
  const unsupportedKeys = Reflect.ownKeys(record)
    .filter((key) => typeof key !== "string" || !V2_OPTION_KEYS.has(key))
    .map(String)
    .sort();
  if (unsupportedKeys.length > 0) {
    throw invalidV2Options("unknown-key", unsupportedKeys, "unsupported option keys");
  }
  return record;
};

const ownValue = (record: Record<string, unknown>, key: string, fallback: unknown): unknown =>
  !Object.hasOwn(record, key) || record[key] === undefined ? fallback : record[key];

const isGateSeed = (value: unknown): value is GateSeed =>
  (typeof value === "string" && value.length > 0) ||
  (typeof value === "number" && Number.isFinite(value));

const isUnitControl = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const EXPECTED_CORE_OPTION_ERROR =
  /^(?:GF-01 requires family: "courtyard"|GF-01 supports only generationVersion 1|Gate seed numbers must be finite|Gate seeds must be strings or finite numbers|Gate seed strings must not be empty|(?:density|curvature) must be (?:a finite number|between 0 and 1 inclusive)|(?:stroke|surface) paint must be (?:a string|a safe literal CSS color))$/;

const normalizeV1ControllerOptions = (
  options: GateOptionsV1,
  fallbackSeed?: GateSeed,
): Readonly<NormalizedControllerOptionsV1> => {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw invalidOptions(options, "options must be a plain object");
  }

  const optionRecord = options as Record<string, unknown>;
  assertV1OptionKeys(optionRecord);
  const optionOr = (name: string, fallback: unknown): unknown =>
    optionRecord[name] === undefined ? fallback : optionRecord[name];
  const responsive = optionOr("responsive", true);
  if (typeof responsive !== "boolean") {
    throw invalidOptions(options, "responsive must be a boolean");
  }
  const defaultSeed =
    optionRecord.seed === undefined && fallbackSeed === undefined
      ? createRandomSeed()
      : fallbackSeed;

  const generationOptions = {
    seed: optionOr("seed", defaultSeed),
    family: optionOr("family", "courtyard"),
    generationVersion: optionOr("generationVersion", 1),
    density: optionOr("density", 0.55),
    curvature: optionOr("curvature", 0.65),
  } as GateGenerationOptionsV1;
  const stroke = optionOr("stroke", "currentColor");
  const surface = optionOr("surface", "transparent");

  let validationGeometry: Readonly<GateGeometry>;
  try {
    validationGeometry = generateGate({ width: 160, height: 160 }, generationOptions);
    renderGateSVG(validationGeometry, {
      stroke: stroke as string,
      surface: surface as string,
    });
  } catch (cause) {
    if (
      (cause instanceof TypeError || cause instanceof RangeError) &&
      EXPECTED_CORE_OPTION_ERROR.test(cause.message)
    ) {
      throw invalidOptions(options, cause.message);
    }
    throw cause;
  }

  const normalizedStroke = (stroke as string).trim();
  const normalizedSurface = (surface as string).trim();
  if (!CSS.supports("color", normalizedStroke) || !CSS.supports("color", normalizedSurface)) {
    throw invalidOptions(options, "paint must be supported CSS color syntax");
  }

  return Object.freeze({
    seed: validationGeometry.seed,
    family: validationGeometry.options.family,
    generationVersion: validationGeometry.generationVersion,
    density: validationGeometry.options.density,
    curvature: validationGeometry.options.curvature,
    stroke: normalizedStroke,
    surface: normalizedSurface,
    responsive,
  });
};

const normalizeFamilyControllerOptions = (
  options: GateOptionsV2 | GateOptionsV3,
  fallbackSeed?: GateSeed,
): Readonly<NormalizedControllerOptionsV2 | NormalizedControllerOptionsV3> => {
  const optionRecord = assertV2OptionShape(options);
  const responsive = ownValue(optionRecord, "responsive", true);
  if (typeof responsive !== "boolean") {
    throw invalidV2Options("responsive", ["responsive"], "responsive must be a boolean");
  }

  const generationVersion = ownValue(optionRecord, "generationVersion", 2);
  if (generationVersion !== 2 && generationVersion !== 3) {
    throw invalidV2Options("version", ["generationVersion"], "generationVersion must be 2 or 3");
  }

  const requestedFamily = ownValue(optionRecord, "family", "auto");
  if (requestedFamily !== "auto" && !isGateFamily(requestedFamily)) {
    throw invalidV2Options("family", ["family"], "family must be auto or a supported family");
  }

  const suppliedSeed = ownValue(optionRecord, "seed", undefined);
  const defaultSeed =
    suppliedSeed === undefined && fallbackSeed === undefined ? createRandomSeed() : fallbackSeed;
  const requestedSeed = suppliedSeed === undefined ? defaultSeed : suppliedSeed;
  if (!isGateSeed(requestedSeed)) {
    throw invalidV2Options("seed", ["seed"], "seed must be a non-empty string or finite number");
  }

  const controls = [
    ["density", 0.55],
    ["curvature", 0.65],
    ["symmetry", 1],
    ["peakHeight", 0.35],
    ["sideComplexity", 0.5],
  ] as const;
  const normalizedControls: Record<(typeof controls)[number][0], number> = {
    density: 0.55,
    curvature: 0.65,
    symmetry: 1,
    peakHeight: 0.35,
    sideComplexity: 0.5,
  };
  for (const [key, fallback] of controls) {
    const value = ownValue(optionRecord, key, fallback);
    if (!isUnitControl(value)) {
      throw invalidV2Options("value", [key], `${key} must be between 0 and 1 inclusive`);
    }
    normalizedControls[key] = value;
  }

  const requestedCrest = ownValue(optionRecord, "crest", undefined);
  if (
    requestedCrest !== undefined &&
    !(["spear", "fleur", "diamond", "none"] as const).includes(requestedCrest as GateCrest)
  ) {
    throw invalidV2Options("crest", ["crest"], "crest must be a supported crest");
  }

  const generationOptions: GateGenerationOptionsV2 | GateGenerationOptionsV3 = {
    generationVersion,
    seed: requestedSeed,
    family: requestedFamily as GateFamily | "auto",
    density: normalizedControls.density,
    curvature: normalizedControls.curvature,
    symmetry: normalizedControls.symmetry,
    peakHeight: normalizedControls.peakHeight,
    sideComplexity: normalizedControls.sideComplexity,
    ...(requestedCrest === undefined ? {} : { crest: requestedCrest as GateCrest }),
  };

  let validationGeometry: Readonly<GateGeometryV2 | GateGeometryV3>;
  try {
    validationGeometry = generateGate({ width: 160, height: 160 }, generationOptions);
  } catch (cause) {
    if (cause instanceof TypeError || cause instanceof RangeError) {
      throw invalidV2Options("crest", ["crest"], cause.message);
    }
    throw cause;
  }

  if (
    requestedCrest !== undefined &&
    !isCompatibleCrest(validationGeometry.options.family, requestedCrest)
  ) {
    throw invalidV2Options(
      "crest",
      ["crest"],
      `crest is incompatible with generation-v2 family ${validationGeometry.options.family}`,
    );
  }

  const stroke = ownValue(optionRecord, "stroke", "currentColor");
  const surface = ownValue(optionRecord, "surface", "transparent");
  try {
    renderGateSVG(validationGeometry, { stroke: stroke as string, surface: surface as string });
  } catch (cause) {
    if (cause instanceof TypeError || cause instanceof RangeError) {
      const key =
        typeof stroke !== "string" || cause.message.startsWith("stroke") ? "stroke" : "surface";
      throw invalidV2Options("paint", [key], cause.message);
    }
    throw cause;
  }

  const normalizedStroke = (stroke as string).trim();
  const normalizedSurface = (surface as string).trim();
  if (!CSS.supports("color", normalizedStroke)) {
    throw invalidV2Options("paint", ["stroke"], "paint must be supported CSS color syntax");
  }
  if (!CSS.supports("color", normalizedSurface)) {
    throw invalidV2Options("paint", ["surface"], "paint must be supported CSS color syntax");
  }

  return Object.freeze({
    seed: validationGeometry.seed,
    generationVersion,
    family: requestedFamily as GateFamily | "auto",
    density: validationGeometry.options.density,
    curvature: validationGeometry.options.curvature,
    symmetry: validationGeometry.options.symmetry,
    peakHeight: validationGeometry.options.peakHeight,
    sideComplexity: validationGeometry.options.sideComplexity,
    crest: requestedCrest as GateCrest | undefined,
    stroke: normalizedStroke,
    surface: normalizedSurface,
    responsive,
  });
};

const normalizeControllerOptions = (
  options: GateOptions,
  fallbackSeed?: GateSeed,
  oracleVersion?: GateGenerationVersion,
): Readonly<NormalizedControllerOptions> => {
  const optionRecord = options as unknown as Record<string, unknown>;
  const version =
    oracleVersion ??
    (options !== null &&
    typeof options === "object" &&
    !Array.isArray(options) &&
    Object.hasOwn(optionRecord, "generationVersion") &&
    (optionRecord.generationVersion === 2 || optionRecord.generationVersion === 3)
      ? optionRecord.generationVersion
      : 1);
  return version === 2 || version === 3
    ? normalizeFamilyControllerOptions(options as GateOptionsV2 | GateOptionsV3, fallbackSeed)
    : normalizeV1ControllerOptions(options as GateOptionsV1, fallbackSeed);
};

const mergeControllerOptions = (
  current: Readonly<NormalizedControllerOptions>,
  updates: GateOptionUpdate,
): Readonly<{ options: GateOptions; version: GateGenerationVersion }> => {
  const updateRecord = updates as unknown as Record<string, unknown>;
  const suppliedVersion =
    updates !== null &&
    typeof updates === "object" &&
    !Array.isArray(updates) &&
    Object.hasOwn(updateRecord, "generationVersion")
      ? updateRecord.generationVersion
      : undefined;
  const targetVersion = suppliedVersion === undefined ? current.generationVersion : suppliedVersion;
  const oracleVersion =
    targetVersion === 1
      ? 1
      : current.generationVersion !== 1 || targetVersion === 2 || targetVersion === 3
        ? 2
        : 1;

  if (oracleVersion === 2) {
    const checkedUpdates = assertV2OptionShape(updates);
    const responsive = ownValue(checkedUpdates, "responsive", undefined);
    if (responsive !== undefined && typeof responsive !== "boolean") {
      throw invalidV2Options("responsive", ["responsive"], "responsive must be a boolean");
    }
    if (targetVersion !== 2 && targetVersion !== 3) {
      throw invalidV2Options(
        "version",
        ["generationVersion"],
        "generationVersion must be 1, 2 or 3",
      );
    }
  } else {
    if (updates === null || typeof updates !== "object" || Array.isArray(updates)) {
      throw invalidOptions(updates, "options must be a plain object");
    }
    assertV1OptionKeys(updateRecord);
  }

  const candidate: Record<string, unknown> =
    targetVersion === current.generationVersion
      ? { ...current }
      : Object.fromEntries(
          [
            "seed",
            "family",
            "density",
            "curvature",
            "stroke",
            "surface",
            "responsive",
            ...(current.generationVersion !== 1 && (targetVersion === 2 || targetVersion === 3)
              ? ["symmetry", "peakHeight", "sideComplexity", "crest"]
              : []),
          ].map((key) => [key, current[key as keyof NormalizedControllerOptions]]),
        );
  candidate.generationVersion = targetVersion;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      candidate[key] = value;
    }
  }
  return { options: candidate as GateOptions, version: targetVersion as GateGenerationVersion };
};

const measuredBorderBox = (entry: ResizeObserverEntry): ResizeObserverSize | undefined => {
  return entry.borderBoxSize[0];
};

const physicalBorderWidth = (
  style: CSSStyleDeclaration,
  side: "left" | "right" | "top" | "bottom",
): number => {
  const value = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
  return Number.isFinite(value) ? value : 0;
};

const physicalPadding = (style: CSSStyleDeclaration): PhysicalInsets => {
  const read = (side: "top" | "right" | "bottom" | "left"): number => {
    const value = Number.parseFloat(style.getPropertyValue(`padding-${side}`));
    return Number.isFinite(value) ? value : 0;
  };
  return {
    top: read("top"),
    right: read("right"),
    bottom: read("bottom"),
    left: read("left"),
  };
};

const hasRequiredPadding = (measured: PhysicalInsets, required: PhysicalInsets): boolean =>
  measured.top >= required.top &&
  measured.right >= required.right &&
  measured.bottom >= required.bottom &&
  measured.left >= required.left;

const supportsDimensions = (dimensions: Readonly<{ width: number; height: number }>): boolean => {
  const { width, height } = dimensions;
  const aspectRatio = width / height;
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 160 &&
    width <= 1_600 &&
    height >= 96 &&
    height <= 1_200 &&
    aspectRatio >= 0.5 &&
    aspectRatio <= 6
  );
};

const parseOverlay = (standaloneSvg: string): SVGSVGElement => {
  const parsed = new DOMParser().parseFromString(standaloneSvg, "image/svg+xml");
  const parsedRoot = parsed.documentElement;
  if (parsedRoot.localName !== "svg" || parsedRoot.namespaceURI !== "http://www.w3.org/2000/svg") {
    throw new Error("Gate Frame core returned an invalid SVG document");
  }

  return document.importNode(parsedRoot, true) as unknown as SVGSVGElement;
};

export function gateFrame(
  targetValue: HTMLElement | string,
  options: GateOptions = {},
): GateFrameController {
  let target: HTMLElement;
  if (typeof targetValue === "string") {
    let resolvedTarget: Element | null;
    try {
      resolvedTarget = document.querySelector(targetValue);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "SyntaxError") {
        throw new GateFrameInvalidSelectorError(targetValue);
      }
      throw cause;
    }
    if (resolvedTarget === null) {
      throw new GateFrameTargetNotFoundError(targetValue);
    }
    if (!(resolvedTarget instanceof HTMLElement)) {
      throw new GateFrameTargetNotHTMLElementError({
        source: "selector",
        selector: targetValue,
        tagName: resolvedTarget.localName,
      });
    }
    target = resolvedTarget;
  } else {
    const directTarget: unknown = targetValue;
    if (!(directTarget instanceof HTMLElement)) {
      throw new GateFrameTargetNotHTMLElementError(
        directTarget instanceof Element
          ? { source: "direct", tagName: directTarget.localName }
          : { source: "direct", valueType: directTarget === null ? "null" : typeof directTarget },
      );
    }
    target = directTarget;
  }

  if (mountedTargets.has(target)) {
    throw new GateFrameAlreadyMountedError(target);
  }

  const initialStyle = getComputedStyle(target);
  classifyTarget(target, initialStyle);
  let currentOptions = normalizeControllerOptions(options);
  const computedPosition = initialStyle.position || target.style.position || "static";
  const previousPosition = target.style.getPropertyValue("position");
  const previousPositionPriority = target.style.getPropertyPriority("position");
  const ownsPosition = computedPosition === "static";
  if (ownsPosition) {
    const absoluteDescendant = Array.from(target.querySelectorAll("*")).find(
      (descendant) => getComputedStyle(descendant).position === "absolute",
    );
    if (absoluteDescendant !== undefined) {
      throw new GateFramePositioningConflictError(target, absoluteDescendant);
    }
    target.style.setProperty("position", "relative");
  }

  let seed = currentOptions.seed;
  let paint: Readonly<Required<GatePaintOptions>> = Object.freeze({
    stroke: currentOptions.stroke,
    surface: currentOptions.surface,
  });
  let currentStatus = PENDING_STATUS;
  let currentSnapshot: Readonly<GateSnapshot> | null = null;
  let standaloneSvg: string | null = null;
  let overlay: SVGSVGElement | null = null;
  let animationFrame: number | null = null;
  let generation = 0;
  let destroyed = false;
  let destroyError: GateFrameDestroyedError | null = null;
  let observing = false;
  let observedBorderBoxDimensions: Readonly<{ width: number; height: number }> | null = null;
  let measuredDimensions: Readonly<{ width: number; height: number }> | null = null;
  const readyWaiters: ReadyWaiter[] = [];

  const hasNonzeroLayout = (): boolean => target.offsetWidth > 0 && target.offsetHeight > 0;

  const invalidateMeasurement = (): void => {
    if (destroyed) {
      return;
    }
    measuredDimensions = null;
    currentStatus = PENDING_STATUS;
    generation += 1;
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  const publishRenderError = (error: GateFrameError): void => {
    generation += 1;
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    overlay?.remove();
    overlay = null;
    currentStatus = Object.freeze({ state: "error", error });
    for (const waiter of readyWaiters.splice(0)) {
      waiter.reject(error);
    }
  };

  const scheduleRender = (): void => {
    if (destroyed || measuredDimensions === null) {
      return;
    }

    currentStatus = PENDING_STATUS;
    const token = ++generation;
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    const frameId = requestAnimationFrame(() => {
      if (animationFrame === frameId) {
        animationFrame = null;
      }
      if (destroyed || token !== generation || measuredDimensions === null) {
        return;
      }
      if (!target.isConnected || !hasNonzeroLayout()) {
        invalidateMeasurement();
        return;
      }

      const style = getComputedStyle(target);
      try {
        classifyTarget(target, style);
      } catch (cause) {
        if (cause instanceof GateFrameUnsupportedTargetError) {
          publishRenderError(cause);
          return;
        }
        throw cause;
      }

      if (!supportsDimensions(measuredDimensions)) {
        publishRenderError(new GateFrameUnsupportedDimensionsError(measuredDimensions));
        return;
      }

      const generationOptions: GateGenerationOptions =
        currentOptions.generationVersion === 1
          ? {
              seed,
              family: "courtyard",
              generationVersion: 1,
              density: currentOptions.density,
              curvature: currentOptions.curvature,
            }
          : ({
              seed,
              generationVersion: currentOptions.generationVersion,
              family: currentOptions.family,
              density: currentOptions.density,
              curvature: currentOptions.curvature,
              symmetry: currentOptions.symmetry,
              peakHeight: currentOptions.peakHeight,
              sideComplexity: currentOptions.sideComplexity,
              ...(currentOptions.crest === undefined ? {} : { crest: currentOptions.crest }),
            } as GateGenerationOptionsV2 | GateGenerationOptionsV3);
      const geometry = generateGate(measuredDimensions, generationOptions);
      const measuredPadding = physicalPadding(style);
      if (!hasRequiredPadding(measuredPadding, geometry.contentInsets)) {
        publishRenderError(
          new GateFrameInsufficientSpaceError(measuredPadding, geometry.contentInsets),
        );
        return;
      }
      const nextStandaloneSvg = renderGateSVG(geometry, paint);
      const nextOverlay = parseOverlay(nextStandaloneSvg);
      if (destroyed || token !== generation) {
        return;
      }
      nextOverlay.setAttribute("data-gate-frame-overlay", "");
      nextOverlay.setAttribute("aria-hidden", "true");
      nextOverlay.setAttribute("focusable", "false");
      nextOverlay.style.position = "absolute";
      nextOverlay.style.inset = "0";
      nextOverlay.style.width = "100%";
      nextOverlay.style.height = "100%";
      nextOverlay.style.pointerEvents = "none";

      const nextSnapshot: Readonly<GateSnapshot> =
        geometry.generationVersion === 1
          ? Object.freeze({
              seed: geometry.seed,
              generationVersion: 1,
              geometry,
              paint,
            })
          : geometry.generationVersion === 2
            ? Object.freeze({
                seed: geometry.seed,
                generationVersion: 2,
                geometry,
                paint,
              })
            : Object.freeze({ seed: geometry.seed, generationVersion: 3, geometry, paint });

      if (overlay === null) {
        target.append(nextOverlay);
      } else {
        overlay.replaceWith(nextOverlay);
      }
      if (currentOptions.responsive === false && observing) {
        observer.disconnect();
        observing = false;
      }
      overlay = nextOverlay;
      standaloneSvg = nextStandaloneSvg;
      currentSnapshot = nextSnapshot;
      currentStatus = Object.freeze({ state: "ready", snapshot: nextSnapshot });
      for (const waiter of readyWaiters.splice(0)) {
        waiter.resolve(nextSnapshot);
      }
    });
    animationFrame = frameId;
  };

  const observer = new ResizeObserver((entries) => {
    const entry = entries.find((candidate) => candidate.target === target);
    const borderBox = entry === undefined ? undefined : measuredBorderBox(entry);
    if (borderBox === undefined || !target.isConnected || !hasNonzeroLayout()) {
      invalidateMeasurement();
      return;
    }

    const style = getComputedStyle(target);
    observedBorderBoxDimensions = {
      width: borderBox.inlineSize,
      height: borderBox.blockSize,
    };
    const width =
      observedBorderBoxDimensions.width -
      physicalBorderWidth(style, "left") -
      physicalBorderWidth(style, "right");
    const height =
      observedBorderBoxDimensions.height -
      physicalBorderWidth(style, "top") -
      physicalBorderWidth(style, "bottom");
    if (width <= 0 || height <= 0) {
      invalidateMeasurement();
      return;
    }
    const measurementChanged =
      measuredDimensions?.width !== width || measuredDimensions.height !== height;
    measuredDimensions = { width, height };
    try {
      classifyTarget(target, style);
    } catch (cause) {
      if (cause instanceof GateFrameUnsupportedTargetError) {
        publishRenderError(cause);
        return;
      }
      throw cause;
    }
    if (!measurementChanged) {
      return;
    }
    scheduleRender();
  });

  const controller: GateFrameController = {
    status: () => currentStatus,
    whenReady: () => {
      if (destroyed) {
        return Promise.reject(destroyError ?? new GateFrameDestroyedError());
      }
      if (currentStatus.state === "ready") {
        return Promise.resolve(currentStatus.snapshot);
      }
      if (currentStatus.state === "error") {
        return Promise.reject(currentStatus.error);
      }
      return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }));
    },
    update: (nextOptions) => {
      if (destroyed) {
        throw destroyError ?? new GateFrameDestroyedError();
      }

      const merged = mergeControllerOptions(currentOptions, nextOptions);
      const candidateOptions = normalizeControllerOptions(
        merged.options,
        currentOptions.seed,
        merged.version,
      );
      if (observedBorderBoxDimensions !== null) {
        const style = getComputedStyle(target);
        const width =
          observedBorderBoxDimensions.width -
          physicalBorderWidth(style, "left") -
          physicalBorderWidth(style, "right");
        const height =
          observedBorderBoxDimensions.height -
          physicalBorderWidth(style, "top") -
          physicalBorderWidth(style, "bottom");
        if (width <= 0 || height <= 0) {
          invalidateMeasurement();
        } else {
          measuredDimensions = { width, height };
        }
      }
      const wasResponsive = currentOptions.responsive !== false;
      currentOptions = candidateOptions;
      seed = candidateOptions.seed;
      paint = Object.freeze({
        stroke: currentOptions.stroke,
        surface: currentOptions.surface,
      });
      if (wasResponsive === false && currentOptions.responsive !== false && !observing) {
        observer.observe(target, { box: "border-box" });
        observing = true;
      }
      scheduleRender();
      return controller;
    },
    randomize: (explicitSeed) => {
      if (destroyed) {
        throw destroyError ?? new GateFrameDestroyedError();
      }

      const requestedSeed = explicitSeed === undefined ? createRandomSeed() : explicitSeed;
      const merged = mergeControllerOptions(currentOptions, { seed: requestedSeed });
      const candidateOptions = normalizeControllerOptions(
        merged.options,
        currentOptions.seed,
        merged.version,
      );
      currentOptions = candidateOptions;
      seed = candidateOptions.seed;
      scheduleRender();
      return seed;
    },
    snapshot: () => {
      if (destroyed) {
        throw destroyError ?? new GateFrameDestroyedError();
      }
      return currentSnapshot;
    },
    toSVG: () => {
      if (destroyed) {
        throw destroyError ?? new GateFrameDestroyedError();
      }
      if (standaloneSvg === null) {
        throw new GateFrameNotReadyError();
      }
      return standaloneSvg;
    },
    destroy: () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      destroyError = new GateFrameDestroyedError();
      generation += 1;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      observer.disconnect();
      observing = false;
      overlay?.remove();
      overlay = null;
      for (const waiter of readyWaiters.splice(0)) {
        waiter.reject(destroyError);
      }
      if (
        ownsPosition &&
        target.style.getPropertyValue("position") === "relative" &&
        target.style.getPropertyPriority("position") === ""
      ) {
        if (previousPosition === "") {
          target.style.removeProperty("position");
        } else {
          target.style.setProperty("position", previousPosition, previousPositionPriority);
        }
      }
      mountedTargets.delete(target);
      currentSnapshot = null;
      standaloneSvg = null;
      currentStatus = DESTROYED_STATUS;
    },
  };

  mountedTargets.set(target, controller);
  observer.observe(target, { box: "border-box" });
  observing = true;
  return controller;
}
