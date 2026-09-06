import { generateGate } from "./dispatch.js";
import type {
  GateCrest,
  GateDimensions,
  GateFamily,
  GateGenerationOptionsV1,
  GateGenerationOptionsV2,
  GateGenerationOptionsV3,
  GateGeometry,
  GatePaintOptions,
  GatePath,
  GatePathCommand,
} from "./types.js";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_KEYWORD = /^(?:transparent|currentcolor)$/i;
const FUNCTION_COLOR = /^(rgb|rgba|hsl|hsla)\((.*)\)$/i;
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const XML_DELIMITER = /[&<>"']/;

type RuntimeRecord = Record<string, unknown>;

const sourceDimensions = (dimensions: GateDimensions): GateDimensions => {
  const { width, height } = dimensions;
  for (const sourceWidth of [width, width - 0.000_049_9, width + 0.000_049_9]) {
    for (const sourceHeight of [height, height - 0.000_049_9, height + 0.000_049_9]) {
      const ratio = sourceWidth / sourceHeight;
      if (ratio >= 0.5 && ratio <= 6) return { width: sourceWidth, height: sourceHeight };
    }
  }
  return dimensions;
};

const requirePlainObject = (value: unknown, name: string): RuntimeRecord => {
  if (value === null || typeof value !== "object") {
    throw new TypeError(`${name} must be a plain object`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object`);
  }

  return value as RuntimeRecord;
};

const structurallyEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  const leftRecord = left as RuntimeRecord;
  const rightRecord = right as RuntimeRecord;
  const leftKeys = Reflect.ownKeys(leftRecord);
  const rightKeys = Reflect.ownKeys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        structurallyEqual(Reflect.get(leftRecord, key), Reflect.get(rightRecord, key)),
    )
  );
};

const regenerateGeometry = (
  geometry: RuntimeRecord,
  sourceDimensions: GateDimensions,
): Readonly<GateGeometry> => {
  const options = geometry.options as RuntimeRecord;
  if (geometry.generationVersion === 1) {
    const publicOptions: GateGenerationOptionsV1 = {
      generationVersion: 1,
      seed: geometry.seed as string | number,
      family: "courtyard",
      density: options.density as number,
      curvature: options.curvature as number,
    };
    return generateGate(sourceDimensions, publicOptions);
  }

  const publicOptions: GateGenerationOptionsV2 | GateGenerationOptionsV3 = {
    generationVersion: geometry.generationVersion === 3 ? 3 : 2,
    seed: geometry.seed as string | number,
    family: options.family as GateFamily,
    density: options.density as number,
    curvature: options.curvature as number,
    symmetry: options.symmetry as number,
    peakHeight: options.peakHeight as number,
    sideComplexity: options.sideComplexity as number,
    crest: options.crest as GateCrest,
  };
  return generateGate(sourceDimensions, publicOptions);
};

const validateGeometryForSerialization = (value: unknown): Readonly<GateGeometry> => {
  const geometry = requirePlainObject(value, "geometry");
  const dimensions = requirePlainObject(geometry.dimensions, "geometry.dimensions");
  const canonicalGeometry = regenerateGeometry(
    geometry,
    sourceDimensions(dimensions as unknown as GateDimensions),
  );
  if (!structurallyEqual(geometry, canonicalGeometry)) {
    throw new TypeError("geometry must exactly match canonical generated geometry");
  }
  return canonicalGeometry;
};

const hasXmlBreakingCharacter = (value: string): boolean => {
  if (XML_DELIMITER.test(value)) {
    return true;
  }

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 8 || codeUnit === 11 || codeUnit === 12 || (codeUnit >= 14 && codeUnit <= 31)) {
      return true;
    }
    if (codeUnit === 127) {
      return true;
    }
  }

  return false;
};

const parseChannel = (token: string, maximum: number, percentOnly = false): boolean => {
  const percent = token.endsWith("%");
  const numberText = percent ? token.slice(0, -1) : token;

  if ((percentOnly && !percent) || !DECIMAL_NUMBER.test(numberText)) {
    return false;
  }

  const value = Number(numberText);
  const upperBound = percent ? 100 : maximum;
  return Number.isFinite(value) && value >= 0 && value <= upperBound;
};

const isFunctionalColor = (paint: string): boolean => {
  const match = FUNCTION_COLOR.exec(paint);
  if (match === null) {
    return false;
  }

  const functionName = match[1]?.toLowerCase();
  const channels = match[2]?.split(",").map((channel) => channel.trim()) ?? [];
  const hasAlpha = functionName === "rgba" || functionName === "hsla";

  if (channels.length !== (hasAlpha ? 4 : 3) || channels.some((channel) => channel === "")) {
    return false;
  }

  if (functionName === "rgb" || functionName === "rgba") {
    const colorChannels = channels.slice(0, 3);
    if (!colorChannels.every((channel) => parseChannel(channel, 255))) {
      return false;
    }
  } else {
    const [hue, saturation, lightness] = channels;
    if (
      hue === undefined ||
      saturation === undefined ||
      lightness === undefined ||
      !DECIMAL_NUMBER.test(hue) ||
      !Number.isFinite(Number(hue)) ||
      !parseChannel(saturation, 100, true) ||
      !parseChannel(lightness, 100, true)
    ) {
      return false;
    }
  }

  const alpha = channels[3];
  return alpha === undefined || parseChannel(alpha, 1);
};

const normalizePaint = (value: string, name: "stroke" | "surface"): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${name} paint must be a string`);
  }

  const paint = value.trim();
  if (
    paint.length === 0 ||
    hasXmlBreakingCharacter(paint) ||
    (!HEX_COLOR.test(paint) && !COLOR_KEYWORD.test(paint) && !isFunctionalColor(paint))
  ) {
    throw new TypeError(`${name} paint must be a safe literal CSS color`);
  }

  return paint;
};

const escapeXmlAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");

const serializeCommand = (command: GatePathCommand): string => {
  switch (command.kind) {
    case "M":
    case "L":
      return `${command.kind}${command.x} ${command.y}`;
    case "C":
      return `C${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}`;
    case "Q":
      return `Q${command.x1} ${command.y1} ${command.x} ${command.y}`;
    case "Z":
      return "Z";
  }
};

const serializePath = (path: GatePath): string => path.map(serializeCommand).join(" ");

export function renderGateSVG(geometry: GateGeometry, paint: GatePaintOptions = {}): string {
  const canonicalGeometry = validateGeometryForSerialization(geometry);
  const stroke = escapeXmlAttribute(normalizePaint(paint.stroke ?? "currentColor", "stroke"));
  const surface = escapeXmlAttribute(normalizePaint(paint.surface ?? "transparent", "surface"));
  const { width, height } = canonicalGeometry.dimensions;
  const viewBox = canonicalGeometry.viewBox;
  const surfacePath = `<path d="${serializePath(canonicalGeometry.surfacePath)}" fill="${surface}" fill-rule="evenodd" stroke="none"/>`;
  if (canonicalGeometry.generationVersion === 3) {
    const paths = (items: readonly GatePath[]): string =>
      items.map((path) => `<path d="${serializePath(path)}"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" data-gate-frame-generation-version="3">${surfacePath}<g stroke="${stroke}" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="2">${paths(canonicalGeometry.structuralPaths)}</g><g stroke-width="1.8">${paths(canonicalGeometry.decorativePaths)}</g><g stroke-width="1.2">${paths(canonicalGeometry.finePaths)}</g><g stroke-width="0.8" fill="${stroke}">${paths(canonicalGeometry.solidPaths)}</g></g></svg>`;
  }
  const ironPaths = [
    ...canonicalGeometry.structuralPaths.map(
      (path) => `<path d="${serializePath(path)}" fill="none"/>`,
    ),
    ...canonicalGeometry.decorativePaths.map(
      (path) => `<path d="${serializePath(path)}" fill="none"/>`,
    ),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" data-gate-frame-generation-version="${canonicalGeometry.generationVersion}">${surfacePath}<g stroke="${stroke}" stroke-width="${canonicalGeometry.options.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ironPaths}</g></svg>`;
}
