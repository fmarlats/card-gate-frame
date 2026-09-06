import { expect, test } from "@playwright/test";

interface BrowserGateSnapshot {
  readonly seed: string | number;
  readonly generationVersion: 1 | 2;
  readonly geometry: {
    readonly seed: string | number;
    readonly dimensions: { readonly width: number; readonly height: number };
    readonly options: {
      readonly family: "courtyard" | "fleuron" | "arcade" | "vine" | "fan" | "volute";
      readonly density: number;
      readonly curvature: number;
    };
  };
  readonly paint: { readonly stroke: string; readonly surface: string };
}

interface BrowserGateOptions {
  readonly seed?: string | number;
  readonly generationVersion?: 1 | 2;
  readonly family?: "courtyard" | "fleuron" | "arcade" | "vine" | "fan" | "volute" | "auto";
  readonly density?: number;
  readonly curvature?: number;
  readonly symmetry?: number;
  readonly peakHeight?: number;
  readonly sideComplexity?: number;
  readonly crest?: "spear" | "fleur" | "diamond" | "none";
  readonly stroke?: string;
  readonly surface?: string;
  readonly responsive?: boolean;
}

interface BrowserGateFrameController {
  status(): { readonly state: string; readonly snapshot?: BrowserGateSnapshot };
  whenReady(): Promise<BrowserGateSnapshot>;
  snapshot(): BrowserGateSnapshot | null;
  update(options: Partial<BrowserGateOptions>): BrowserGateFrameController;
  randomize(seed?: string | number): string | number;
  toSVG(): string;
  destroy(): void;
}

declare global {
  interface Window {
    gateFramePackage: {
      gateFrame(target: HTMLElement, options?: BrowserGateOptions): BrowserGateFrameController;
    };
    gateFrameController?: BrowserGateFrameController;
    originalGateFrameChildren?: Element[];
    pendingOverlayAdditions?: number;
    pendingOverlayObserver?: MutationObserver;
    cryptoRequestLengths?: number[];
    mathRandomCalls?: number;
    rapidActiveFrameIds?: Set<number>;
    rapidCancelledFrameIds?: number[];
    rapidFrameCallbacks?: Map<number, FrameRequestCallback>;
    rapidFrameIds?: number[];
    rapidMaxActiveFrames?: number;
    rapidOverlayAdditions?: number;
    rapidOverlayMutation?: Promise<void>;
    latestRapidSnapshot?: BrowserGateSnapshot;
    latestRapidExport?: string;
    staleFrameCallbacks?: Map<number, FrameRequestCallback>;
    staleFrameIds?: number[];
    staleCancelledFrameIds?: number[];
    staleInitialSnapshot?: BrowserGateSnapshot;
    staleInitialExport?: string;
    staleInitialOverlay?: SVGSVGElement;
    staleReadyPromise?: Promise<BrowserGateSnapshot>;
    staleReadySettled?: boolean;
    staleReadySnapshot?: BrowserGateSnapshot;
    responsiveActiveFrameIds?: Set<number>;
    responsiveCancelledFrameIds?: number[];
    responsiveFrameCallbacks?: Map<number, FrameRequestCallback>;
    responsiveFrameIds?: number[];
    responsiveMaxActiveFrames?: number;
    responsiveOverlayAdditions?: number;
  }
}

test("opens explicit generation v2 through the package root while omission stays exact v1", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    const originalChildren = Array.from(target.children);
    const v2Controller = window.gateFramePackage.gateFrame(target, {
      generationVersion: 2,
      seed: "root-v2-boundary",
      family: "arcade",
    });
    const v2 = await v2Controller.whenReady();
    const v2OverlayCount = target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length;
    v2Controller.destroy();

    const v1Controller = window.gateFramePackage.gateFrame(target, {
      seed: "root-v1-default",
      family: "courtyard",
    });
    const v1 = await v1Controller.whenReady();
    const v1OverlayCount = target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length;
    v1Controller.destroy();

    return {
      v2: {
        generationVersion: v2.generationVersion,
        family: v2.geometry.options.family,
        overlayCount: v2OverlayCount,
      },
      v1: {
        generationVersion: v1.generationVersion,
        family: v1.geometry.options.family,
        overlayCount: v1OverlayCount,
      },
      childrenUnchanged:
        target.children.length === originalChildren.length &&
        originalChildren.every((child, index) => target.children[index] === child),
    };
  });

  expect(result).toEqual({
    v2: { generationVersion: 2, family: "arcade", overlayCount: 1 },
    v1: { generationVersion: 1, family: "courtyard", overlayCount: 1 },
    childrenUnchanged: true,
  });
});

test("updates generation-v2 family and controls through one mounted controller", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) throw new Error("missing #target fixture");
    target.style.padding = "150px 40px 40px";
    const originalChildren = Array.from(target.children);
    const controller = window.gateFramePackage.gateFrame(target, {
      generationVersion: 2,
      seed: "same-version-v2",
      family: "arcade",
    });
    const before = await controller.whenReady();
    const beforeSvg = controller.toSVG();
    controller.update({
      family: "vine",
      density: 0.8,
      curvature: 0.3,
      symmetry: 0.6,
      peakHeight: 0.7,
      sideComplexity: 0.9,
      crest: "fleur",
    });
    const after = await controller.whenReady();
    const afterSvg = controller.toSVG();
    const overlayCount = target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length;
    const childrenUnchanged =
      target.children.length === originalChildren.length + 1 &&
      originalChildren.every((child, index) => target.children[index] === child);
    controller.destroy();
    return {
      before: {
        version: before.generationVersion,
        family: before.geometry.options.family,
      },
      after: {
        version: after.generationVersion,
        family: after.geometry.options.family,
        density: (after.geometry.options as { density: number }).density,
        curvature: (after.geometry.options as { curvature: number }).curvature,
        symmetry: (after.geometry.options as { symmetry?: number }).symmetry,
        peakHeight: (after.geometry.options as { peakHeight?: number }).peakHeight,
        sideComplexity: (after.geometry.options as { sideComplexity?: number }).sideComplexity,
        crest: (after.geometry.options as { crest?: string }).crest,
      },
      svgChanged: beforeSvg !== afterSvg,
      overlayCount,
      childrenUnchanged,
      cleaned: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length === 0,
    };
  });

  expect(result).toEqual({
    before: { version: 2, family: "arcade" },
    after: {
      version: 2,
      family: "vine",
      density: 0.8,
      curvature: 0.3,
      symmetry: 0.6,
      peakHeight: 0.7,
      sideComplexity: 0.9,
      crest: "fleur",
    },
    svgChanged: true,
    overlayCount: 1,
    childrenUnchanged: true,
    cleaned: true,
  });
});

test("switches complete compatible generation members and rejects incompatible switches atomically", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) throw new Error("missing #target fixture");
    target.style.padding = "150px 40px 40px";
    const originalChildren = Array.from(target.children);
    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "version-switch",
      density: 0.72,
      curvature: 0.28,
      stroke: "#123456",
      surface: "#f5efe2",
      responsive: false,
    });
    const v1Initial = await controller.whenReady();

    controller.update({
      generationVersion: 2,
      family: "volute",
      symmetry: 0.4,
      peakHeight: 0.8,
      sideComplexity: 0.9,
      crest: "fleur",
    });
    const v2 = await controller.whenReady();
    const v2Status = controller.status();
    const v2Svg = controller.toSVG();
    const v2Overlay = target.querySelector(":scope > svg[data-gate-frame-overlay]");

    let rejected: Record<string, unknown>;
    try {
      controller.update({ generationVersion: 1 });
      rejected = { returned: true };
    } catch (cause) {
      const context =
        cause instanceof Error && "context" in cause
          ? (cause.context as Readonly<Record<string, unknown>>)
          : null;
      rejected = {
        returned: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        context,
        legacyContext: context !== null && !("category" in context),
      };
    }
    const rejectionAtomic =
      controller.snapshot() === v2 &&
      controller.status() === v2Status &&
      controller.toSVG() === v2Svg &&
      target.querySelector(":scope > svg[data-gate-frame-overlay]") === v2Overlay;

    controller.update({ generationVersion: 1, family: "courtyard" });
    const v1Again = await controller.whenReady();
    controller.update({ generationVersion: 2 });
    const v2Defaults = await controller.whenReady();
    const v1OptionKeys = Object.keys(v1Again.geometry.options).sort();
    const result = {
      v1Initial: v1Initial.generationVersion,
      v2: {
        version: v2.generationVersion,
        family: v2.geometry.options.family,
        symmetry: (v2.geometry.options as { symmetry?: number }).symmetry,
        peakHeight: (v2.geometry.options as { peakHeight?: number }).peakHeight,
        sideComplexity: (v2.geometry.options as { sideComplexity?: number }).sideComplexity,
      },
      rejected,
      rejectionAtomic,
      v1Again: {
        version: v1Again.generationVersion,
        family: v1Again.geometry.options.family,
        seed: v1Again.seed,
        density: v1Again.geometry.options.density,
        curvature: v1Again.geometry.options.curvature,
        paint: v1Again.paint,
        optionKeys: v1OptionKeys,
      },
      v2Defaults: {
        version: v2Defaults.generationVersion,
        family: v2Defaults.geometry.options.family,
        symmetry: (v2Defaults.geometry.options as { symmetry?: number }).symmetry,
        peakHeight: (v2Defaults.geometry.options as { peakHeight?: number }).peakHeight,
        sideComplexity: (v2Defaults.geometry.options as { sideComplexity?: number }).sideComplexity,
      },
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      childrenUnchanged:
        target.children.length === originalChildren.length + 1 &&
        originalChildren.every((child, index) => target.children[index] === child),
    };
    controller.destroy();
    return result;
  });

  expect(result).toEqual({
    v1Initial: 1,
    v2: {
      version: 2,
      family: "volute",
      symmetry: 0.4,
      peakHeight: 0.8,
      sideComplexity: 0.9,
    },
    rejected: {
      returned: false,
      code: "INVALID_OPTIONS",
      context: {
        optionKeys: [
          "curvature",
          "density",
          "family",
          "generationVersion",
          "responsive",
          "seed",
          "stroke",
          "surface",
        ],
        reason: 'GF-01 requires family: "courtyard"',
      },
      legacyContext: true,
    },
    rejectionAtomic: true,
    v1Again: {
      version: 1,
      family: "courtyard",
      seed: "version-switch",
      density: 0.72,
      curvature: 0.28,
      paint: { stroke: "#123456", surface: "#f5efe2" },
      optionKeys: [
        "crest",
        "curvature",
        "density",
        "family",
        "generationVersion",
        "inset",
        "strokeWidth",
        "symmetry",
      ],
    },
    v2Defaults: {
      version: 2,
      family: "courtyard",
      symmetry: 1,
      peakHeight: 0.35,
      sideComplexity: 0.5,
    },
    overlayCount: 1,
    childrenUnchanged: true,
  });
});

test("resolves generation-v2 auto deterministically across updates and randomize", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) throw new Error("missing #target fixture");
    target.style.padding = "150px 40px 40px";
    const controller = window.gateFramePackage.gateFrame(target, {
      generationVersion: 2,
      seed: "lyon-42",
      family: "auto",
    });
    const first = await controller.whenReady();
    controller.update({ seed: "42" });
    const updated = await controller.whenReady();
    const explicitSeed = controller.randomize("atlas-0000");
    const explicit = await controller.whenReady();
    const randomSeed = controller.randomize();
    const randomized = await controller.whenReady();
    const randomizedSvg = controller.toSVG();
    const randomizedFamily = randomized.geometry.options.family;
    controller.destroy();

    const reproducedController = window.gateFramePackage.gateFrame(target, {
      generationVersion: 2,
      seed: randomSeed,
      family: "auto",
    });
    const reproduced = await reproducedController.whenReady();
    const reproducedSvg = reproducedController.toSVG();
    reproducedController.destroy();
    return {
      families: [
        first.geometry.options.family,
        updated.geometry.options.family,
        explicit.geometry.options.family,
      ],
      explicitSeed,
      randomSeed,
      randomSeedShape: typeof randomSeed === "string" && /^[0-9a-f]{32}$/u.test(randomSeed),
      randomizedFamily,
      reproducedFamily: reproduced.geometry.options.family,
      reproducedBytes: reproducedSvg === randomizedSvg,
    };
  });

  expect(result).toEqual({
    families: ["fan", "volute", "arcade"],
    explicitSeed: "atlas-0000",
    randomSeed: expect.any(String),
    randomSeedShape: true,
    randomizedFamily: result.reproducedFamily,
    reproducedFamily: result.randomizedFamily,
    reproducedBytes: true,
  });
});

test("keeps the vanilla workshop crest choices compatible with its selected family", async ({
  page,
}) => {
  await page.goto("/examples/vanilla/");

  const card = page.locator("#courtyard-card");
  const familySelect = page.locator("#family-select");
  const crestSelect = page.locator("#crest-select");
  const enabledCrests = async (): Promise<string[]> =>
    crestSelect
      .locator("option")
      .evaluateAll((options) =>
        options.flatMap((option) =>
          option instanceof HTMLOptionElement && !option.disabled ? [option.value] : [],
        ),
      );
  const familyCases = [
    ["courtyard", ["", "spear", "diamond", "none"]],
    ["fleuron", ["", "spear", "fleur", "none"]],
    ["arcade", ["", "spear", "diamond", "none"]],
    ["vine", ["", "fleur", "diamond", "none"]],
    ["fan", ["", "spear", "diamond", "none"]],
    ["volute", ["", "spear", "fleur", "none"]],
  ] as const;

  await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
  await expect(familySelect).toHaveValue("courtyard");
  await expect(crestSelect).toHaveValue("");
  expect(await enabledCrests()).toEqual(familyCases[0][1]);

  for (const [family, crests] of familyCases) {
    await familySelect.selectOption(family);
    await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
    await expect(card).toHaveAttribute("data-family", family);
    expect(await enabledCrests()).toEqual(crests);
  }

  await familySelect.selectOption("courtyard");
  await expect(card).toHaveAttribute("data-family", "courtyard");
  await crestSelect.selectOption("spear");
  await expect(card).toHaveAttribute("data-crest", "spear");

  await familySelect.selectOption("vine");
  await expect(crestSelect).toHaveValue("");
  await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
  await expect(card).toHaveAttribute("data-family", "vine");
  expect(await enabledCrests()).toEqual(["", "fleur", "diamond", "none"]);

  await crestSelect.selectOption("fleur");
  await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
  await expect(card).toHaveAttribute("data-crest", "fleur");

  await familySelect.selectOption("auto");
  await expect(crestSelect).toHaveValue("");
  await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
  expect(await enabledCrests()).toEqual(["", "none"]);
  await crestSelect.selectOption("none");
  await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
  await expect(card).toHaveAttribute("data-crest", "none");

  await page
    .locator("[data-variation-card][data-family='fleuron']")
    .first()
    .getByRole("button", { name: "Load in playground" })
    .click();
  await expect(card).toHaveAttribute("data-gate-frame-status", "ready");
  await expect(card).toHaveAttribute("data-family", "fleuron");
  await expect(familySelect).toHaveValue("fleuron");
  await expect(crestSelect).toHaveValue("");
  expect(await enabledCrests()).toEqual(["", "spear", "fleur", "none"]);
});

test("rejects every V2-only key before target ownership for omitted and explicit v1", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const results = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    const OriginalResizeObserver = window.ResizeObserver;
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let resizeObserverConstructions = 0;
    let resizeObserverObservations = 0;
    let animationFrameRequests = 0;
    window.ResizeObserver = class extends OriginalResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        resizeObserverConstructions += 1;
      }

      override observe(observedTarget: Element, options?: ResizeObserverOptions): void {
        resizeObserverObservations += 1;
        super.observe(observedTarget, options);
      }
    };
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      animationFrameRequests += 1;
      return originalRequestAnimationFrame(callback);
    };

    const cases = [
      ["symmetry", 0.5],
      ["peakHeight", 0.4],
      ["sideComplexity", 0.6],
      ["crest", "diamond"],
    ] as const;
    const attempts: Array<Record<string, unknown>> = [];

    try {
      for (const [key, value] of cases) {
        for (const version of ["omitted", "explicit-1"] as const) {
          const options: Record<string, unknown> = { family: "courtyard", [key]: value };
          if (version === "explicit-1") {
            options.generationVersion = 1;
          }
          const originalChildren = Array.from(target.children);
          const before = {
            style: target.getAttribute("style"),
            overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
            resizeObserverConstructions,
            resizeObserverObservations,
            animationFrameRequests,
          };

          let rejection: Record<string, unknown> | null = null;
          try {
            window.gateFramePackage.gateFrame(target, options as BrowserGateOptions);
          } catch (error) {
            const candidate = error as Error & {
              readonly code?: string;
              readonly context?: Record<string, unknown>;
            };
            rejection = {
              name: candidate.name,
              code: candidate.code,
              context: candidate.context,
              contextFrozen: Object.isFrozen(candidate.context),
              optionKeysFrozen: Object.isFrozen(candidate.context?.optionKeys),
            };
          }

          const afterRejection = {
            styleUnchanged: target.getAttribute("style") === before.style,
            childrenUnchanged:
              target.children.length === originalChildren.length &&
              originalChildren.every((child, index) => target.children[index] === child),
            overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
            resizeObserverConstructions:
              resizeObserverConstructions - before.resizeObserverConstructions,
            resizeObserverObservations:
              resizeObserverObservations - before.resizeObserverObservations,
            animationFrameRequests: animationFrameRequests - before.animationFrameRequests,
          };

          const controller = window.gateFramePackage.gateFrame(target, {
            seed: `valid-after-${version}-${key}`,
            family: "courtyard",
          } as BrowserGateOptions);
          const snapshot = await controller.whenReady();
          const claimedOverlayCount = target.querySelectorAll(
            ":scope > svg[data-gate-frame-overlay]",
          ).length;
          controller.destroy();

          attempts.push({
            key,
            version,
            rejection,
            afterRejection,
            validClaim: {
              generationVersion: snapshot.generationVersion,
              claimedOverlayCount,
              cleanedOverlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]")
                .length,
              childrenRestored:
                target.children.length === originalChildren.length &&
                originalChildren.every((child, index) => target.children[index] === child),
              styleRestored: target.getAttribute("style") === before.style,
            },
          });
        }
      }
    } finally {
      window.ResizeObserver = OriginalResizeObserver;
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }

    return attempts;
  });

  expect(results).toHaveLength(8);
  for (const result of results) {
    expect(result.rejection).toEqual({
      name: "GateFrameInvalidOptionsError",
      code: "INVALID_OPTIONS",
      context: {
        optionKeys: [result.key],
        reason: "unsupported option keys",
      },
      contextFrozen: true,
      optionKeysFrozen: true,
    });
    expect(result.afterRejection).toEqual({
      styleUnchanged: true,
      childrenUnchanged: true,
      overlayCount: 0,
      resizeObserverConstructions: 0,
      resizeObserverObservations: 0,
      animationFrameRequests: 0,
    });
    expect(result.validClaim).toEqual({
      generationVersion: 1,
      claimedOverlayCount: 1,
      cleanedOverlayCount: 0,
      childrenRestored: true,
      styleRestored: true,
    });
  }
});

test("mounts one in-place courtyard overlay and destroys only owned resources", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const initialStatus = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    window.originalGateFrameChildren = Array.from(target.children);
    window.gateFrameController = window.gateFramePackage.gateFrame(target, {
      seed: "browser-mount",
    });
    const status = window.gateFrameController.status();
    return { status, frozen: Object.isFrozen(status) };
  });

  expect(initialStatus).toEqual({ status: { state: "pending" }, frozen: true });

  const readySnapshot = await page.evaluate(async () => {
    const controller = window.gateFrameController;
    if (controller === undefined) {
      throw new Error("missing gate frame controller");
    }
    return controller.whenReady();
  });

  expect(readySnapshot.seed).toBe("browser-mount");
  expect(readySnapshot.generationVersion).toBe(1);
  expect(readySnapshot.geometry.dimensions).toEqual({ width: 298, height: 340 });
  expect(readySnapshot.paint).toEqual({ stroke: "currentColor", surface: "transparent" });

  const mounted = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    const overlay = target?.querySelector<SVGSVGElement>(":scope > svg[data-gate-frame-overlay]");
    if (
      target === null ||
      controller === undefined ||
      originalChildren === undefined ||
      overlay === null ||
      overlay === undefined
    ) {
      throw new Error("incomplete mounted fixture");
    }

    const snapshot = controller.snapshot();
    if (snapshot === null) {
      throw new Error("expected committed snapshot");
    }

    const standalone = controller.toSVG();
    const exportedSvg = new DOMParser().parseFromString(
      standalone,
      "image/svg+xml",
    ).documentElement;
    const computedOverlay = getComputedStyle(overlay);

    return {
      childIdentity: [
        target.children[0] === originalChildren[0],
        target.children[1] === originalChildren[1],
      ],
      childIds: Array.from(target.children)
        .slice(0, 2)
        .map((child) => child.id),
      childCount: target.children.length,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      overlayIsLastChild: target.lastElementChild === overlay,
      targetSize: { width: target.offsetWidth, height: target.offsetHeight },
      overlay: {
        position: computedOverlay.position,
        inset: overlay.style.inset,
        width: overlay.style.width,
        height: overlay.style.height,
        pointerEvents: computedOverlay.pointerEvents,
        ariaHidden: overlay.getAttribute("aria-hidden"),
        focusable: overlay.getAttribute("focusable"),
        tabIndex: overlay.tabIndex,
        viewBox: overlay.getAttribute("viewBox"),
      },
      immutable: {
        status: Object.isFrozen(controller.status()),
        snapshot: Object.isFrozen(snapshot),
        paint: Object.isFrozen(snapshot.paint),
        geometry: Object.isFrozen(snapshot.geometry),
      },
      currentStatus: controller.status(),
      export: {
        equalsCommittedDimensions:
          exportedSvg.getAttribute("width") === String(snapshot.geometry.dimensions.width) &&
          exportedSvg.getAttribute("height") === String(snapshot.geometry.dimensions.height),
        viewBox: exportedSvg.getAttribute("viewBox"),
        seed: snapshot.seed,
        hasOverlayMarker: standalone.includes("data-gate-frame-overlay"),
        hasOverlayStyle: standalone.includes("position: absolute"),
        pathData: Array.from(exportedSvg.querySelectorAll("path"), (path) =>
          path.getAttribute("d"),
        ),
        overlayPathData: Array.from(overlay.querySelectorAll("path"), (path) =>
          path.getAttribute("d"),
        ),
      },
    };
  });

  expect(mounted.childIdentity).toEqual([true, true]);
  expect(mounted.childIds).toEqual(["first-child", "second-child"]);
  expect(mounted.childCount).toBe(3);
  expect(mounted.overlayCount).toBe(1);
  expect(mounted.overlayIsLastChild).toBe(true);
  expect(mounted.targetSize).toEqual({ width: 300, height: 342 });
  expect(mounted.overlay).toEqual({
    position: "absolute",
    inset: "0px",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    ariaHidden: "true",
    focusable: "false",
    tabIndex: -1,
    viewBox: "0 0 298 340",
  });
  expect(mounted.immutable).toEqual({ status: true, snapshot: true, paint: true, geometry: true });
  expect(mounted.currentStatus.state).toBe("ready");
  expect(mounted.currentStatus.snapshot).toEqual(readySnapshot);
  expect(mounted.export.equalsCommittedDimensions).toBe(true);
  expect(mounted.export.viewBox).toBe("0 0 298 340");
  expect(mounted.export.seed).toBe("browser-mount");
  expect(mounted.export.hasOverlayMarker).toBe(false);
  expect(mounted.export.hasOverlayStyle).toBe(false);
  expect(mounted.export.pathData).toEqual(mounted.export.overlayPathData);

  const destroyed = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    if (target === null || controller === undefined || originalChildren === undefined) {
      throw new Error("incomplete destroy fixture");
    }

    controller.destroy();
    controller.destroy();
    return {
      status: controller.status(),
      statusFrozen: Object.isFrozen(controller.status()),
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      childIdentity: [
        target.children[0] === originalChildren[0],
        target.children[1] === originalChildren[1],
      ],
      childIds: Array.from(target.children, (child) => child.id),
      position: target.style.position,
    };
  });

  expect(destroyed).toEqual({
    status: { state: "destroyed" },
    statusFrozen: true,
    overlayCount: 0,
    childIdentity: [true, true],
    childIds: ["first-child", "second-child"],
    position: "",
  });
});

test("keeps zero-sized targets pending until one real non-zero measurement", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const zeroSized = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    target.style.display = "none";
    target.style.setProperty("position", "static", "important");
    window.pendingOverlayAdditions = 0;
    window.pendingOverlayObserver = new MutationObserver((records) => {
      for (const record of records) {
        window.pendingOverlayAdditions =
          (window.pendingOverlayAdditions ?? 0) +
          Array.from(record.addedNodes).filter(
            (node) => node instanceof SVGSVGElement && node.hasAttribute("data-gate-frame-overlay"),
          ).length;
      }
    });
    window.pendingOverlayObserver.observe(target, { childList: true });

    const zeroMeasurement = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 0 && borderBox.blockSize === 0) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    window.gateFrameController = window.gateFramePackage.gateFrame(target, {
      seed: "pending-measurement",
    });
    await zeroMeasurement;

    return {
      status: window.gateFrameController.status(),
      snapshot: window.gateFrameController.snapshot(),
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      overlayAdditions: window.pendingOverlayAdditions,
      ownedPosition: target.style.getPropertyValue("position"),
      ownedPositionPriority: target.style.getPropertyPriority("position"),
    };
  });

  expect(zeroSized).toEqual({
    status: { state: "pending" },
    snapshot: null,
    overlayCount: 0,
    overlayAdditions: 0,
    ownedPosition: "relative",
    ownedPositionPriority: "",
  });

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    target.style.display = "block";
  });

  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.status().state))
    .toBe("ready");

  const firstRender = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete pending fixture");
    }

    const snapshot = controller.snapshot();
    return {
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      overlayAdditions: window.pendingOverlayAdditions,
      dimensions: snapshot?.geometry.dimensions,
    };
  });

  expect(firstRender).toEqual({
    overlayCount: 1,
    overlayAdditions: 1,
    dimensions: { width: 298, height: 340 },
  });

  const cleaned = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete pending cleanup fixture");
    }

    window.pendingOverlayObserver?.disconnect();
    controller.destroy();
    return {
      position: target.style.getPropertyValue("position"),
      positionPriority: target.style.getPropertyPriority("position"),
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(cleaned).toEqual({ position: "static", positionPriority: "important", overlayCount: 0 });

  const pendingReadiness = await page.evaluate(async () => {
    const detached = document.createElement("div");
    const controller = window.gateFramePackage.gateFrame(detached, { seed: "detached" });
    const readiness = controller.whenReady().then(
      () => "resolved",
      () => "rejected",
    );
    controller.destroy();
    return { settlement: await readiness, status: controller.status() };
  });

  expect(pendingReadiness).toEqual({ settlement: "rejected", status: { state: "destroyed" } });
});

test("regenerates numeric geometry for a physical resize without stretching", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const beforeResize = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    window.originalGateFrameChildren = Array.from(target.children);
    window.gateFrameController = window.gateFramePackage.gateFrame(target, {
      seed: "physical-resize",
    });
    await window.gateFrameController.whenReady();
    const overlay = target.querySelector<SVGSVGElement>(":scope > svg[data-gate-frame-overlay]");
    if (overlay === null) {
      throw new Error("missing initial overlay");
    }

    return {
      paths: Array.from(overlay.querySelectorAll("path"), (path) => path.getAttribute("d")),
      viewBox: overlay.getAttribute("viewBox"),
    };
  });

  expect(beforeResize.viewBox).toBe("0 0 298 340");

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    target.style.width = "360px";
    target.style.height = "380px";
    target.style.padding = "136px 34px 34px";
  });

  await expect
    .poll(() =>
      page.evaluate(() => window.gateFrameController?.snapshot()?.geometry.dimensions.width),
    )
    .toBe(358);

  const afterResize = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    const overlay = target?.querySelector<SVGSVGElement>(":scope > svg[data-gate-frame-overlay]");
    if (
      target === null ||
      controller === undefined ||
      originalChildren === undefined ||
      overlay === null ||
      overlay === undefined
    ) {
      throw new Error("incomplete resized fixture");
    }

    const snapshot = controller.snapshot();
    const exportedSvg = new DOMParser().parseFromString(
      controller.toSVG(),
      "image/svg+xml",
    ).documentElement;
    return {
      dimensions: snapshot?.geometry.dimensions,
      paths: Array.from(overlay.querySelectorAll("path"), (path) => path.getAttribute("d")),
      viewBox: overlay.getAttribute("viewBox"),
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      childIdentity: [
        target.children[0] === originalChildren[0],
        target.children[1] === originalChildren[1],
      ],
      childIds: Array.from(target.children)
        .slice(0, 2)
        .map((child) => child.id),
      exportDimensions: {
        width: exportedSvg.getAttribute("width"),
        height: exportedSvg.getAttribute("height"),
        viewBox: exportedSvg.getAttribute("viewBox"),
      },
    };
  });

  expect(afterResize.dimensions).toEqual({ width: 358, height: 378 });
  expect(afterResize.paths).not.toEqual(beforeResize.paths);
  expect(afterResize.viewBox).toBe("0 0 358 378");
  expect(afterResize.overlayCount).toBe(1);
  expect(afterResize.childIdentity).toEqual([true, true]);
  expect(afterResize.childIds).toEqual(["first-child", "second-child"]);
  expect(afterResize.exportDimensions).toEqual({
    width: "358",
    height: "378",
    viewBox: "0 0 358 378",
  });
});

test("rederives padding-box dimensions from current physical borders on explicit update", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    const originalChildren = Array.from(target.children);
    const fixedBorderBox = { width: target.offsetWidth, height: target.offsetHeight };
    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "physical-border-update",
    });
    const initialSnapshot = await controller.whenReady();
    const initialOverlay = target.querySelector<SVGSVGElement>(
      ":scope > svg[data-gate-frame-overlay]",
    );
    if (initialOverlay === null) {
      throw new Error("missing initial overlay");
    }
    const initialPaths = Array.from(initialOverlay.querySelectorAll("path"), (path) =>
      path.getAttribute("d"),
    );

    target.style.borderLeftWidth = "5px";
    target.style.borderRightWidth = "7px";
    target.style.borderTopWidth = "9px";
    target.style.borderBottomWidth = "11px";
    const borderBoxAfterStyleChange = {
      width: target.offsetWidth,
      height: target.offsetHeight,
    };

    controller.update({});
    const updatedSnapshot = await controller.whenReady();
    const updatedOverlay = target.querySelector<SVGSVGElement>(
      ":scope > svg[data-gate-frame-overlay]",
    );
    if (updatedOverlay === null) {
      throw new Error("missing updated overlay");
    }
    const exportedSvg = new DOMParser().parseFromString(
      controller.toSVG(),
      "image/svg+xml",
    ).documentElement;
    const updatedOverlayPaths = Array.from(updatedOverlay.querySelectorAll("path"), (path) =>
      path.getAttribute("d"),
    );
    const updatedExportPaths = Array.from(exportedSvg.querySelectorAll("path"), (path) =>
      path.getAttribute("d"),
    );

    return {
      fixedBorderBox,
      borderBoxAfterStyleChange,
      initialDimensions: initialSnapshot.geometry.dimensions,
      updatedDimensions: updatedSnapshot.geometry.dimensions,
      updatedViewBoxes: {
        overlay: updatedOverlay.getAttribute("viewBox"),
        exported: exportedSvg.getAttribute("viewBox"),
      },
      updatedExportDimensions: {
        width: exportedSvg.getAttribute("width"),
        height: exportedSvg.getAttribute("height"),
      },
      pathsChanged: updatedOverlayPaths.join("\n") !== initialPaths.join("\n"),
      committedPathBytesMatch: updatedOverlayPaths.join("\n") === updatedExportPaths.join("\n"),
      overlayReplaced: updatedOverlay !== initialOverlay,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      overlayIsLastChild: target.lastElementChild === updatedOverlay,
      childIdentity:
        target.children.length === originalChildren.length + 1 &&
        originalChildren.every((child, index) => target.children[index] === child),
      childIds: Array.from(target.children)
        .slice(0, originalChildren.length)
        .map((child) => child.id),
    };
  });

  expect(result).toEqual({
    fixedBorderBox: { width: 300, height: 342 },
    borderBoxAfterStyleChange: { width: 300, height: 342 },
    initialDimensions: { width: 298, height: 340 },
    updatedDimensions: { width: 288, height: 322 },
    updatedViewBoxes: { overlay: "0 0 288 322", exported: "0 0 288 322" },
    updatedExportDimensions: { width: "288", height: "322" },
    pathsChanged: true,
    committedPathBytesMatch: true,
    overlayReplaced: true,
    overlayCount: 1,
    overlayIsLastChild: true,
    childIdentity: true,
    childIds: ["first-child", "second-child"],
  });
});

test("re-enables physical resize observation after responsive false", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "responsive-toggle",
      responsive: false,
    });
    const initialSnapshot = await controller.whenReady();

    window.responsiveActiveFrameIds = new Set();
    window.responsiveCancelledFrameIds = [];
    window.responsiveFrameCallbacks = new Map();
    window.responsiveFrameIds = [];
    window.responsiveMaxActiveFrames = 0;
    let resolveCurrentFrameQueued: (() => void) | undefined;
    const currentFrameQueued = new Promise<void>((resolve) => {
      resolveCurrentFrameQueued = resolve;
    });
    let nextFrameId = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const frameId = ++nextFrameId;
      const wrappedCallback: FrameRequestCallback = (timestamp) => {
        window.responsiveActiveFrameIds?.delete(frameId);
        callback(timestamp);
      };
      window.responsiveFrameCallbacks?.set(frameId, wrappedCallback);
      window.responsiveFrameIds?.push(frameId);
      window.responsiveActiveFrameIds?.add(frameId);
      window.responsiveMaxActiveFrames = Math.max(
        window.responsiveMaxActiveFrames ?? 0,
        window.responsiveActiveFrameIds?.size ?? 0,
      );
      if (frameId === 2) {
        resolveCurrentFrameQueued?.();
      }
      return frameId;
    };
    window.cancelAnimationFrame = (frameId: number): void => {
      window.responsiveActiveFrameIds?.delete(frameId);
      window.responsiveCancelledFrameIds?.push(frameId);
    };

    const ignoredResizeMeasurement = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 360 && borderBox.blockSize === 380) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    target.style.width = "360px";
    target.style.height = "380px";
    target.style.padding = "136px 34px 34px";
    await ignoredResizeMeasurement;
    const afterIgnoredResize = {
      dimensions: controller.snapshot()?.geometry.dimensions,
      frameIds: [...(window.responsiveFrameIds ?? [])],
    };

    window.responsiveOverlayAdditions = 0;
    const overlayMutation = new Promise<void>((resolve) => {
      new MutationObserver((records, observer) => {
        for (const record of records) {
          window.responsiveOverlayAdditions =
            (window.responsiveOverlayAdditions ?? 0) +
            Array.from(record.addedNodes).filter(
              (node) =>
                node instanceof SVGSVGElement && node.hasAttribute("data-gate-frame-overlay"),
            ).length;
        }
        if ((window.responsiveOverlayAdditions ?? 0) > 0) {
          observer.disconnect();
          resolve();
        }
      }).observe(target, { childList: true });
    });

    const currentResizeMeasurement = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 420 && borderBox.blockSize === 400) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    controller.update({ responsive: true });
    target.style.width = "420px";
    target.style.height = "400px";
    await currentResizeMeasurement;
    await currentFrameQueued;
    const queuedAfterReenable = {
      frameIds: [...(window.responsiveFrameIds ?? [])],
      activeFrameIds: Array.from(window.responsiveActiveFrameIds ?? []),
      cancelledFrameIds: [...(window.responsiveCancelledFrameIds ?? [])],
      maxActiveFrames: window.responsiveMaxActiveFrames,
      status: controller.status().state,
    };

    const readyPromise = controller.whenReady();
    const currentFrameId = window.responsiveFrameIds?.at(-1);
    const currentCallback =
      currentFrameId === undefined
        ? undefined
        : window.responsiveFrameCallbacks?.get(currentFrameId);
    if (currentCallback === undefined) {
      throw new Error("missing responsive render callback");
    }
    currentCallback(performance.now());
    const readySnapshot = await readyPromise;
    await overlayMutation;
    const snapshot = controller.snapshot();

    return {
      initialDimensions: initialSnapshot.geometry.dimensions,
      afterIgnoredResize,
      queuedAfterReenable,
      committed: {
        readySnapshotIsCurrent: readySnapshot === snapshot,
        dimensions: snapshot?.geometry.dimensions,
        exportHasCurrentDimensions: controller.toSVG().includes('width="418" height="398"'),
        overlayAdditions: window.responsiveOverlayAdditions,
        overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
        activeFrameIds: Array.from(window.responsiveActiveFrameIds ?? []),
      },
    };
  });

  expect(result).toEqual({
    initialDimensions: { width: 298, height: 340 },
    afterIgnoredResize: {
      dimensions: { width: 298, height: 340 },
      frameIds: [],
    },
    queuedAfterReenable: {
      frameIds: [1, 2],
      activeFrameIds: [2],
      cancelledFrameIds: [1],
      maxActiveFrames: 1,
      status: "pending",
    },
    committed: {
      readySnapshotIsCurrent: true,
      dimensions: { width: 418, height: 398 },
      exportHasCurrentDimensions: true,
      overlayAdditions: 1,
      overlayCount: 1,
      activeFrameIds: [],
    },
  });
});

test("updates seed, shape, and paint without remounting original content", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const beforeUpdate = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    window.originalGateFrameChildren = Array.from(target.children);
    window.gateFrameController = window.gateFramePackage.gateFrame(target, {
      seed: "before-update",
      density: 0.2,
      curvature: 0.8,
    });
    const snapshot = await window.gateFrameController.whenReady();
    const overlay = target.querySelector<SVGSVGElement>(":scope > svg[data-gate-frame-overlay]");
    if (overlay === null) {
      throw new Error("missing initial overlay");
    }

    return {
      snapshot,
      paths: Array.from(overlay.querySelectorAll("path"), (path) => path.getAttribute("d")),
    };
  });

  expect(beforeUpdate.snapshot.seed).toBe("before-update");
  expect(beforeUpdate.snapshot.geometry.options).toMatchObject({ density: 0.2, curvature: 0.8 });

  const returnedSameController = await page.evaluate(() => {
    const controller = window.gateFrameController;
    if (controller === undefined) {
      throw new Error("missing gate frame controller");
    }
    return (
      controller.update({
        seed: "after-update",
        density: 0.9,
        curvature: 0.15,
        stroke: "#123456",
        surface: "rgba(10, 20, 30, 0.25)",
      }) === controller
    );
  });

  expect(returnedSameController).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.snapshot()?.seed))
    .toBe("after-update");

  const afterUpdate = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    const overlay = target?.querySelector<SVGSVGElement>(":scope > svg[data-gate-frame-overlay]");
    if (
      target === null ||
      controller === undefined ||
      originalChildren === undefined ||
      overlay === null ||
      overlay === undefined
    ) {
      throw new Error("incomplete updated fixture");
    }

    const snapshot = controller.snapshot();
    if (snapshot === null) {
      throw new Error("missing updated snapshot");
    }
    const exportedSvg = new DOMParser().parseFromString(
      controller.toSVG(),
      "image/svg+xml",
    ).documentElement;
    return {
      seed: snapshot.seed,
      options: snapshot.geometry.options,
      paint: snapshot.paint,
      paintFrozen: Object.isFrozen(snapshot.paint),
      paths: Array.from(overlay.querySelectorAll("path"), (path) => path.getAttribute("d")),
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      overlayIsLastChild: target.lastElementChild === overlay,
      childIdentity: [
        target.children[0] === originalChildren[0],
        target.children[1] === originalChildren[1],
      ],
      childIds: Array.from(target.children)
        .slice(0, 2)
        .map((child) => child.id),
      exportedStroke: exportedSvg.querySelector("g")?.getAttribute("stroke"),
      exportedSurface: exportedSvg.querySelector("path")?.getAttribute("fill"),
    };
  });

  expect(afterUpdate.seed).toBe("after-update");
  expect(afterUpdate.options).toMatchObject({ density: 0.9, curvature: 0.15 });
  expect(afterUpdate.paint).toEqual({
    stroke: "#123456",
    surface: "rgba(10, 20, 30, 0.25)",
  });
  expect(afterUpdate.paintFrozen).toBe(true);
  expect(afterUpdate.paths).not.toEqual(beforeUpdate.paths);
  expect(afterUpdate.overlayCount).toBe(1);
  expect(afterUpdate.overlayIsLastChild).toBe(true);
  expect(afterUpdate.childIdentity).toEqual([true, true]);
  expect(afterUpdate.childIds).toEqual(["first-child", "second-child"]);
  expect(afterUpdate.exportedStroke).toBe("#123456");
  expect(afterUpdate.exportedSurface).toBe("rgba(10, 20, 30, 0.25)");
});

test("randomizes with explicit seeds or exactly 128 browser-crypto bits", async ({ page }) => {
  await page.addInitScript(() => {
    window.cryptoRequestLengths = [];
    window.mathRandomCalls = 0;
    Object.defineProperty(window.crypto, "getRandomValues", {
      configurable: true,
      value: (bytes: Uint8Array): Uint8Array => {
        const requestIndex = window.cryptoRequestLengths?.length ?? 0;
        window.cryptoRequestLengths?.push(bytes.byteLength);
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = requestIndex * 16 + index;
        }
        return bytes;
      },
    });
    Object.defineProperty(Math, "random", {
      configurable: true,
      value: (): never => {
        window.mathRandomCalls = (window.mathRandomCalls ?? 0) + 1;
        throw new Error("Math.random must not be used by Gate Frame");
      },
    });
  });
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const initial = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    window.gateFrameController = window.gateFramePackage.gateFrame(target);
    const snapshot = await window.gateFrameController.whenReady();
    return {
      seed: snapshot.seed,
      cryptoRequestLengths: window.cryptoRequestLengths,
      mathRandomCalls: window.mathRandomCalls,
    };
  });

  expect(initial).toEqual({
    seed: "000102030405060708090a0b0c0d0e0f",
    cryptoRequestLengths: [16],
    mathRandomCalls: 0,
  });

  const explicitSeed = await page.evaluate(() => {
    const controller = window.gateFrameController;
    if (controller === undefined) {
      throw new Error("missing gate frame controller");
    }
    return controller.randomize("explicit-randomize");
  });

  expect(explicitSeed).toBe("explicit-randomize");
  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.snapshot()?.seed))
    .toBe("explicit-randomize");
  expect(await page.evaluate(() => window.cryptoRequestLengths)).toEqual([16]);

  const generatedSeed = await page.evaluate(() => {
    const controller = window.gateFrameController;
    if (controller === undefined) {
      throw new Error("missing gate frame controller");
    }
    return controller.randomize();
  });

  expect(generatedSeed).toBe("101112131415161718191a1b1c1d1e1f");
  expect(generatedSeed).toMatch(/^[0-9a-f]{32}$/);
  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.snapshot()?.seed))
    .toBe(generatedSeed);

  const finalState = await page.evaluate(() => ({
    cryptoRequestLengths: window.cryptoRequestLengths,
    mathRandomCalls: window.mathRandomCalls,
    seed: window.gateFrameController?.snapshot()?.seed,
    export: window.gateFrameController?.toSVG(),
  }));

  expect(finalState.cryptoRequestLengths).toEqual([16, 16]);
  expect(finalState.mathRandomCalls).toBe(0);
  expect(finalState.seed).toBe(generatedSeed);
  expect(finalState.export).toContain('width="298" height="340"');
});

test("normalizes negative-zero seeds across mount, update, and explicit randomize", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const states = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    const controller = window.gateFramePackage.gateFrame(target, { seed: -0 });
    const initialSnapshot = await controller.whenReady();
    const initialExport = controller.toSVG();

    controller.update({ seed: -0, density: 0.72 });
    const updatedSnapshot = await controller.whenReady();
    const updatedExport = controller.toSVG();

    const returnedSeed = controller.randomize(-0);
    const randomizedSnapshot = await controller.whenReady();
    const randomizedExport = controller.toSVG();

    return {
      initial: {
        snapshotSeedIsZero: Object.is(initialSnapshot.seed, 0),
        geometrySeedIsZero: Object.is(initialSnapshot.geometry.seed, 0),
        seedsAgree: Object.is(initialSnapshot.seed, initialSnapshot.geometry.seed),
      },
      update: {
        snapshotSeedIsZero: Object.is(updatedSnapshot.seed, 0),
        geometrySeedIsZero: Object.is(updatedSnapshot.geometry.seed, 0),
        seedsAgree: Object.is(updatedSnapshot.seed, updatedSnapshot.geometry.seed),
        density: updatedSnapshot.geometry.options.density,
        exportChangedForUpdate: updatedExport !== initialExport,
      },
      randomize: {
        returnSeedIsZero: Object.is(returnedSeed, 0),
        snapshotSeedIsZero: Object.is(randomizedSnapshot.seed, 0),
        geometrySeedIsZero: Object.is(randomizedSnapshot.geometry.seed, 0),
        returnMatchesSnapshot: Object.is(returnedSeed, randomizedSnapshot.seed),
        snapshotMatchesGeometry: Object.is(
          randomizedSnapshot.seed,
          randomizedSnapshot.geometry.seed,
        ),
        exportMatchesSelectedGeometry: randomizedExport === updatedExport,
      },
    };
  });

  expect(states).toEqual({
    initial: {
      snapshotSeedIsZero: true,
      geometrySeedIsZero: true,
      seedsAgree: true,
    },
    update: {
      snapshotSeedIsZero: true,
      geometrySeedIsZero: true,
      seedsAgree: true,
      density: 0.72,
      exportChangedForUpdate: true,
    },
    randomize: {
      returnSeedIsZero: true,
      snapshotSeedIsZero: true,
      geometrySeedIsZero: true,
      returnMatchesSnapshot: true,
      snapshotMatchesGeometry: true,
      exportMatchesSelectedGeometry: true,
    },
  });
});

test("coalesces rapid generation-v2 requests and rejects every stale frame commit", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    window.originalGateFrameChildren = Array.from(target.children);
    window.gateFrameController = window.gateFramePackage.gateFrame(target, {
      generationVersion: 2,
      seed: "rapid-initial",
      family: "auto",
    });
    await window.gateFrameController.whenReady();
  });

  const firstBurst = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete rapid fixture");
    }

    window.rapidActiveFrameIds = new Set();
    window.rapidCancelledFrameIds = [];
    window.rapidFrameCallbacks = new Map();
    window.rapidFrameIds = [];
    window.rapidMaxActiveFrames = 0;
    window.rapidOverlayAdditions = 0;
    let nextFrameId = 0;

    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const frameId = ++nextFrameId;
      const wrappedCallback: FrameRequestCallback = (timestamp) => {
        window.rapidActiveFrameIds?.delete(frameId);
        callback(timestamp);
      };
      window.rapidFrameCallbacks?.set(frameId, wrappedCallback);
      window.rapidFrameIds?.push(frameId);
      window.rapidActiveFrameIds?.add(frameId);
      window.rapidMaxActiveFrames = Math.max(
        window.rapidMaxActiveFrames ?? 0,
        window.rapidActiveFrameIds?.size ?? 0,
      );
      return frameId;
    };
    window.cancelAnimationFrame = (frameId: number): void => {
      window.rapidActiveFrameIds?.delete(frameId);
      window.rapidCancelledFrameIds?.push(frameId);
    };

    window.rapidOverlayMutation = new Promise<void>((resolve) => {
      new MutationObserver((records) => {
        for (const record of records) {
          window.rapidOverlayAdditions =
            (window.rapidOverlayAdditions ?? 0) +
            Array.from(record.addedNodes).filter(
              (node) =>
                node instanceof SVGSVGElement && node.hasAttribute("data-gate-frame-overlay"),
            ).length;
        }
        if ((window.rapidOverlayAdditions ?? 0) > 0) {
          resolve();
        }
      }).observe(target, { childList: true });
    });

    const resized = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 420 && borderBox.blockSize === 400) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    controller.update({
      seed: "stale-update",
      density: 0.1,
      curvature: 0.2,
      stroke: "#111111",
    });
    controller.randomize("newer-randomize");
    target.style.width = "420px";
    target.style.height = "400px";
    target.style.padding = "150px 34px 34px";
    await resized;

    return {
      frameIds: window.rapidFrameIds,
      activeFrameIds: Array.from(window.rapidActiveFrameIds ?? []),
      cancelledFrameIds: window.rapidCancelledFrameIds,
      maxActiveFrames: window.rapidMaxActiveFrames,
    };
  });

  expect(firstBurst.frameIds).toEqual([1, 2, 3]);
  expect(firstBurst.activeFrameIds).toEqual([3]);
  expect(firstBurst.cancelledFrameIds).toEqual([1, 2]);
  expect(firstBurst.maxActiveFrames).toBe(1);

  const afterForcedStaleFrame = await page.evaluate(() => {
    const firstFrameId = window.rapidFrameIds?.[0];
    const firstCallback =
      firstFrameId === undefined ? undefined : window.rapidFrameCallbacks?.get(firstFrameId);
    const controller = window.gateFrameController;
    if (firstCallback === undefined || controller === undefined) {
      throw new Error("missing stale frame fixture");
    }

    firstCallback(performance.now());
    controller.update({
      seed: "newest-request",
      density: 0.95,
      curvature: 0.05,
      sideComplexity: 0.84,
      stroke: "#abcdef",
      surface: "#102030",
    });
    return {
      frameIds: window.rapidFrameIds,
      activeFrameIds: Array.from(window.rapidActiveFrameIds ?? []),
      cancelledFrameIds: window.rapidCancelledFrameIds,
      maxActiveFrames: window.rapidMaxActiveFrames,
    };
  });

  expect(afterForcedStaleFrame.frameIds).toEqual([1, 2, 3, 4]);
  expect(afterForcedStaleFrame.activeFrameIds).toEqual([4]);
  expect(afterForcedStaleFrame.cancelledFrameIds).toEqual([1, 2, 3]);
  expect(afterForcedStaleFrame.maxActiveFrames).toBe(1);

  const latestCommit = await page.evaluate(async () => {
    const latestFrameId = window.rapidFrameIds?.at(-1);
    const latestCallback =
      latestFrameId === undefined ? undefined : window.rapidFrameCallbacks?.get(latestFrameId);
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (latestCallback === undefined || target === null || controller === undefined) {
      throw new Error("missing newest frame fixture");
    }

    latestCallback(performance.now());
    const snapshot = controller.snapshot();
    if (snapshot === null) {
      throw new Error("newest frame did not commit");
    }
    window.latestRapidSnapshot = snapshot;
    window.latestRapidExport = controller.toSVG();
    await window.rapidOverlayMutation;
    return {
      seed: snapshot.seed,
      dimensions: snapshot.geometry.dimensions,
      options: snapshot.geometry.options,
      paint: snapshot.paint,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      overlayAdditions: window.rapidOverlayAdditions,
      childIdentity: [
        target.children[0] === window.originalGateFrameChildren?.[0],
        target.children[1] === window.originalGateFrameChildren?.[1],
      ],
      childIds: Array.from(target.children)
        .slice(0, 2)
        .map((child) => child.id),
      export: controller.toSVG(),
    };
  });

  expect(latestCommit.seed).toBe("newest-request");
  expect(latestCommit.dimensions).toEqual({ width: 418, height: 398 });
  expect(latestCommit.options).toMatchObject({
    generationVersion: 2,
    density: 0.95,
    curvature: 0.05,
    sideComplexity: 0.84,
  });
  expect(latestCommit.paint).toEqual({ stroke: "#abcdef", surface: "#102030" });
  expect(latestCommit.overlayCount).toBe(1);
  expect(latestCommit.overlayAdditions).toBe(1);
  expect(latestCommit.childIdentity).toEqual([true, true]);
  expect(latestCommit.childIds).toEqual(["first-child", "second-child"]);
  expect(latestCommit.export).toContain('width="418" height="398"');

  const afterLateStaleFrames = await page.evaluate(() => {
    const latestFrameId = window.rapidFrameIds?.at(-1);
    for (const frameId of window.rapidFrameIds ?? []) {
      if (frameId !== latestFrameId && frameId !== 1) {
        window.rapidFrameCallbacks?.get(frameId)?.(performance.now());
      }
    }

    const controller = window.gateFrameController;
    return {
      sameSnapshot: controller?.snapshot() === window.latestRapidSnapshot,
      sameExport: controller?.toSVG() === window.latestRapidExport,
      seed: controller?.snapshot()?.seed,
      dimensions: controller?.snapshot()?.geometry.dimensions,
    };
  });

  expect(afterLateStaleFrames).toEqual({
    sameSnapshot: true,
    sameExport: true,
    seed: "newest-request",
    dimensions: { width: 418, height: 398 },
  });
});

test("invalidates queued nonzero resize work when the target becomes zero-sized", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    window.gateFrameController = window.gateFramePackage.gateFrame(target, {
      seed: "stale-measurement",
    });
    window.staleInitialSnapshot = await window.gateFrameController.whenReady();
    window.staleInitialExport = window.gateFrameController.toSVG();
    const initialOverlay = target.querySelector<SVGSVGElement>(
      ":scope > svg[data-gate-frame-overlay]",
    );
    if (initialOverlay === null) {
      throw new Error("missing initial overlay");
    }
    window.staleInitialOverlay = initialOverlay;

    window.staleFrameCallbacks = new Map();
    window.staleFrameIds = [];
    window.staleCancelledFrameIds = [];
    let nextFrameId = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const frameId = ++nextFrameId;
      window.staleFrameCallbacks?.set(frameId, callback);
      window.staleFrameIds?.push(frameId);
      return frameId;
    };
    window.cancelAnimationFrame = (frameId: number): void => {
      window.staleCancelledFrameIds?.push(frameId);
    };

    const nonzeroMeasurement = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 420 && borderBox.blockSize === 400) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    target.style.width = "420px";
    target.style.height = "400px";
    target.style.padding = "136px 34px 34px";
    await nonzeroMeasurement;

    window.staleReadySettled = false;
    window.staleReadyPromise = window.gateFrameController.whenReady();
    void window.staleReadyPromise.then((snapshot) => {
      window.staleReadySettled = true;
      window.staleReadySnapshot = snapshot;
    });
  });

  const queuedNonzeroRender = await page.evaluate(() => ({
    frameIds: window.staleFrameIds,
    status: window.gateFrameController?.status(),
    readySettled: window.staleReadySettled,
  }));

  expect(queuedNonzeroRender).toEqual({
    frameIds: [1],
    status: { state: "pending" },
    readySettled: false,
  });

  const invalidated = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete stale-measurement fixture");
    }

    const zeroMeasurement = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 0 && borderBox.blockSize === 0) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    target.style.display = "none";
    await zeroMeasurement;
    const staleFrameId = window.staleFrameIds?.[0];
    const staleCallback =
      staleFrameId === undefined ? undefined : window.staleFrameCallbacks?.get(staleFrameId);
    if (staleCallback === undefined) {
      throw new Error("missing captured stale frame");
    }
    staleCallback(performance.now());
    await Promise.resolve();

    return {
      cancelledFrameIds: window.staleCancelledFrameIds,
      status: controller.status(),
      sameSnapshot: controller.snapshot() === window.staleInitialSnapshot,
      sameExport: controller.toSVG() === window.staleInitialExport,
      sameOverlay:
        target.querySelector(":scope > svg[data-gate-frame-overlay]") ===
        window.staleInitialOverlay,
      dimensions: controller.snapshot()?.geometry.dimensions,
      readySettled: window.staleReadySettled,
    };
  });

  expect(invalidated).toEqual({
    cancelledFrameIds: [1],
    status: { state: "pending" },
    sameSnapshot: true,
    sameExport: true,
    sameOverlay: true,
    dimensions: { width: 298, height: 340 },
    readySettled: false,
  });

  const revealed = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }

    const nonzeroMeasurement = new Promise<void>((resolve) => {
      const measurementObserver = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 420 && borderBox.blockSize === 400) {
          measurementObserver.disconnect();
          resolve();
        }
      });
      measurementObserver.observe(target, { box: "border-box" });
    });

    target.style.display = "block";
    await nonzeroMeasurement;
    return {
      frameIds: window.staleFrameIds,
      cancelledFrameIds: window.staleCancelledFrameIds,
      status: window.gateFrameController?.status(),
      readySettled: window.staleReadySettled,
    };
  });

  expect(revealed).toEqual({
    frameIds: [1, 2],
    cancelledFrameIds: [1],
    status: { state: "pending" },
    readySettled: false,
  });

  const recovered = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const recoveryFrameId = window.staleFrameIds?.at(-1);
    const recoveryCallback =
      recoveryFrameId === undefined ? undefined : window.staleFrameCallbacks?.get(recoveryFrameId);
    if (target === null || controller === undefined || recoveryCallback === undefined) {
      throw new Error("incomplete stale-measurement recovery fixture");
    }

    recoveryCallback(performance.now());
    const readySnapshot = await window.staleReadyPromise;
    const currentSnapshot = controller.snapshot();
    return {
      status: controller.status().state,
      readySnapshotIsCurrent: readySnapshot === currentSnapshot,
      readyCallbackSnapshotIsCurrent: window.staleReadySnapshot === currentSnapshot,
      readySettled: window.staleReadySettled,
      dimensions: currentSnapshot?.geometry.dimensions,
      exportHasCurrentDimensions: controller.toSVG().includes('width="418" height="398"'),
      overlayReplaced:
        target.querySelector(":scope > svg[data-gate-frame-overlay]") !==
        window.staleInitialOverlay,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(recovered).toEqual({
    status: "ready",
    readySnapshotIsCurrent: true,
    readyCallbackSnapshotIsCurrent: true,
    readySettled: true,
    dimensions: { width: 418, height: 398 },
    exportHasCurrentDimensions: true,
    overlayReplaced: true,
    overlayCount: 1,
  });
});
