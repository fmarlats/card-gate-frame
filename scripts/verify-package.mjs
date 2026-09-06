import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, tmpdir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { chromium } from "@playwright/test";
import { build as viteBuild } from "vite";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = join(repositoryRoot, "package.json");
const expectedToolVersions = Object.freeze({
  vite: "8.2.2",
  publint: "0.3.24",
  attw: "0.18.5",
  typescript: "7.0.2",
  tsdown: "0.23.0",
  playwright: "1.63.0",
});
const forbiddenLifecycleScripts = Object.freeze([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "postpack",
  "prepublish",
  "publish",
  "postpublish",
]);
const expectedExports = Object.freeze({
  ".": {
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  },
  "./core": {
    types: "./dist/core/index.d.ts",
    import: "./dist/core/index.js",
  },
});
const fixedArchiveFiles = Object.freeze([
  "LICENSE",
  "README.md",
  "dist/core/index.d.ts",
  "dist/core/index.js",
  "dist/index.d.ts",
  "dist/index.d.ts.map",
  "dist/index.js",
  "dist/index.js.map",
  "package.json",
]);
const exampleViewports = Object.freeze([
  Object.freeze({ label: "desktop", width: 1280, height: 900 }),
  Object.freeze({ label: "mobile-512", width: 512, height: 900 }),
  Object.freeze({ label: "mobile-320", width: 320, height: 900 }),
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const run = (command, args, options = {}) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) {
        resolvePromise(result);
        return;
      }

      const rendered = [
        `Command failed (${code ?? signal}): ${command} ${args.join(" ")}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n");
      rejectPromise(new Error(rendered));
    });
  });

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const assertNoRuntimeDependencies = (manifest) => {
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ]) {
    const value = manifest[field];
    if (Array.isArray(value)) {
      assert.equal(value.length, 0, `${field} must be empty`);
    } else if (value !== undefined) {
      assert.equal(
        value !== null && typeof value === "object" ? Object.keys(value).length : -1,
        0,
        `${field} must be empty`,
      );
    }
  }
};

const assertNoUnderminingLifecycle = (manifest, requireReleaseGate = false) => {
  const scripts = manifest.scripts ?? {};
  for (const script of forbiddenLifecycleScripts) {
    assert.equal(scripts[script], undefined, `forbidden lifecycle script: ${script}`);
  }
  if (requireReleaseGate || scripts.prepublishOnly !== undefined) {
    assert.equal(
      scripts.prepublishOnly,
      "pnpm test:all",
      "prepublishOnly must run the complete local release gate",
    );
  }
};

const copyBuildWorkspace = async (buildRoot) => {
  await mkdir(buildRoot, { recursive: true });
  for (const filename of [
    "package.json",
    "README.md",
    "LICENSE",
    "tsdown.config.ts",
    "tsconfig.base.json",
    "tsconfig.dom.json",
  ]) {
    await copyFile(join(repositoryRoot, filename), join(buildRoot, filename));
  }
  await cp(join(repositoryRoot, "src"), join(buildRoot, "src"), { recursive: true });
  await symlink(join(repositoryRoot, "node_modules"), join(buildRoot, "node_modules"), "dir");
};

const readTarString = (buffer, start, length) => {
  const field = buffer.subarray(start, start + length);
  const nullIndex = field.indexOf(0);
  return field.subarray(0, nullIndex === -1 ? field.length : nullIndex).toString("utf8");
};

const readTarNumber = (buffer, start, length) => {
  const value = readTarString(buffer, start, length).trim();
  return value === "" ? 0 : Number.parseInt(value, 8);
};

const parsePax = (data) => {
  const attributes = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    assert.notEqual(space, -1, "invalid PAX record length");
    const recordLength = Number.parseInt(data.subarray(offset, space).toString("ascii"), 10);
    assert.ok(Number.isInteger(recordLength) && recordLength > 0, "invalid PAX record");
    const record = data.subarray(space + 1, offset + recordLength - 1).toString("utf8");
    const equals = record.indexOf("=");
    assert.ok(equals > 0, "invalid PAX attribute");
    attributes[record.slice(0, equals)] = record.slice(equals + 1);
    offset += recordLength;
  }
  assert.equal(offset, data.length, "invalid PAX record boundary");
  return attributes;
};

const parseTarball = (tarballBytes) => {
  const archive = gunzipSync(tarballBytes);
  const entries = [];
  const names = new Set();
  let offset = 0;
  let nextPath;
  let paxAttributes = {};

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const expectedChecksum = readTarNumber(header, 148, 8);
    let checksum = 0;
    for (let index = 0; index < 512; index += 1) {
      checksum += index >= 148 && index < 156 ? 0x20 : header[index];
    }
    assert.equal(checksum, expectedChecksum, "tar header checksum mismatch");

    const shortName = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const headerPath = prefix === "" ? shortName : `${prefix}/${shortName}`;
    const size = readTarNumber(header, 124, 12);
    const mode = readTarNumber(header, 100, 8);
    const type = String.fromCharCode(header[156] || 0);
    assert.ok(Number.isSafeInteger(size) && size >= 0, "invalid tar entry size");
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    assert.ok(dataEnd <= archive.length, "truncated tar entry");
    const data = Buffer.from(archive.subarray(dataStart, dataEnd));
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === "x" || type === "g") {
      paxAttributes = { ...paxAttributes, ...parsePax(data) };
      continue;
    }
    if (type === "L") {
      nextPath = data.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }

    const name = nextPath ?? paxAttributes.path ?? headerPath;
    nextPath = undefined;
    paxAttributes = {};
    assert.ok(name.length > 0, "tar entry must have a path");
    assert.ok(!names.has(name), `duplicate tar entry: ${name}`);
    names.add(name);

    if (type === "\0" || type === "0") {
      entries.push({ name, type: "file", mode, data });
    } else if (type === "5") {
      entries.push({ name: name.replace(/\/$/, ""), type: "directory", mode, data });
    } else {
      assert.fail(`unsupported tar entry type ${JSON.stringify(type)} for ${name}`);
    }
  }

  return entries;
};

const assertSafeArchivePath = (name) => {
  assert.ok(!isAbsolute(name), `archive path must be relative: ${name}`);
  assert.ok(name.startsWith("package/"), `archive path must use package/: ${name}`);
  const packagePath = name.slice("package/".length);
  assert.ok(packagePath.length > 0, `archive path must name a package file: ${name}`);
  assert.ok(
    !packagePath.split("/").some((part) => part === "" || part === "." || part === ".."),
    `unsafe archive path: ${name}`,
  );
  return packagePath;
};

const extractArchive = async (entries, extractRoot) => {
  await mkdir(extractRoot, { recursive: true });
  for (const entry of entries) {
    const packagePath = assertSafeArchivePath(entry.name);
    const destination = resolve(extractRoot, packagePath);
    assert.ok(
      destination.startsWith(`${extractRoot}${sep}`),
      `unsafe extraction path: ${entry.name}`,
    );
    if (entry.type === "directory") {
      await mkdir(destination, { recursive: true });
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, entry.data);
    await chmod(destination, entry.mode & 0o777);
  }
};

const validateArchiveManifest = (fileEntries) => {
  const archiveFiles = fileEntries.map((entry) => assertSafeArchivePath(entry.name)).sort();
  assert.equal(archiveFiles.length, 13, "packed archive must contain exactly 13 files");

  for (const path of fixedArchiveFiles) {
    assert.ok(archiveFiles.includes(path), `packed archive is missing ${path}`);
  }

  const generatedFiles = archiveFiles.filter((path) => !fixedArchiveFiles.includes(path));
  assert.equal(generatedFiles.length, 4, "packed archive must contain four shared build files");
  const coreChunk = generatedFiles.find((path) => /^dist\/core-[\w-]+\.js$/u.test(path));
  const coreMap = generatedFiles.find((path) => /^dist\/core-[\w-]+\.js\.map$/u.test(path));
  const typesChunk = generatedFiles.find((path) => /^dist\/index-[\w-]+\.d\.ts$/u.test(path));
  const typesMap = generatedFiles.find((path) => /^dist\/index-[\w-]+\.d\.ts\.map$/u.test(path));
  assert.ok(
    coreChunk && coreMap && typesChunk && typesMap,
    "unexpected shared build file manifest",
  );
  assert.equal(coreMap, `${coreChunk}.map`, "core chunk and source map names must agree");
  assert.equal(typesMap, `${typesChunk}.map`, "declaration chunk and map names must agree");

  for (const path of archiveFiles) {
    assert.ok(
      path === "README.md" ||
        path === "LICENSE" ||
        path === "package.json" ||
        path.startsWith("dist/"),
      `development residue in package: ${path}`,
    );
  }
  return archiveFiles;
};

const validatePackedManifest = (manifest, sourceManifest) => {
  assert.equal(manifest.name, "card-gate-frame");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.private, undefined);
  assert.equal(
    manifest.description,
    "Deterministic ornamental SVG frames for prepared HTML containers and DOM-free generation.",
  );
  assert.deepEqual(manifest.keywords, ["svg", "frame", "ornament", "deterministic", "typescript"]);
  assert.equal(manifest.author, undefined);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.sideEffects, false);
  assert.deepEqual(manifest.exports, expectedExports);
  assert.deepEqual(manifest.files, ["dist", "README.md", "LICENSE"]);
  assert.equal(manifest.name, sourceManifest.name);
  assert.equal(manifest.version, sourceManifest.version);
  assertNoRuntimeDependencies(manifest);
  assertNoUnderminingLifecycle(manifest);
};

const listFiles = async (root, current = root) => {
  const results = [];
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(root, path)));
    } else {
      assert.ok(entry.isFile(), `installed package contains a non-file: ${path}`);
      results.push(relative(root, path).split(sep).join("/"));
    }
  }
  return results.sort();
};

const writeConsumerFixtures = async (consumerRoot) => {
  const fixturesRoot = join(consumerRoot, "fixtures");
  await mkdir(fixturesRoot, { recursive: true });
  await writeFile(
    join(fixturesRoot, "root-v3.ts"),
    `import { gateFrame, type GateOptionsV3 } from "card-gate-frame";
const options: GateOptionsV3 = { generationVersion: 3, seed: "packed-v3", family: "fleuron" };
const controller = gateFrame(document.createElement("article"), options);
const snapshot = controller.snapshot();
if (snapshot?.generationVersion === 3) { const paths = snapshot.geometry.solidPaths; void paths; }
controller.update({ generationVersion: 2 });
controller.update(options);
controller.destroy();
`,
  );
  await writeFile(
    join(fixturesRoot, "core-v3.ts"),
    `import { generateGate, renderGateSVG, type GateGeometryV3 } from "card-gate-frame/core";
const geometry: Readonly<GateGeometryV3> = generateGate({ width: 600, height: 360 }, { generationVersion: 3, seed: "packed-v3", family: "fleuron" });
export const svg: string = renderGateSVG(geometry);
`,
  );
  await writeFile(
    join(fixturesRoot, "root.ts"),
    `import { gateFrame, type GateFrameStatus, type GateSnapshot } from "card-gate-frame";\n\nconst target = document.createElement("article");\nconst v1 = gateFrame(target, { seed: "typed-root-v1", family: "courtyard" });\nconst status: GateFrameStatus = v1.status();\nvoid status;\nv1.destroy();\nconst v2 = gateFrame(target, { generationVersion: 2, seed: "typed-root-v2", family: "volute", symmetry: 0.7, peakHeight: 0.4, sideComplexity: 0.6, crest: "fleur" });\nconst snapshot = v2.snapshot() as GateSnapshot | null;\nif (snapshot?.generationVersion === 2) {\n  const family: "courtyard" | "fleuron" | "arcade" | "vine" | "fan" | "volute" = snapshot.geometry.options.family;\n  void family;\n}\nv2.update({ family: "arcade", crest: "diamond" });\nv2.update({ generationVersion: 1, family: "courtyard" });\nv2.destroy();\n`,
  );
  await writeFile(
    join(fixturesRoot, "core.ts"),
    `import { generateGate, renderGateSVG, type GateGeometryV1, type GateGeometryV2 } from "card-gate-frame/core";\n\nconst v1: Readonly<GateGeometryV1> = generateGate(\n  { width: 600, height: 360 },\n  { seed: "typed-core-v1", family: "courtyard", generationVersion: 1 },\n);\nconst v2: Readonly<GateGeometryV2> = generateGate(\n  { width: 600, height: 360 },\n  { generationVersion: 2, seed: "typed-core-v2", family: "fan", crest: "diamond" },\n);\nexport const svgs: readonly string[] = [renderGateSVG(v1), renderGateSVG(v2)];\n`,
  );
  const commonCompilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
  };
  await writeFile(
    join(fixturesRoot, "tsconfig.root.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          ...commonCompilerOptions,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        files: ["root.ts", "root-v3.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(fixturesRoot, "tsconfig.core.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          ...commonCompilerOptions,
          lib: ["ES2022"],
        },
        files: ["core.ts", "core-v3.ts"],
      },
      null,
      2,
    )}\n`,
  );
};

const writeRuntimeConsumer = async (consumerRoot) => {
  await writeFile(
    join(consumerRoot, "runtime.mjs"),
    `import { gateFrame } from "card-gate-frame";\nimport { generateGate, renderGateSVG } from "card-gate-frame/core";\n\nconst v1 = generateGate(\n  { width: 600, height: 360 },\n  { seed: "packed-runtime-v1", family: "courtyard" },\n);\nconst v2 = generateGate(\n  { width: 600, height: 360 },\n  { generationVersion: 2, seed: "packed-runtime-v2", family: "fan", crest: "diamond" },\n);\nconst v3 = generateGate({ width: 600, height: 360 }, { generationVersion: 3, seed: "packed-runtime-v3", family: "fleuron" });\nconst v3Svg = renderGateSVG(v3);\nconst v1Svg = renderGateSVG(v1, { stroke: "#20221e", surface: "#d6c4a1" });\nconst v2Svg = renderGateSVG(v2, { stroke: "#20221e", surface: "#d6c4a1" });\nprocess.stdout.write(JSON.stringify({\n  resolvedRoot: import.meta.resolve("card-gate-frame"),\n  resolvedCore: import.meta.resolve("card-gate-frame/core"),\n  gateFrameType: typeof gateFrame,\n  v1: { version: v1.generationVersion, family: v1.options.family, seed: v1.seed },\n  v2: { version: v2.generationVersion, family: v2.options.family, seed: v2.seed },\n  v3: { version: v3.generationVersion, family: v3.options.family, seed: v3.seed, crest: v3.options.crest, filled: v3.solidPaths.length > 0 },\n  svgStartsWith: v3Svg.startsWith("<svg ") && v1Svg.startsWith("<svg ") && v2Svg.startsWith("<svg "),\n  svgIncludesPath: v3Svg.includes("<path ") && v1Svg.includes("<path ") && v2Svg.includes("<path "),\n}));\n`,
  );
};

const copyExample = async (consumerRoot) => {
  const sourceRoot = join(repositoryRoot, "examples", "vanilla");
  const exampleRoot = join(consumerRoot, "example");
  await mkdir(exampleRoot, { recursive: true });
  for (const filename of ["index.html", "main.ts", "style.css"]) {
    await copyFile(join(sourceRoot, filename), join(exampleRoot, filename));
  }
  return exampleRoot;
};

const startStaticServer = async (root) => {
  const sockets = new Set();
  const contentTypes = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".map", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
  ]);
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405).end();
        return;
      }
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const path = resolve(root, requested);
      if (path !== resolve(root, "index.html") && !path.startsWith(`${resolve(root)}${sep}`)) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentTypes.get(extname(path)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(500).end();
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: async () => {
      server.closeAllConnections();
      for (const socket of sockets) {
        socket.destroy();
      }
      if (server.listening) {
        await new Promise((resolvePromise, rejectPromise) =>
          server.close((error) => (error === undefined ? resolvePromise() : rejectPromise(error))),
        );
      }
    },
  };
};

const verifyExampleInChromium = async (exampleDistRoot) => {
  const server = await startStaticServer(exampleDistRoot);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const browserErrors = [];
    let activeViewport = "startup";
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push({ viewport: activeViewport, message: `console: ${message.text()}` });
      }
    });
    page.on("pageerror", (error) =>
      browserErrors.push({ viewport: activeViewport, message: `page: ${error.message}` }),
    );

    const readPlaygroundPath = () =>
      page.evaluate(() => {
        const overlay = document.querySelector("#courtyard-card > svg[data-gate-frame-overlay]");
        return Array.from(overlay?.querySelectorAll("path") ?? [], (path) =>
          path.getAttribute("d"),
        ).join("|");
      });
    const readPlaygroundPaint = () =>
      page.evaluate(() => {
        const overlay = document.querySelector("#courtyard-card > svg[data-gate-frame-overlay]");
        return {
          stroke: overlay?.querySelector("g")?.getAttribute("stroke") ?? null,
          surface: overlay?.querySelector("path")?.getAttribute("fill") ?? null,
        };
      });
    const readPlaygroundRender = () =>
      page.evaluate(() => {
        const card = document.querySelector("#courtyard-card");
        const overlays = card?.querySelectorAll(":scope > svg[data-gate-frame-overlay]") ?? [];
        const overlay = overlays[0];
        const width = Number(overlay?.getAttribute("width"));
        const height = Number(overlay?.getAttribute("height"));
        const viewBox = overlay?.getAttribute("viewBox") ?? "";
        const viewBoxValues = viewBox.split(/\s+/u).map(Number);
        return {
          aspect: document.querySelector("#aspect-select")?.value,
          canvas: card instanceof HTMLElement ? card.dataset.canvas : undefined,
          status: card instanceof HTMLElement ? card.dataset.gateFrameStatus : undefined,
          statusText: document.querySelector("#interaction-status")?.textContent,
          renderedSeed: card instanceof HTMLElement ? card.dataset.seed : undefined,
          overlayCount: overlays.length,
          width,
          height,
          viewBox,
          pathSignature: Array.from(overlay?.querySelectorAll("path") ?? [], (path) =>
            path.getAttribute("d"),
          ).join("|"),
          validGeometry:
            Number.isFinite(width) &&
            width > 0 &&
            Number.isFinite(height) &&
            height > 0 &&
            viewBoxValues.length === 4 &&
            viewBoxValues.every((value) => Number.isFinite(value)) &&
            viewBoxValues[2] === width &&
            viewBoxValues[3] === height,
          horizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1 ||
            document.body.scrollWidth > window.innerWidth + 1,
        };
      });
    const readPlaygroundControlState = () =>
      page.evaluate(() => {
        const normalizeRange = (selector) => {
          const input = document.querySelector(selector);
          if (!(input instanceof HTMLInputElement)) {
            return undefined;
          }
          const value = Number(input.value);
          return Number.isFinite(value) ? value.toFixed(2) : undefined;
        };
        const card = document.querySelector("#courtyard-card");
        const overlays = card?.querySelectorAll(":scope > svg[data-gate-frame-overlay]") ?? [];
        const overlay = overlays[0];
        return {
          seed: document.querySelector("#seed-input")?.value,
          renderedSeed: card instanceof HTMLElement ? card.dataset.seed : undefined,
          family: document.querySelector("#family-select")?.value,
          effectiveFamily: card instanceof HTMLElement ? card.dataset.family : undefined,
          crest: document.querySelector("#crest-select")?.value,
          effectiveCrest: card instanceof HTMLElement ? card.dataset.crest : undefined,
          density: normalizeRange("#density-input"),
          densityReadout: document.querySelector("#density-output")?.textContent,
          curvature: normalizeRange("#curvature-input"),
          curvatureReadout: document.querySelector("#curvature-output")?.textContent,
          symmetry: normalizeRange("#symmetry-input"),
          symmetryReadout: document.querySelector("#symmetry-output")?.textContent,
          peakHeight: normalizeRange("#peak-height-input"),
          peakHeightReadout: document.querySelector("#peak-height-output")?.textContent,
          sideComplexity: normalizeRange("#side-complexity-input"),
          sideComplexityReadout: document.querySelector("#side-complexity-output")?.textContent,
          palette: document.querySelector("#palette-select")?.value,
          aspect: document.querySelector("#aspect-select")?.value,
          canvas: card instanceof HTMLElement ? card.dataset.canvas : undefined,
          status: card instanceof HTMLElement ? card.dataset.gateFrameStatus : undefined,
          overlayCount: overlays.length,
          pathSignature: Array.from(overlay?.querySelectorAll("path") ?? [], (path) =>
            path.getAttribute("d"),
          ).join("|"),
          horizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1 ||
            document.body.scrollWidth > window.innerWidth + 1,
        };
      });
    const readGalleryState = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-variation-card]"), (item) => {
          const frame = item.querySelector("[data-variation-frame]");
          const overlays = frame?.querySelectorAll(":scope > svg[data-gate-frame-overlay]") ?? [];
          const overlay = overlays[0];
          const width = Number(overlay?.getAttribute("width"));
          const height = Number(overlay?.getAttribute("height"));
          const viewBoxValues = (overlay?.getAttribute("viewBox") ?? "").split(/\s+/u).map(Number);
          return {
            status: item instanceof HTMLElement ? item.dataset.gateFrameStatus : undefined,
            seed: item instanceof HTMLElement ? item.dataset.seed : undefined,
            seedReadout: item.querySelector(".variation-seed")?.textContent?.trim() ?? "",
            parameterReadout: item.querySelector(".variation-readout")?.textContent?.trim() ?? "",
            density: item instanceof HTMLElement ? item.dataset.density : undefined,
            curvature: item instanceof HTMLElement ? item.dataset.curvature : undefined,
            family: item instanceof HTMLElement ? item.dataset.family : undefined,
            symmetry: item instanceof HTMLElement ? item.dataset.symmetry : undefined,
            peakHeight: item instanceof HTMLElement ? item.dataset.peakHeight : undefined,
            sideComplexity: item instanceof HTMLElement ? item.dataset.sideComplexity : undefined,
            palette: item instanceof HTMLElement ? item.dataset.palette : undefined,
            aspect: item instanceof HTMLElement ? item.dataset.playgroundAspect : undefined,
            overlayCount: overlays.length,
            pathSignature: Array.from(overlay?.querySelectorAll("path") ?? [], (path) =>
              path.getAttribute("d"),
            ).join("|"),
            validGeometry:
              Number.isFinite(width) &&
              width > 0 &&
              Number.isFinite(height) &&
              height > 0 &&
              viewBoxValues.length === 4 &&
              viewBoxValues.every((value) => Number.isFinite(value)) &&
              viewBoxValues[2] === width &&
              viewBoxValues[3] === height,
          };
        }),
      );
    const dispatchRangeInput = (selector, value) =>
      page.locator(selector).evaluate((input, nextValue) => {
        input.value = nextValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    const waitForPlaygroundRender = async (previousPath, expected, allowSaturation = false) => {
      try {
        await page.waitForFunction(
          ({ previousPath: previous, expected: values, allowSaturation: saturated }) => {
            const card = document.querySelector("#courtyard-card");
            const overlay = card?.querySelector(":scope > svg[data-gate-frame-overlay]");
            const path = Array.from(overlay?.querySelectorAll("path") ?? [], (node) =>
              node.getAttribute("d"),
            ).join("|");
            return (
              card instanceof HTMLElement &&
              card.dataset.gateFrameStatus === "ready" &&
              path.length > 0 &&
              (saturated || path !== previous) &&
              (values.seed === undefined ||
                (document.querySelector("#seed-input")?.value === values.seed &&
                  card.dataset.seed === values.seed)) &&
              (values.family === undefined ||
                (document.querySelector("#family-select")?.value === values.family &&
                  card.dataset.family === values.family)) &&
              (values.crest === undefined ||
                document.querySelector("#crest-select")?.value === values.crest) &&
              (values.density === undefined ||
                document.querySelector("#density-output")?.textContent === values.density) &&
              (values.curvature === undefined ||
                document.querySelector("#curvature-output")?.textContent === values.curvature) &&
              (values.symmetry === undefined ||
                document.querySelector("#symmetry-output")?.textContent === values.symmetry) &&
              (values.peakHeight === undefined ||
                document.querySelector("#peak-height-output")?.textContent === values.peakHeight) &&
              (values.sideComplexity === undefined ||
                document.querySelector("#side-complexity-output")?.textContent ===
                  values.sideComplexity) &&
              (values.palette === undefined ||
                document.querySelector("#palette-select")?.value === values.palette) &&
              (values.aspect === undefined ||
                (document.querySelector("#aspect-select")?.value === values.aspect &&
                  card.dataset.canvas === values.aspect))
            );
          },
          { previousPath, expected, allowSaturation },
        );
      } catch (error) {
        const state = await page.evaluate(() => {
          const card = document.querySelector("#courtyard-card");
          const overlay = card?.querySelector(":scope > svg[data-gate-frame-overlay]");
          const style = card instanceof HTMLElement ? getComputedStyle(card) : null;
          return {
            status: card instanceof HTMLElement ? card.dataset.gateFrameStatus : undefined,
            statusText: document.querySelector("#interaction-status")?.textContent,
            seed: document.querySelector("#seed-input")?.value,
            family: document.querySelector("#family-select")?.value,
            crest: document.querySelector("#crest-select")?.value,
            density: document.querySelector("#density-output")?.textContent,
            curvature: document.querySelector("#curvature-output")?.textContent,
            symmetry: document.querySelector("#symmetry-output")?.textContent,
            peakHeight: document.querySelector("#peak-height-output")?.textContent,
            sideComplexity: document.querySelector("#side-complexity-output")?.textContent,
            palette: document.querySelector("#palette-select")?.value,
            box:
              card instanceof HTMLElement && style !== null
                ? {
                    clientWidth: card.clientWidth,
                    clientHeight: card.clientHeight,
                    paddingTop: style.paddingTop,
                    paddingRight: style.paddingRight,
                    paddingBottom: style.paddingBottom,
                    paddingLeft: style.paddingLeft,
                  }
                : null,
            path: Array.from(overlay?.querySelectorAll("path") ?? [], (node) =>
              node.getAttribute("d"),
            ).join("|"),
          };
        });
        throw new Error(
          `playground render did not settle: ${JSON.stringify({ expected, previousPath, state })}`,
          { cause: error },
        );
      }
    };
    const waitForAspectRender = async (previous, aspect) => {
      try {
        await page.waitForFunction(
          ({ previousRender, expectedAspect }) => {
            const card = document.querySelector("#courtyard-card");
            const overlays = card?.querySelectorAll(":scope > svg[data-gate-frame-overlay]") ?? [];
            const overlay = overlays[0];
            const width = Number(overlay?.getAttribute("width"));
            const height = Number(overlay?.getAttribute("height"));
            const viewBox = overlay?.getAttribute("viewBox") ?? "";
            const viewBoxValues = viewBox.split(/\s+/u).map(Number);
            const pathSignature = Array.from(overlay?.querySelectorAll("path") ?? [], (path) =>
              path.getAttribute("d"),
            ).join("|");
            const changedRender =
              width !== previousRender.width ||
              height !== previousRender.height ||
              viewBox !== previousRender.viewBox ||
              pathSignature !== previousRender.pathSignature;
            return (
              card instanceof HTMLElement &&
              document.querySelector("#aspect-select")?.value === expectedAspect &&
              card.dataset.canvas === expectedAspect &&
              card.dataset.gateFrameStatus === "ready" &&
              card.dataset.seed === document.querySelector("#seed-input")?.value &&
              overlays.length === 1 &&
              pathSignature.length > 0 &&
              changedRender &&
              Number.isFinite(width) &&
              width > 0 &&
              Number.isFinite(height) &&
              height > 0 &&
              viewBoxValues.length === 4 &&
              viewBoxValues.every((value) => Number.isFinite(value)) &&
              viewBoxValues[2] === width &&
              viewBoxValues[3] === height &&
              document.documentElement.scrollWidth <= window.innerWidth + 1 &&
              document.body.scrollWidth <= window.innerWidth + 1
            );
          },
          { previousRender: previous, expectedAspect: aspect },
        );
      } catch (error) {
        const state = await readPlaygroundRender();
        throw new Error(
          `aspect render did not settle: ${JSON.stringify({ aspect, previous, state })}`,
          { cause: error },
        );
      }
    };
    const waitForGalleryShuffle = async (previous) => {
      try {
        await page.waitForFunction((previousGallery) => {
          const button = document.querySelector("#shuffle-gallery");
          const cards = Array.from(document.querySelectorAll("[data-variation-card]"));
          return (
            button instanceof HTMLButtonElement &&
            !button.disabled &&
            document.querySelector("#gallery-status")?.textContent ===
              "The six-family collection has twelve new seeds." &&
            cards.length === previousGallery.length &&
            cards.every((item, index) => {
              const previousItem = previousGallery[index];
              const frame = item.querySelector("[data-variation-frame]");
              const overlays =
                frame?.querySelectorAll(":scope > svg[data-gate-frame-overlay]") ?? [];
              const overlay = overlays[0];
              const seed = item instanceof HTMLElement ? item.dataset.seed : undefined;
              const pathSignature = Array.from(overlay?.querySelectorAll("path") ?? [], (path) =>
                path.getAttribute("d"),
              ).join("|");
              const width = Number(overlay?.getAttribute("width"));
              const height = Number(overlay?.getAttribute("height"));
              const viewBoxValues = (overlay?.getAttribute("viewBox") ?? "")
                .split(/\s+/u)
                .map(Number);
              return (
                previousItem !== undefined &&
                item instanceof HTMLElement &&
                item.dataset.gateFrameStatus === "ready" &&
                typeof seed === "string" &&
                seed.length > 0 &&
                seed !== previousItem.seed &&
                item.querySelector(".variation-seed")?.textContent?.trim() === seed &&
                item.querySelector(".variation-readout")?.textContent?.trim() ===
                  previousItem.parameterReadout &&
                overlays.length === 1 &&
                pathSignature.length > 0 &&
                pathSignature !== previousItem.pathSignature &&
                Number.isFinite(width) &&
                width > 0 &&
                Number.isFinite(height) &&
                height > 0 &&
                viewBoxValues.length === 4 &&
                viewBoxValues.every((value) => Number.isFinite(value)) &&
                viewBoxValues[2] === width &&
                viewBoxValues[3] === height
              );
            }) &&
            document.documentElement.scrollWidth <= window.innerWidth + 1 &&
            document.body.scrollWidth <= window.innerWidth + 1
          );
        }, previous);
      } catch (error) {
        const state = await readGalleryState();
        const status = await page.locator("#gallery-status").textContent();
        throw new Error(
          `gallery shuffle did not settle: ${JSON.stringify({ previous, state, status })}`,
          { cause: error },
        );
      }
    };

    const viewportResults = [];
    for (const viewport of exampleViewports) {
      activeViewport = viewport.label;
      const errorStart = browserErrors.length;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(server.url, { waitUntil: "domcontentloaded" });
      assert.equal(
        response?.status(),
        200,
        `${viewport.label} example document did not load successfully`,
      );
      await page.waitForFunction(() => {
        const card = document.querySelector("#courtyard-card");
        return (
          card instanceof HTMLElement &&
          (card.dataset.gateFrameStatus === "ready" || card.dataset.gateFrameStatus === "error")
        );
      });

      const variationCount = await page.locator("[data-variation-card]").count();
      assert.ok(
        variationCount >= 12,
        `${viewport.label} variation showcase must render at least 12 cards; received ${variationCount}`,
      );
      await page.waitForFunction(() => {
        const cards = Array.from(document.querySelectorAll("[data-variation-card]"));
        return cards.every(
          (card) =>
            card instanceof HTMLElement &&
            (card.dataset.gateFrameStatus === "ready" || card.dataset.gateFrameStatus === "error"),
        );
      });
      assert.equal(
        await page.locator('svg[data-gate-frame-generation-version="3"]').count(),
        13,
        `${viewport.label} packed workshop must use generation 3 for every frame`,
      );
      await page.evaluate(
        () =>
          new Promise((resolvePromise) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise())),
          ),
      );

      const mounted = await page.evaluate(() => {
        const card = document.querySelector("#courtyard-card");
        const button = document.querySelector("#visit-button");
        const overlay = card?.querySelector(":scope > svg[data-gate-frame-overlay]");
        if (!(card instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
          throw new Error("example markup is incomplete");
        }
        const style = getComputedStyle(card);
        const gallery = Array.from(document.querySelectorAll("[data-variation-card]"), (item) => {
          const frame = item.querySelector("[data-variation-frame]");
          const itemOverlay = frame?.querySelector(":scope > svg[data-gate-frame-overlay]");
          return {
            status: item instanceof HTMLElement ? item.dataset.gateFrameStatus : undefined,
            seed: item instanceof HTMLElement ? item.dataset.seed : undefined,
            density: item instanceof HTMLElement ? item.dataset.density : undefined,
            curvature: item instanceof HTMLElement ? item.dataset.curvature : undefined,
            family: item instanceof HTMLElement ? item.dataset.family : undefined,
            symmetry: item instanceof HTMLElement ? item.dataset.symmetry : undefined,
            peakHeight: item instanceof HTMLElement ? item.dataset.peakHeight : undefined,
            sideComplexity: item instanceof HTMLElement ? item.dataset.sideComplexity : undefined,
            palette: item instanceof HTMLElement ? item.dataset.palette : undefined,
            aspect: item instanceof HTMLElement ? item.dataset.aspect : undefined,
            visible: item instanceof HTMLElement && item.getClientRects().length > 0,
            overlayCount:
              frame?.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length ?? 0,
            pathSignature: Array.from(itemOverlay?.querySelectorAll("path") ?? [], (path) =>
              path.getAttribute("d"),
            ).join("|"),
            pointerEvents:
              itemOverlay === undefined || itemOverlay === null
                ? null
                : getComputedStyle(itemOverlay).pointerEvents,
            ariaHidden: itemOverlay?.getAttribute("aria-hidden") ?? null,
            focusable: itemOverlay?.getAttribute("focusable") ?? null,
            label: item.querySelector(".variation-label")?.textContent?.trim() ?? "",
            readout: item.querySelector(".variation-readout")?.textContent?.trim() ?? "",
            loadName: item.querySelector(".load-variation")?.textContent?.trim() ?? "",
          };
        });
        const labelledControlIds = [
          "seed-input",
          "family-select",
          "crest-select",
          "density-input",
          "curvature-input",
          "symmetry-input",
          "peak-height-input",
          "side-complexity-input",
          "palette-select",
          "aspect-select",
        ];
        globalThis.__gateFrameWorkshopContent = Array.from(card.children).filter(
          (child) => !child.hasAttribute("data-gate-frame-overlay"),
        );
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          horizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1 ||
            document.body.scrollWidth > window.innerWidth + 1,
          box: {
            borderWidth: card.getBoundingClientRect().width,
            borderHeight: card.getBoundingClientRect().height,
            paddingWidth: card.clientWidth,
            paddingHeight: card.clientHeight,
            paddingTop: Number.parseFloat(style.paddingTop),
            paddingRight: Number.parseFloat(style.paddingRight),
            paddingBottom: Number.parseFloat(style.paddingBottom),
            paddingLeft: Number.parseFloat(style.paddingLeft),
          },
          status: card.dataset.gateFrameStatus,
          statusText: document.querySelector("#interaction-status")?.textContent,
          overlayCount: card.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
          pathCount: overlay?.querySelectorAll("path").length ?? 0,
          pointerEvents:
            overlay === undefined || overlay === null
              ? null
              : getComputedStyle(overlay).pointerEvents,
          ariaHidden: overlay?.getAttribute("aria-hidden") ?? null,
          focusable: overlay?.getAttribute("focusable") ?? null,
          buttonParentPreserved: button.closest("#courtyard-card") === card,
          labelledControls: labelledControlIds.every(
            (id) => document.querySelector(`label[for="${id}"]`) !== null,
          ),
          seedRequired: document.querySelector("#seed-input")?.hasAttribute("required") ?? false,
          gallery,
        };
      });
      const initialPath = await readPlaygroundPath();

      await page.locator("#visit-button").click();
      await page.locator(".actions a").focus();
      const interaction = await page.evaluate(async () => {
        await new Promise((resolvePromise) => requestAnimationFrame(() => resolvePromise()));
        const card = document.querySelector("#courtyard-card");
        const link = document.querySelector(".actions a");
        return {
          interaction: card instanceof HTMLElement ? card.dataset.interaction : undefined,
          status: document.querySelector("#interaction-status")?.textContent,
          linkFocused: link === document.activeElement,
        };
      });

      // Fan ray counts exercise density even on a narrow card where crown curls saturate.
      await page.locator("#family-select").selectOption("fan");
      await waitForPlaygroundRender(initialPath, { family: "fan" });
      const beforeDensity = await readPlaygroundPath();
      await dispatchRangeInput("#density-input", "0.2");
      await waitForPlaygroundRender(beforeDensity, { density: "0.20" });
      const afterDensity = await readPlaygroundPath();

      await dispatchRangeInput("#curvature-input", "0.9");
      await waitForPlaygroundRender(afterDensity, { curvature: "0.90" });
      const afterCurvature = await readPlaygroundPath();
      await page.locator("#family-select").selectOption("courtyard");
      await waitForPlaygroundRender(afterCurvature, { family: "courtyard" });
      const afterFamily = await readPlaygroundPath();
      await page.locator("#crest-select").selectOption("diamond");
      await waitForPlaygroundRender(afterFamily, { crest: "diamond" });
      const afterCrest = await readPlaygroundPath();
      await dispatchRangeInput("#symmetry-input", "0.64");
      await waitForPlaygroundRender(afterCrest, { symmetry: "0.64" });
      const afterSymmetry = await readPlaygroundPath();
      await dispatchRangeInput("#peak-height-input", "0.8");
      // Narrow crowns can reach their slot-height cap. Still require a committed
      // update here, and require visible peak-height changes in the viewport set.
      await waitForPlaygroundRender(afterSymmetry, { peakHeight: "0.80" }, true);
      const afterPeakHeight = await readPlaygroundPath();
      await dispatchRangeInput("#side-complexity-input", "0.9");
      await waitForPlaygroundRender(afterPeakHeight, { sideComplexity: "0.90" });
      const afterSideComplexity = await readPlaygroundPath();
      const beforePalette = await readPlaygroundPaint();
      await page.locator("#palette-select").selectOption("oxblood");
      await page.waitForFunction((previous) => {
        const overlay = document.querySelector("#courtyard-card > svg[data-gate-frame-overlay]");
        const current = {
          stroke: overlay?.querySelector("g")?.getAttribute("stroke") ?? null,
          surface: overlay?.querySelector("path")?.getAttribute("fill") ?? null,
        };
        return (
          document.querySelector("#palette-select")?.value === "oxblood" &&
          current.stroke !== previous.stroke &&
          current.surface !== previous.surface
        );
      }, beforePalette);
      const afterPalette = await readPlaygroundPaint();

      const aspectRenders = [];
      let previousAspectRender = await readPlaygroundRender();
      for (const aspect of ["portrait", "panorama"]) {
        await page.locator("#aspect-select").selectOption(aspect);
        await waitForAspectRender(previousAspectRender, aspect);
        const currentAspectRender = await readPlaygroundRender();
        aspectRenders.push({
          aspect,
          previous: previousAspectRender,
          current: currentAspectRender,
        });
        previousAspectRender = currentAspectRender;
      }

      const beforeManualSeed = await readPlaygroundPath();
      await page.locator("#seed-input").fill("rive-gauche-manual");
      await page.locator("#seed-input").press("Tab");
      await waitForPlaygroundRender(beforeManualSeed, { seed: "rive-gauche-manual" });

      const galleryChoice = page.locator("[data-variation-card]").nth(4);
      const expectedGallery = await galleryChoice.evaluate((item) => ({
        seed: item.dataset.seed,
        family: item.dataset.family,
        density: Number(item.dataset.density).toFixed(2),
        curvature: Number(item.dataset.curvature).toFixed(2),
        symmetry: Number(item.dataset.symmetry).toFixed(2),
        peakHeight: Number(item.dataset.peakHeight).toFixed(2),
        sideComplexity: Number(item.dataset.sideComplexity).toFixed(2),
        palette: item.dataset.palette,
        aspect: item.dataset.playgroundAspect,
      }));
      const beforeGalleryLoad = await readPlaygroundPath();
      await galleryChoice.locator(".load-variation").click();
      await waitForPlaygroundRender(beforeGalleryLoad, expectedGallery);
      const loadedGallery = await page.evaluate(() => ({
        seed: document.querySelector("#seed-input")?.value,
        family: document.querySelector("#family-select")?.value,
        density: document.querySelector("#density-output")?.textContent,
        curvature: document.querySelector("#curvature-output")?.textContent,
        symmetry: document.querySelector("#symmetry-output")?.textContent,
        peakHeight: document.querySelector("#peak-height-output")?.textContent,
        sideComplexity: document.querySelector("#side-complexity-output")?.textContent,
        palette: document.querySelector("#palette-select")?.value,
        aspect: document.querySelector("#aspect-select")?.value,
      }));

      const galleryBeforeShuffle = await readGalleryState();
      await page.locator("#shuffle-gallery").click();
      await waitForGalleryShuffle(galleryBeforeShuffle);
      const shuffledGallery = await readGalleryState();

      const shuffledChoice = page.locator("[data-variation-card]").nth(1);
      const expectedShuffledGallery = await shuffledChoice.evaluate((item) => ({
        seed: item.dataset.seed,
        family: item.dataset.family,
        density: Number(item.dataset.density).toFixed(2),
        curvature: Number(item.dataset.curvature).toFixed(2),
        symmetry: Number(item.dataset.symmetry).toFixed(2),
        peakHeight: Number(item.dataset.peakHeight).toFixed(2),
        sideComplexity: Number(item.dataset.sideComplexity).toFixed(2),
        palette: item.dataset.palette,
        aspect: item.dataset.playgroundAspect,
      }));
      const controlsBeforeShuffledLoad = await readPlaygroundControlState();
      await shuffledChoice.locator(".load-variation").click();
      await waitForPlaygroundRender(
        controlsBeforeShuffledLoad.pathSignature,
        expectedShuffledGallery,
      );
      const loadedShuffledGallery = await readPlaygroundControlState();
      const loadedShuffledRender = await readPlaygroundRender();

      const seedBeforeRandomize = await page.locator("#seed-input").inputValue();
      const pathBeforeRandomize = await readPlaygroundPath();
      await page.locator("#randomize-button").click();
      await page.waitForFunction(
        ({ previousSeed, previousPath }) => {
          const seed = document.querySelector("#seed-input")?.value;
          const overlay = document.querySelector("#courtyard-card > svg[data-gate-frame-overlay]");
          const path = Array.from(overlay?.querySelectorAll("path") ?? [], (node) =>
            node.getAttribute("d"),
          ).join("|");
          return seed !== undefined && seed !== previousSeed && path !== previousPath;
        },
        { previousSeed: seedBeforeRandomize, previousPath: pathBeforeRandomize },
      );
      const randomized = {
        seed: await page.locator("#seed-input").inputValue(),
        path: await readPlaygroundPath(),
      };

      await page.locator("#reset-button").click();
      await waitForPlaygroundRender(randomized.path, {
        seed: "family-workshop-example",
        family: "courtyard",
        crest: "",
        density: "0.58",
        curvature: "0.72",
        symmetry: "1.00",
        peakHeight: "0.35",
        sideComplexity: "0.50",
        palette: "limestone",
        aspect: "standard",
      });
      const resetPath = await readPlaygroundPath();
      const resetPaint = await readPlaygroundPaint();

      const issues = [];
      if (
        mounted.viewport.width !== viewport.width ||
        mounted.viewport.height !== viewport.height
      ) {
        issues.push(
          `viewport was ${mounted.viewport.width}x${mounted.viewport.height}, expected ${viewport.width}x${viewport.height}`,
        );
      }
      if (mounted.horizontalOverflow) {
        issues.push("document has horizontal overflow");
      }
      if (mounted.status !== "ready") {
        const errorCode =
          mounted.statusText === "Gate Frame requires more existing target padding"
            ? "INSUFFICIENT_CONTENT_SPACE"
            : "UNKNOWN";
        issues.push(
          `${errorCode}: ${mounted.statusText ?? `status ${mounted.status}`} (${JSON.stringify(mounted.box)})`,
        );
      }
      if (mounted.overlayCount !== 1) {
        issues.push(
          `playground overlay count was ${mounted.overlayCount}, expected 1 (${JSON.stringify({ box: mounted.box, statusText: mounted.statusText })})`,
        );
      }
      if (mounted.pathCount <= 0) {
        issues.push("playground overlay did not contain generated paths");
      }
      if (mounted.pointerEvents !== "none") {
        issues.push(
          `playground overlay pointer-events was ${mounted.pointerEvents}, expected none`,
        );
      }
      if (mounted.ariaHidden !== "true" || mounted.focusable !== "false") {
        issues.push("playground overlay accessibility attributes were incorrect");
      }
      if (!mounted.buttonParentPreserved) {
        issues.push("button parent was not preserved");
      }
      if (!mounted.labelledControls || !mounted.seedRequired) {
        issues.push("playground controls are not all explicitly labelled and seed-required");
      }
      if (
        interaction.interaction !== "clicked" ||
        interaction.status !== "Content interaction received." ||
        !interaction.linkFocused
      ) {
        issues.push(`content interaction or focus failed: ${JSON.stringify(interaction)}`);
      }
      if (
        mounted.gallery.some(
          (item) =>
            item.status !== "ready" ||
            !item.visible ||
            item.overlayCount !== 1 ||
            item.pathSignature.length === 0 ||
            item.pointerEvents !== "none" ||
            item.ariaHidden !== "true" ||
            item.focusable !== "false" ||
            item.label.length === 0 ||
            item.readout.length === 0 ||
            item.loadName.length === 0,
        )
      ) {
        issues.push(
          `variation cards are not all ready and usable: ${JSON.stringify(mounted.gallery)}`,
        );
      }
      if (new Set(mounted.gallery.map(({ pathSignature }) => pathSignature)).size < 6) {
        issues.push("variation gallery has fewer than six distinct path signatures");
      }
      if (
        JSON.stringify([...new Set(mounted.gallery.map(({ family }) => family))].sort()) !==
        JSON.stringify(["arcade", "courtyard", "fan", "fleuron", "vine", "volute"])
      ) {
        issues.push("variation gallery does not cover each of the six approved families");
      }
      for (const [field, minimum] of [
        ["seed", 12],
        ["density", 6],
        ["curvature", 6],
        ["palette", 4],
        ["aspect", 3],
      ]) {
        if (new Set(mounted.gallery.map((item) => item[field])).size < minimum) {
          issues.push(`variation gallery does not meaningfully vary ${field}`);
        }
      }
      if (afterDensity === beforeDensity) {
        issues.push("density control did not alter playground path data");
      }
      for (const [control, before, after] of [
        ["family", afterCurvature, afterFamily],
        ["crest", afterFamily, afterCrest],
        ["symmetry", afterCrest, afterSymmetry],
        ["sideComplexity", afterPeakHeight, afterSideComplexity],
      ]) {
        if (before === after) {
          issues.push(`${control} control did not alter committed playground geometry`);
        }
      }
      if (
        beforePalette.stroke === afterPalette.stroke ||
        beforePalette.surface === afterPalette.surface
      ) {
        issues.push("palette control did not alter rendered paint attributes");
      }
      const invalidAspectRenders = aspectRenders.filter(({ aspect, previous, current }) => {
        const renderChanged =
          current.width !== previous.width ||
          current.height !== previous.height ||
          current.viewBox !== previous.viewBox ||
          current.pathSignature !== previous.pathSignature;
        return (
          current.aspect !== aspect ||
          current.canvas !== aspect ||
          current.status !== "ready" ||
          current.overlayCount !== 1 ||
          current.pathSignature.length === 0 ||
          !current.validGeometry ||
          current.horizontalOverflow ||
          !renderChanged
        );
      });
      if (aspectRenders.length !== 2 || invalidAspectRenders.length > 0) {
        issues.push(
          `non-default aspect controls did not commit valid changed renders: ${JSON.stringify(invalidAspectRenders)}`,
        );
      }
      if (JSON.stringify(loadedGallery) !== JSON.stringify(expectedGallery)) {
        issues.push(
          `gallery load did not synchronize playground controls: ${JSON.stringify({ expectedGallery, loadedGallery })}`,
        );
      }
      const galleryStateSummary = (items) =>
        items.map(({ pathSignature, ...item }) => ({
          ...item,
          pathLength: pathSignature.length,
        }));
      if (galleryBeforeShuffle.length !== 12 || shuffledGallery.length !== 12) {
        issues.push(
          `shuffle must cover exactly twelve packed-example cards: ${JSON.stringify({ before: galleryBeforeShuffle.length, after: shuffledGallery.length })}`,
        );
      } else {
        const invalidShuffleIndexes = galleryBeforeShuffle.flatMap((before, index) => {
          const after = shuffledGallery[index];
          const staticControlsPreserved = [
            "family",
            "density",
            "curvature",
            "symmetry",
            "peakHeight",
            "sideComplexity",
            "palette",
            "aspect",
          ].every((field) => after?.[field] === before[field]);
          return before.status === "ready" &&
            before.seed !== undefined &&
            before.seed.length > 0 &&
            before.seedReadout === before.seed &&
            before.overlayCount === 1 &&
            before.pathSignature.length > 0 &&
            before.validGeometry &&
            after?.status === "ready" &&
            after.seed !== undefined &&
            after.seed.length > 0 &&
            after.seed !== before.seed &&
            after.seedReadout === after.seed &&
            after.parameterReadout === before.parameterReadout &&
            staticControlsPreserved &&
            after.overlayCount === 1 &&
            after.pathSignature.length > 0 &&
            after.pathSignature !== before.pathSignature &&
            after.validGeometry
            ? []
            : [index];
        });
        if (invalidShuffleIndexes.length > 0) {
          issues.push(
            `shuffle did not replace every card seed and valid render in place: ${JSON.stringify({ invalidShuffleIndexes, before: galleryStateSummary(galleryBeforeShuffle), after: galleryStateSummary(shuffledGallery) })}`,
          );
        }
      }
      const vacuousShuffledControlFields = [
        "family",
        "density",
        "curvature",
        "symmetry",
        "peakHeight",
        "sideComplexity",
        "palette",
        "aspect",
      ].filter((field) => controlsBeforeShuffledLoad[field] === expectedShuffledGallery[field]);
      if (vacuousShuffledControlFields.length > 0) {
        issues.push(
          `shuffled gallery load did not exercise changed controls: ${vacuousShuffledControlFields.join(", ")}`,
        );
      }
      if (
        loadedShuffledGallery.seed !== expectedShuffledGallery.seed ||
        loadedShuffledGallery.renderedSeed !== expectedShuffledGallery.seed ||
        loadedShuffledGallery.family !== expectedShuffledGallery.family ||
        loadedShuffledGallery.effectiveFamily !== expectedShuffledGallery.family ||
        loadedShuffledGallery.density !== expectedShuffledGallery.density ||
        loadedShuffledGallery.densityReadout !== expectedShuffledGallery.density ||
        loadedShuffledGallery.curvature !== expectedShuffledGallery.curvature ||
        loadedShuffledGallery.curvatureReadout !== expectedShuffledGallery.curvature ||
        loadedShuffledGallery.symmetry !== expectedShuffledGallery.symmetry ||
        loadedShuffledGallery.symmetryReadout !== expectedShuffledGallery.symmetry ||
        loadedShuffledGallery.peakHeight !== expectedShuffledGallery.peakHeight ||
        loadedShuffledGallery.peakHeightReadout !== expectedShuffledGallery.peakHeight ||
        loadedShuffledGallery.sideComplexity !== expectedShuffledGallery.sideComplexity ||
        loadedShuffledGallery.sideComplexityReadout !== expectedShuffledGallery.sideComplexity ||
        loadedShuffledGallery.palette !== expectedShuffledGallery.palette ||
        loadedShuffledGallery.aspect !== expectedShuffledGallery.aspect ||
        loadedShuffledGallery.canvas !== expectedShuffledGallery.aspect ||
        loadedShuffledGallery.status !== "ready" ||
        loadedShuffledGallery.overlayCount !== 1 ||
        loadedShuffledGallery.pathSignature.length === 0 ||
        loadedShuffledGallery.pathSignature === controlsBeforeShuffledLoad.pathSignature ||
        loadedShuffledGallery.horizontalOverflow ||
        !loadedShuffledRender.validGeometry
      ) {
        issues.push(
          `shuffled gallery card did not synchronize a valid playground render: ${JSON.stringify({ expectedShuffledGallery, controlsBeforeShuffledLoad, loadedShuffledGallery, loadedShuffledRender })}`,
        );
      }
      if (randomized.seed === seedBeforeRandomize || randomized.path === pathBeforeRandomize) {
        issues.push("randomize did not change the playground seed and render");
      }
      if (resetPath !== initialPath) {
        issues.push("reset did not reproduce the initial deterministic geometry bytes");
      }
      if (resetPaint.stroke !== "#20221e" || resetPaint.surface !== "rgba(143, 119, 79, 0.12)") {
        issues.push(`reset did not restore canonical paint: ${JSON.stringify(resetPaint)}`);
      }
      const finalState = await page.evaluate(() => ({
        overlayCount: document.querySelectorAll("#courtyard-card > svg[data-gate-frame-overlay]")
          .length,
        contentIdentityPreserved: (() => {
          const card = document.querySelector("#courtyard-card");
          const original = globalThis.__gateFrameWorkshopContent;
          const current =
            card instanceof HTMLElement
              ? Array.from(card.children).filter(
                  (child) => !child.hasAttribute("data-gate-frame-overlay"),
                )
              : [];
          return (
            Array.isArray(original) &&
            current.length === original.length &&
            original.every((child, index) => current[index] === child)
          );
        })(),
        horizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth + 1 ||
          document.body.scrollWidth > window.innerWidth + 1,
      }));
      if (
        finalState.overlayCount !== 1 ||
        !finalState.contentIdentityPreserved ||
        finalState.horizontalOverflow
      ) {
        issues.push(`final playground state is invalid: ${JSON.stringify(finalState)}`);
      }
      const cleanupState = await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
        return {
          playgroundOverlays: document.querySelectorAll(
            "#courtyard-card > svg[data-gate-frame-overlay]",
          ).length,
          galleryOverlays: document.querySelectorAll(
            "[data-variation-frame] > svg[data-gate-frame-overlay]",
          ).length,
        };
      });
      if (cleanupState.playgroundOverlays !== 0 || cleanupState.galleryOverlays !== 0) {
        issues.push(`pagehide cleanup left owned overlays: ${JSON.stringify(cleanupState)}`);
      }
      const errors = browserErrors.slice(errorStart).map(({ message }) => message);
      if (errors.length > 0) {
        issues.push(`browser errors: ${errors.join("; ")}`);
      }
      viewportResults.push({
        ...viewport,
        peakHeightChanged: afterSymmetry !== afterPeakHeight,
        issues,
      });
    }

    const failures = viewportResults.filter(({ issues }) => issues.length > 0);
    assert.ok(
      viewportResults.some(({ peakHeightChanged }) => peakHeightChanged),
      "peak height must alter committed geometry in at least one supported workshop viewport",
    );
    assert.deepEqual(
      failures,
      [],
      `example viewport failures:\n${JSON.stringify(failures, null, 2)}`,
    );
    return viewportResults.map(({ label, width, height }) => ({
      label,
      width,
      height,
      status: "passed",
    }));
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
};

const extractBuildOutputs = (buildResult) => {
  const results = Array.isArray(buildResult) ? buildResult : [buildResult];
  return results.flatMap((result) => result.output ?? []);
};

const measureBundle = async (consumerRoot, specifier, name) => {
  const entryRoot = join(consumerRoot, "bundle-entries");
  await mkdir(entryRoot, { recursive: true });
  const entryPath = join(entryRoot, `${name}.js`);
  await writeFile(entryPath, `export * from ${JSON.stringify(specifier)};\n`);
  const result = await viteBuild({
    configFile: false,
    root: consumerRoot,
    logLevel: "silent",
    build: {
      target: "es2022",
      minify: true,
      sourcemap: false,
      write: false,
      rollupOptions: {
        // ES library mode retains whitespace. Measure a fully minified consumer
        // bundle while retaining every public export, including unused ones.
        input: entryPath,
        preserveEntrySignatures: "strict",
        output: {
          format: "es",
          entryFileNames: `${name}.js`,
        },
      },
    },
  });
  const chunks = extractBuildOutputs(result).filter((output) => output.type === "chunk");
  assert.equal(chunks.length, 1, `${name} bundle must be a single self-contained chunk`);
  const chunk = chunks[0];
  const installedEntry = join(
    consumerRoot,
    "node_modules",
    "card-gate-frame",
    "dist",
    specifier === "card-gate-frame/core" ? "core/index.js" : "index.js",
  );
  const installedExports = Object.keys(await import(pathToFileURL(installedEntry).href)).sort();
  assert.deepEqual(
    [...chunk.exports].sort(),
    installedExports,
    `${name} bundle lost public exports`,
  );
  assert.deepEqual(chunk.imports, [], `${name} bundle must not retain imports`);
  assert.ok(!chunk.code.includes(repositoryRoot), `${name} bundle references repository source`);
  assert.ok(
    !/from\s*["']card-gate-frame(?:\/core)?["']/u.test(chunk.code),
    `${name} was not bundled`,
  );
  return gzipSync(Buffer.from(chunk.code), { level: 9 }).byteLength;
};

const benchmarkInstalledCore = async (installedRoot) => {
  const coreModulePath = join(installedRoot, "dist", "core", "index.js");
  const core = await import(`${pathToFileURL(coreModulePath).href}?benchmark=1`);
  assert.equal(typeof core.generateGate, "function");
  const dimensions = Object.freeze({ width: 600, height: 360 });
  const warmupRuns = 200;
  const runs = 1_000;
  const families = ["courtyard", "fleuron", "arcade", "vine", "fan", "volute"];
  for (let index = 0; index < warmupRuns; index += 1) {
    core.generateGate(dimensions, {
      generationVersion: 2,
      seed: `warmup-${index}`,
      family: families[index % families.length],
    });
  }

  const measure = (generate) => {
    const samples = [];
    for (let index = 0; index < runs; index += 1) {
      const start = performance.now();
      generate(index);
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    return samples[Math.ceil(samples.length * 0.95) - 1];
  };
  const v1P95 = measure((index) =>
    core.generateGate(dimensions, { seed: `benchmark-v1-${index}`, family: "courtyard" }),
  );
  const v2P95 = measure((index) =>
    core.generateGate(dimensions, {
      generationVersion: 2,
      seed: `benchmark-v2-${index}`,
      family: families[index % families.length],
    }),
  );
  const v3P95 = measure((index) =>
    core.generateGate(dimensions, {
      generationVersion: 3,
      seed: `benchmark-v3-${index}`,
      family: families[index % families.length],
    }),
  );
  assert.ok(Number.isFinite(v1P95) && v1P95 < 4, `v1 core generation p95 ${v1P95}ms exceeds 4ms`);
  assert.ok(Number.isFinite(v2P95) && v2P95 < 4, `v2 core generation p95 ${v2P95}ms exceeds 4ms`);
  assert.ok(Number.isFinite(v3P95) && v3P95 < 4, `v3 core generation p95 ${v3P95}ms exceeds 4ms`);
  return {
    dimensions: "600x360",
    warmupRuns,
    runs,
    p95Milliseconds: {
      v1: Number(v1P95.toFixed(4)),
      v2SixFamily: Number(v2P95.toFixed(4)),
      v3SixFamily: Number(v3P95.toFixed(4)),
    },
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
    },
  };
};

const main = async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "gate-frame-package-"));
  let summary;
  try {
    const sourceManifest = await readJson(packageJsonPath);
    assertNoRuntimeDependencies(sourceManifest);
    assertNoUnderminingLifecycle(sourceManifest, true);
    assert.equal(sourceManifest.private, undefined);
    assert.equal(sourceManifest.version, "1.0.0");
    assert.equal(sourceManifest.devDependencies.vite, expectedToolVersions.vite);
    assert.equal(sourceManifest.devDependencies.publint, expectedToolVersions.publint);
    assert.equal(
      sourceManifest.devDependencies["@arethetypeswrong/cli"],
      expectedToolVersions.attw,
    );
    assert.equal(sourceManifest.devDependencies.typescript, expectedToolVersions.typescript);
    assert.equal(sourceManifest.devDependencies.tsdown, expectedToolVersions.tsdown);
    assert.equal(
      sourceManifest.devDependencies["@playwright/test"],
      expectedToolVersions.playwright,
    );

    const installedToolManifests = {
      vite: await readJson(join(repositoryRoot, "node_modules", "vite", "package.json")),
      publint: await readJson(join(repositoryRoot, "node_modules", "publint", "package.json")),
      attw: await readJson(
        join(repositoryRoot, "node_modules", "@arethetypeswrong", "cli", "package.json"),
      ),
      typescript: await readJson(
        join(repositoryRoot, "node_modules", "typescript", "package.json"),
      ),
      tsdown: await readJson(join(repositoryRoot, "node_modules", "tsdown", "package.json")),
      playwright: await readJson(
        join(repositoryRoot, "node_modules", "@playwright", "test", "package.json"),
      ),
    };
    for (const [tool, version] of Object.entries(expectedToolVersions)) {
      assert.equal(
        installedToolManifests[tool].version,
        version,
        `${tool} installed version mismatch`,
      );
    }

    const buildRoot = join(tempRoot, "build");
    const packRoot = join(tempRoot, "pack");
    await copyBuildWorkspace(buildRoot);
    await mkdir(packRoot, { recursive: true });
    const toolPath = join(repositoryRoot, "node_modules", ".bin");
    await run("pnpm", ["run", "build"], {
      cwd: buildRoot,
      env: { PATH: `${toolPath}${delimiter}${process.env.PATH ?? ""}` },
    });
    await run("pnpm", ["pack", "--pack-destination", packRoot], { cwd: buildRoot });

    const packedNames = (await readdir(packRoot)).filter((name) => name.endsWith(".tgz"));
    assert.deepEqual(packedNames, ["card-gate-frame-1.0.0.tgz"]);
    const tarballPath = join(packRoot, packedNames[0]);
    const tarballBytes = await readFile(tarballPath);
    const tarballStats = await stat(tarballPath);
    const entries = parseTarball(tarballBytes);
    const fileEntries = entries.filter((entry) => entry.type === "file");
    const archiveFiles = validateArchiveManifest(fileEntries);
    const packageEntry = fileEntries.find((entry) => entry.name === "package/package.json");
    assert.ok(packageEntry, "packed package.json is missing");
    const packedManifest = JSON.parse(packageEntry.data.toString("utf8"));
    validatePackedManifest(packedManifest, sourceManifest);

    const extractedRoot = join(tempRoot, "extracted");
    await extractArchive(entries, extractedRoot);
    assert.deepEqual(await listFiles(extractedRoot), archiveFiles);

    const publintCli = join(repositoryRoot, "node_modules", "publint", "src", "cli.js");
    const attwCli = join(
      repositoryRoot,
      "node_modules",
      "@arethetypeswrong",
      "cli",
      "dist",
      "index.js",
    );
    await run(process.execPath, [publintCli, "run", tarballPath, "--strict"], {
      cwd: tempRoot,
    });
    await run(
      process.execPath,
      [
        attwCli,
        tarballPath,
        "--profile",
        "esm-only",
        "--no-definitely-typed",
        "--format",
        "json",
        "--no-color",
        "--no-emoji",
      ],
      { cwd: tempRoot },
    );

    const consumerRoot = join(tempRoot, "consumer");
    await mkdir(consumerRoot, { recursive: true });
    const consumerManifest = {
      name: "gate-frame-packed-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: {
        "card-gate-frame": `file:${tarballPath}`,
      },
    };
    await writeFile(
      join(consumerRoot, "package.json"),
      `${JSON.stringify(consumerManifest, null, 2)}\n`,
    );
    assert.deepEqual(Object.keys(consumerManifest.dependencies), ["card-gate-frame"]);
    await run(
      "pnpm",
      ["install", "--offline", "--ignore-scripts", "--config.auto-install-peers=false"],
      { cwd: consumerRoot },
    );

    const installedLink = join(consumerRoot, "node_modules", "card-gate-frame");
    const installedRoot = await realpath(installedLink);
    const canonicalConsumerRoot = await realpath(consumerRoot);
    assert.ok(
      installedRoot.startsWith(`${canonicalConsumerRoot}${sep}`),
      "installed package escaped consumer",
    );
    assert.ok(
      !installedRoot.startsWith(`${repositoryRoot}${sep}`),
      "consumer resolved repository source",
    );
    assert.deepEqual(await listFiles(installedRoot), archiveFiles);
    for (const entry of fileEntries) {
      const packagePath = assertSafeArchivePath(entry.name);
      assert.equal(
        sha256(await readFile(join(installedRoot, packagePath))),
        sha256(entry.data),
        `installed artifact differs from tarball: ${packagePath}`,
      );
    }

    await writeConsumerFixtures(consumerRoot);
    const typescriptCli = join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
    await run(process.execPath, [typescriptCli, "-p", "fixtures/tsconfig.root.json"], {
      cwd: consumerRoot,
    });
    await run(process.execPath, [typescriptCli, "-p", "fixtures/tsconfig.core.json"], {
      cwd: consumerRoot,
    });

    await writeRuntimeConsumer(consumerRoot);
    const runtimeResult = await run(process.execPath, ["runtime.mjs"], { cwd: consumerRoot });
    const runtime = JSON.parse(runtimeResult.stdout);
    const installedUrl = `${pathToFileURL(installedRoot).href}/`;
    assert.ok(runtime.resolvedRoot.startsWith(installedUrl));
    assert.ok(runtime.resolvedCore.startsWith(installedUrl));
    assert.ok(runtime.resolvedRoot.endsWith("/dist/index.js"));
    assert.ok(runtime.resolvedCore.endsWith("/dist/core/index.js"));
    assert.deepEqual(
      {
        gateFrameType: runtime.gateFrameType,
        v1: runtime.v1,
        v2: runtime.v2,
        v3: runtime.v3,
        svgStartsWith: runtime.svgStartsWith,
        svgIncludesPath: runtime.svgIncludesPath,
      },
      {
        gateFrameType: "function",
        v1: { version: 1, family: "courtyard", seed: "packed-runtime-v1" },
        v2: { version: 2, family: "fan", seed: "packed-runtime-v2" },
        v3: {
          version: 3,
          family: "fleuron",
          seed: "packed-runtime-v3",
          crest: "fleur",
          filled: true,
        },
        svgStartsWith: true,
        svgIncludesPath: true,
      },
    );

    const exampleRoot = await copyExample(consumerRoot);
    const exampleDistRoot = join(consumerRoot, "example-dist");
    const viteCli = join(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
    await run(
      process.execPath,
      [
        viteCli,
        "build",
        exampleRoot,
        "--outDir",
        exampleDistRoot,
        "--emptyOutDir",
        "--logLevel",
        "silent",
      ],
      { cwd: consumerRoot },
    );
    assert.ok((await listFiles(exampleDistRoot)).includes("index.html"));
    const chromiumExampleViewports = await verifyExampleInChromium(exampleDistRoot);

    const rootGzipBytes = await measureBundle(consumerRoot, "card-gate-frame", "root");
    const coreGzipBytes = await measureBundle(consumerRoot, "card-gate-frame/core", "core");
    assert.ok(coreGzipBytes <= 10 * 1024, `core gzip ${coreGzipBytes} exceeds 10 KiB`);
    assert.ok(rootGzipBytes <= 15 * 1024, `root gzip ${rootGzipBytes} exceeds 15 KiB`);
    const benchmark = await benchmarkInstalledCore(installedRoot);

    if (process.env.GATE_FRAME_RELEASE_DIR) {
      const releaseRoot = resolve(process.env.GATE_FRAME_RELEASE_DIR);
      await mkdir(releaseRoot, { recursive: true });
      await copyFile(tarballPath, join(releaseRoot, basename(tarballPath)));
    }

    summary = {
      tarball: {
        filename: basename(tarballPath),
        bytes: tarballStats.size,
        sha256: sha256(tarballBytes),
        archiveFileCount: archiveFiles.length,
      },
      tools: {
        publint: { version: expectedToolVersions.publint, status: "passed" },
        attw: { version: expectedToolVersions.attw, status: "passed" },
        vite: { version: expectedToolVersions.vite },
        typescript: { version: expectedToolVersions.typescript },
        tsdown: { version: expectedToolVersions.tsdown },
        playwright: { version: expectedToolVersions.playwright },
      },
      consumer: {
        install: "passed",
        rootResolution: relative(installedRoot, fileURLToPath(runtime.resolvedRoot)),
        coreResolution: relative(installedRoot, fileURLToPath(runtime.resolvedCore)),
        rootTypecheck: "passed",
        coreWithoutDomTypecheck: "passed",
        esmRuntime: "passed",
        chromiumExample: {
          status: "passed",
          viewports: chromiumExampleViewports,
        },
      },
      gzipBytes: {
        root: rootGzipBytes,
        core: coreGzipBytes,
      },
      benchmark,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  process.stdout.write(`${JSON.stringify(summary)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
