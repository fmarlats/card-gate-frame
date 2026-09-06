import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("provides both planned TypeScript source entry points", async () => {
  const entryPoints = [
    new URL("../../src/index.ts", import.meta.url),
    new URL("../../src/core/index.ts", import.meta.url),
  ];

  await expect(
    Promise.all(entryPoints.map((entryPoint) => access(fileURLToPath(entryPoint)))),
  ).resolves.toEqual([undefined, undefined]);
});
