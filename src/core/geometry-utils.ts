import type { GatePath, GatePathCommand } from "./types.js";

const COORDINATE_SCALE = 10_000;

export const canonicalNumber = (value: number): number => {
  const rounded = Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export const canonicalizeCommand = (command: GatePathCommand): GatePathCommand => {
  switch (command.kind) {
    case "M":
    case "L":
      return { kind: command.kind, x: canonicalNumber(command.x), y: canonicalNumber(command.y) };
    case "C":
      return {
        kind: "C",
        x1: canonicalNumber(command.x1),
        y1: canonicalNumber(command.y1),
        x2: canonicalNumber(command.x2),
        y2: canonicalNumber(command.y2),
        x: canonicalNumber(command.x),
        y: canonicalNumber(command.y),
      };
    case "Q":
      return {
        kind: "Q",
        x1: canonicalNumber(command.x1),
        y1: canonicalNumber(command.y1),
        x: canonicalNumber(command.x),
        y: canonicalNumber(command.y),
      };
    case "Z":
      return { kind: "Z" };
  }
};

export const canonicalizePath = (path: GatePath): GatePath => path.map(canonicalizeCommand);

export const mirrorCommand = (command: GatePathCommand, width: number): GatePathCommand => {
  switch (command.kind) {
    case "M":
    case "L":
      return { kind: command.kind, x: canonicalNumber(width - command.x), y: command.y };
    case "C":
      return {
        kind: "C",
        x1: canonicalNumber(width - command.x1),
        y1: command.y1,
        x2: canonicalNumber(width - command.x2),
        y2: command.y2,
        x: canonicalNumber(width - command.x),
        y: command.y,
      };
    case "Q":
      return {
        kind: "Q",
        x1: canonicalNumber(width - command.x1),
        y1: command.y1,
        x: canonicalNumber(width - command.x),
        y: command.y,
      };
    case "Z":
      return { kind: "Z" };
  }
};

export const mirrorPath = (path: GatePath, width: number): GatePath =>
  path.map((command) => mirrorCommand(command, width));

export const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};
