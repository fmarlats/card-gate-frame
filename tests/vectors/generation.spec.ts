import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  type GateDimensions,
  type GateGenerationOptions,
  type GatePaintOptions,
  generateGate,
  renderGateSVG,
} from "../../src/core/index.js";

type FileMetadata = { filename: string; byteLength: number; sha256: string };
type Vector = {
  input: { dimensions: GateDimensions; options: GateGenerationOptions };
  files: { svg: FileMetadata; geometry?: FileMetadata };
};
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

for (const [version, count, manifestHash] of [
  [1, 3, "94ed83f5a9bb237e350cf731755e6638e3754451d2a6497e6e8a3dd92148e0e6"],
  [2, 18, "d6736505ad9a3811d49e450996acc539b98ed043a0c1903d4ff7141fa3031a9c"],
  [3, 30, "1991e97c3839f5c18d19325c828ae031eacb054ac7a5a9b5feef6171886a8510"],
] as const) {
  test(`reproduces exact generation ${version} geometry and SVG bytes`, async () => {
    const root = new URL(`../fixtures/v${version}/`, import.meta.url);
    const manifestBytes = await readFile(new URL("manifest.json", root));
    expect(sha256(manifestBytes)).toBe(manifestHash);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      generationVersion: number;
      paint: GatePaintOptions;
      vectors: Vector[];
    };
    expect(manifest.generationVersion).toBe(version);
    expect(manifest.vectors).toHaveLength(count);
    const files = manifest.vectors.flatMap((vector) =>
      Object.values(vector.files).map((file) => file.filename),
    );
    expect(new Set(files).size).toBe(files.length);
    expect((await readdir(root)).sort()).toEqual(["manifest.json", ...files].sort());
    for (const { input, files } of manifest.vectors) {
      const geometry = generateGate(input.dimensions, input.options);
      const regenerated = {
        svg: renderGateSVG(geometry, manifest.paint),
        geometry: `${JSON.stringify(geometry, null, 2)}\n`,
      };
      for (const kind of ["svg", "geometry"] as const) {
        const metadata = files[kind];
        if (!metadata) continue;
        const bytes = await readFile(new URL(metadata.filename, root));
        expect(bytes.toString("utf8")).toBe(regenerated[kind]);
        expect(bytes.byteLength).toBe(metadata.byteLength);
        expect(sha256(bytes)).toBe(metadata.sha256);
      }
    }
  });
}
