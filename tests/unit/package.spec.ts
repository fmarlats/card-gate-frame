import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("exposes an installable public 1.0.0 package with an explicit distribution allowlist", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  expect(manifest).toMatchObject({
    name: "card-gate-frame",
    version: "1.0.0",
    license: "MIT",
    type: "module",
    sideEffects: false,
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
    repository: { type: "git", url: "git+https://github.com/fmarlats/card-gate-frame.git" },
    files: ["dist", "README.md", "LICENSE"],
  });
  expect(manifest.private).toBeUndefined();
  expect(manifest.author).toBeUndefined();
  expect(manifest.dependencies ?? {}).toEqual({});
});
