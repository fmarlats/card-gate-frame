import { expect, test } from "@playwright/test";
import type { GateFrameController } from "../../src/index.js";

declare global {
  interface Window {
    v3Controller: GateFrameController;
  }
}

test("uses production v3 throughout the vanilla workshop", async ({ page }) => {
  await page.goto("/examples/vanilla/");
  await expect(page.locator("[data-gate-frame-overlay]")).toHaveCount(13);
  await expect(page.locator('[data-gate-frame-generation-version="3"]')).toHaveCount(13);
  await page.locator("#family-select").selectOption("fleuron");
  const card = page.locator("#courtyard-card");
  await expect(card).toHaveAttribute("data-family", "fleuron");
  await expect(card).toHaveAttribute("data-crest", "fleur");
  const contourFills = await card
    .locator('g[stroke-width="1.2"] > path')
    .evaluateAll((paths) =>
      paths
        .filter(
          (path) => path.getAttribute("d")?.includes("C") && path.getAttribute("d")?.endsWith("Z"),
        )
        .map((path) => getComputedStyle(path).fill),
    );
  expect(contourFills).toEqual(["none", "none"]);
});

test("resizes v3 and replays its randomized export through the core", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");
  await page.evaluate(async () => {
    const { gateFrame } = window.gateFramePackage as unknown as typeof import("../../src/index.js");
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("Missing target");
    window.v3Controller = gateFrame(target, { generationVersion: 3, family: "auto", seed: 42 });
    await window.v3Controller.whenReady();
    target.style.width = "420px";
    target.style.height = "310px";
  });
  await expect
    .poll(() => page.evaluate(() => window.v3Controller.snapshot()?.geometry.dimensions.width))
    .toBe(418);
  const result = await page.evaluate(async () => {
    const corePath = "/dist/core/index.js";
    const { generateGate, renderGateSVG } = (await import(
      corePath
    )) as typeof import("../../src/core/index.js");
    const controller = window.v3Controller;
    const seed = controller.randomize();
    const snapshot = await controller.whenReady();
    if (snapshot.generationVersion !== 3) throw new Error("Expected generation 3");
    const { inset: _inset, strokeWidth: _strokeWidth, ...options } = snapshot.geometry.options;
    const expected = renderGateSVG(
      generateGate({ width: 418, height: 308 }, { ...options, seed }),
      snapshot.paint,
    );
    const matches = controller.toSVG() === expected;
    controller.update({ stroke: "#7a352d", family: "vine", crest: "fleur" });
    await controller.whenReady();
    const filled = document.querySelector('g[stroke-width="0.8"]')?.getAttribute("fill");
    const count = document.querySelectorAll("[data-gate-frame-overlay]").length;
    controller.destroy();
    return { matches, filled, count, seedType: typeof seed };
  });
  expect(result).toEqual({ matches: true, filled: "#7a352d", count: 1, seedType: "string" });
});

test("carries shared controls between v2 and v3 and rejects invalid switches atomically", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");
  const result = await page.evaluate(async () => {
    const { gateFrame } = window.gateFramePackage as unknown as typeof import("../../src/index.js");
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("Missing target");
    const controller = gateFrame(target, {
      generationVersion: 2,
      seed: "switch",
      family: "vine",
      symmetry: 0.4,
      peakHeight: 0.8,
      sideComplexity: 0.9,
      crest: "none",
    });
    await controller.whenReady();
    controller.update({ generationVersion: 3 });
    const v3 = await controller.whenReady();
    const prior = controller.toSVG();
    const overlay = target.querySelector("svg");
    let code = "";
    try {
      controller.update({ generationVersion: 1 });
    } catch (error) {
      code = (error as { code: string }).code;
    }
    const atomic = prior === controller.toSVG() && overlay === target.querySelector("svg");
    controller.update({ generationVersion: 2 });
    const v2 = await controller.whenReady();
    controller.update({ generationVersion: 1, family: "courtyard" });
    const v1 = await controller.whenReady();
    controller.destroy();
    return {
      v3: v3.geometry.options,
      v2: v2.geometry.options,
      v1: v1.generationVersion,
      code,
      atomic,
    };
  });
  expect(result.v3).toMatchObject({
    generationVersion: 3,
    symmetry: 0.4,
    peakHeight: 0.8,
    sideComplexity: 0.9,
    crest: "none",
  });
  expect(result.v2).toMatchObject({
    generationVersion: 2,
    symmetry: 0.4,
    peakHeight: 0.8,
    sideComplexity: 0.9,
    crest: "none",
  });
  expect(result).toMatchObject({ v1: 1, code: "INVALID_OPTIONS", atomic: true });
});

test("mounts, exports and destroys production v3 without moving content", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");
  const result = await page.evaluate(async () => {
    const { gateFrame } = window.gateFramePackage as unknown as typeof import("../../src/index.js");
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("Missing target");
    const children = Array.from(target.children);
    const controller = gateFrame(target, {
      generationVersion: 3,
      seed: "production-v3",
      family: "fleuron",
      stroke: "#31534b",
    });
    const snapshot = await controller.whenReady();
    const svg = controller.toSVG();
    const overlay = target.querySelector("svg");
    const version = overlay?.getAttribute("data-gate-frame-generation-version");
    const solidPaint = overlay?.querySelector('g[stroke-width="0.8"]')?.getAttribute("fill");
    const fleurContours = Array.from(
      overlay?.querySelectorAll('g[stroke-width="1.2"] > path') ?? [],
    ).filter(
      (path) => path.getAttribute("d")?.includes("C") && path.getAttribute("d")?.endsWith("Z"),
    );
    const contourPaint = fleurContours.map((path) => ({
      fill: getComputedStyle(path).fill,
      stroke: getComputedStyle(path).stroke,
    }));
    const contentPreserved = children.every((child, index) => target.children[index] === child);
    controller.destroy();
    return {
      snapshotVersion: snapshot.generationVersion,
      version,
      solidPaint,
      contourPaint,
      contentPreserved,
      exported: svg.includes('data-gate-frame-generation-version="3"'),
      remaining: target.querySelectorAll("svg").length,
    };
  });
  expect(result).toEqual({
    snapshotVersion: 3,
    version: "3",
    solidPaint: "#31534b",
    contourPaint: [
      { fill: "none", stroke: "rgb(49, 83, 75)" },
      { fill: "none", stroke: "rgb(49, 83, 75)" },
    ],
    contentPreserved: true,
    exported: true,
    remaining: 0,
  });
});
