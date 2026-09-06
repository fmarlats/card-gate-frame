import type { GatePath } from "../../src/core/types.js";

export type Point = Readonly<{ x: number; y: number }>;
export const pathPoints = (path: GatePath): Point[] =>
  path.flatMap((command) => {
    if (command.kind === "Z") return [];
    return [
      { x: command.x, y: command.y },
      ...(command.kind === "C"
        ? [
            { x: command.x1, y: command.y1 },
            { x: command.x2, y: command.y2 },
          ]
        : []),
      ...(command.kind === "Q" ? [{ x: command.x1, y: command.y1 }] : []),
    ];
  });

export function hasMirroredPoints(paths: readonly GatePath[], width: number): boolean {
  const counts = new Map<string, number>();
  for (const { x, y } of paths.flatMap(pathPoints)) {
    const key = `${Math.round(x * 10000)}:${Math.round(y * 10000)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // The pen may start on either side of a closed contour, repeating that vertex.
  // Reflection concerns coordinate coverage, not that arbitrary start multiplicity.
  return [...counts].every(([key]) => {
    const [x, y] = key.split(":");
    return counts.has(`${Math.round(width * 10000) - Number(x)}:${y}`);
  });
}

export function segmentHulls(path: GatePath): Point[][] {
  const hulls: Point[][] = [];
  let current: Point | undefined;
  let start: Point | undefined;
  for (const command of path) {
    if (command.kind === "M") {
      current = start = { x: command.x, y: command.y };
      continue;
    }
    if (!current) throw new Error("Path segment has no start");
    const end = command.kind === "Z" ? start : { x: command.x, y: command.y };
    if (!end) throw new Error("Closed segment has no start");
    hulls.push([current, ...pathPoints([command]), end]);
    current = end;
  }
  return hulls;
}
