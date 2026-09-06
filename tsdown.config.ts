import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
  },
  tsconfig: "tsconfig.dom.json",
  platform: "browser",
  target: "es2022",
  format: "esm",
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  treeshake: true,
  clean: true,
  minify: false,
});
