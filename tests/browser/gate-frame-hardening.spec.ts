import { expect, test } from "@playwright/test";

interface HardeningController {
  whenReady(): Promise<{ readonly seed: string | number }>;
  destroy(): void;
}

test("mounts the first supported HTMLElement matching a document selector", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const first = document.querySelector<HTMLElement>("#target");
    if (first === null) {
      throw new Error("missing #target fixture");
    }

    first.classList.add("selector-target");
    const second = first.cloneNode(true) as HTMLElement;
    second.id = "second-target";
    second.classList.add("selector-target");
    first.after(second);

    const gateFrame = window.gateFramePackage.gateFrame as unknown as (
      target: HTMLElement | string,
      options?: { readonly seed?: string | number },
    ) => HardeningController;
    const controller = gateFrame(".selector-target", { seed: "selector-first" });
    const snapshot = await controller.whenReady();

    return {
      seed: snapshot.seed,
      firstOverlayCount: first.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      secondOverlayCount: second.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(result).toEqual({ seed: "selector-first", firstOverlayCount: 1, secondOverlayCount: 0 });
});

test("reports malformed selectors as INVALID_SELECTOR", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const error = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (target: string) => unknown;
    try {
      gateFrame("[");
      throw new Error("expected malformed selector to fail");
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFrameInvalidSelectorError;
      return {
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
        contextFrozen:
          cause instanceof Error &&
          "context" in cause &&
          typeof cause.context === "object" &&
          cause.context !== null &&
          Object.isFrozen(cause.context),
        context: cause instanceof Error && "context" in cause ? cause.context : null,
      };
    }
  });

  expect(error).toEqual({
    code: "INVALID_SELECTOR",
    name: "GateFrameInvalidSelectorError",
    isBase: true,
    isSpecific: true,
    contextFrozen: true,
    context: { selector: "[" },
  });
});

test("reports missing selectors as TARGET_NOT_FOUND", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const error = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (target: string) => unknown;
    try {
      gateFrame("#does-not-exist");
      throw new Error("expected missing selector to fail");
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFrameTargetNotFoundError;
      return {
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
        contextFrozen:
          cause instanceof Error &&
          "context" in cause &&
          typeof cause.context === "object" &&
          cause.context !== null &&
          Object.isFrozen(cause.context),
        context: cause instanceof Error && "context" in cause ? cause.context : null,
      };
    }
  });

  expect(error).toEqual({
    code: "TARGET_NOT_FOUND",
    name: "GateFrameTargetNotFoundError",
    isBase: true,
    isSpecific: true,
    contextFrozen: true,
    context: { selector: "#does-not-exist" },
  });
});

test("reports selector and direct SVG targets as TARGET_NOT_HTML_ELEMENT", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const errors = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (target: Element | string) => unknown;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "svg-target";
    document.body.append(svg);

    return ["selector", "direct"].map((source) => {
      try {
        gateFrame(source === "selector" ? "#svg-target" : svg);
        throw new Error("expected SVG target to fail");
      } catch (cause) {
        const base = packageRecord.GateFrameError;
        const specific = packageRecord.GateFrameTargetNotHTMLElementError;
        return {
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          name: cause instanceof Error ? cause.name : null,
          isBase:
            typeof base === "function" &&
            cause instanceof (base as new (...args: never[]) => Error),
          isSpecific:
            typeof specific === "function" &&
            cause instanceof (specific as new (...args: never[]) => Error),
          contextFrozen:
            cause instanceof Error &&
            "context" in cause &&
            typeof cause.context === "object" &&
            cause.context !== null &&
            Object.isFrozen(cause.context),
          context: cause instanceof Error && "context" in cause ? cause.context : null,
        };
      }
    });
  });

  expect(errors).toEqual([
    {
      code: "TARGET_NOT_HTML_ELEMENT",
      name: "GateFrameTargetNotHTMLElementError",
      isBase: true,
      isSpecific: true,
      contextFrozen: true,
      context: { source: "selector", selector: "#svg-target", tagName: "svg" },
    },
    {
      code: "TARGET_NOT_HTML_ELEMENT",
      name: "GateFrameTargetNotHTMLElementError",
      isBase: true,
      isSpecific: true,
      contextFrozen: true,
      context: { source: "direct", tagName: "svg" },
    },
  ]);
});

test("reports direct null and undefined targets without dereferencing them", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const errors = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (target: unknown) => unknown;
    const values = [
      { name: "null", value: null },
      { name: "undefined", value: undefined },
    ] as const;

    return values.map(({ name, value }) => {
      try {
        gateFrame(value);
        throw new Error(`expected direct ${name} target to fail`);
      } catch (cause) {
        const base = packageRecord.GateFrameError;
        const specific = packageRecord.GateFrameTargetNotHTMLElementError;
        return {
          name,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          errorName: cause instanceof Error ? cause.name : null,
          isBase:
            typeof base === "function" &&
            cause instanceof (base as new (...args: never[]) => Error),
          isSpecific:
            typeof specific === "function" &&
            cause instanceof (specific as new (...args: never[]) => Error),
          contextFrozen:
            cause instanceof Error &&
            "context" in cause &&
            typeof cause.context === "object" &&
            cause.context !== null &&
            Object.isFrozen(cause.context),
          context: cause instanceof Error && "context" in cause ? cause.context : null,
        };
      }
    });
  });

  expect(errors).toEqual([
    {
      name: "null",
      code: "TARGET_NOT_HTML_ELEMENT",
      errorName: "GateFrameTargetNotHTMLElementError",
      isBase: true,
      isSpecific: true,
      contextFrozen: true,
      context: { source: "direct", valueType: "null" },
    },
    {
      name: "undefined",
      code: "TARGET_NOT_HTML_ELEMENT",
      errorName: "GateFrameTargetNotHTMLElementError",
      isBase: true,
      isSpecific: true,
      contextFrozen: true,
      context: { source: "direct", valueType: "undefined" },
    },
  ]);
});

test("supports a direct element inside an open shadow root without extending selector search", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement | string,
      options?: { readonly seed?: string },
    ) => HardeningController;
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const target = document.createElement("section");
    target.className = "shadow-target";
    target.style.cssText =
      "box-sizing:border-box;display:block;position:relative;width:300px;height:340px;padding:120px 32px 32px";
    const content = document.createElement("span");
    target.append(content);
    root.append(target);
    document.body.append(host);

    let selectorCode: unknown = null;
    try {
      gateFrame(".shadow-target");
    } catch (cause) {
      selectorCode = cause instanceof Error && "code" in cause ? cause.code : null;
    }
    const controller = gateFrame(target, { seed: "direct-shadow-child" });
    const snapshot = await controller.whenReady();
    return {
      selectorCode,
      directSeed: snapshot.seed,
      contentStayedPut: content.parentNode === target,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(result).toEqual({
    selectorCode: "TARGET_NOT_FOUND",
    directSeed: "direct-shadow-child",
    contentStayedPut: true,
    overlayCount: 1,
  });
});

test("reports duplicate active mounts as ALREADY_MOUNTED and permits remount after destroy", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options?: { readonly seed?: string },
    ) => HardeningController & { destroy(): void };
    const first = gateFrame(target, { seed: "first-mount" });

    let duplicate: Record<string, unknown>;
    try {
      gateFrame(target, { seed: "duplicate-mount" });
      throw new Error("expected duplicate mount to fail");
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFrameAlreadyMountedError;
      duplicate = {
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
        context: cause instanceof Error && "context" in cause ? cause.context : null,
      };
    }

    await first.whenReady();
    first.destroy();
    const remounted = gateFrame(target, { seed: "remounted" });
    const snapshot = await remounted.whenReady();
    return {
      duplicate,
      remountedSeed: snapshot.seed,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(result).toEqual({
    duplicate: {
      code: "ALREADY_MOUNTED",
      name: "GateFrameAlreadyMountedError",
      isBase: true,
      isSpecific: true,
      context: { tagName: "div" },
    },
    remountedSeed: "remounted",
    overlayCount: 1,
  });
});

test("mounts representative supported target contexts in place", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const results = await page.evaluate(async () => {
    const gateFrame = window.gateFramePackage.gateFrame as unknown as (
      target: HTMLElement,
      options?: { readonly seed?: string },
    ) => HardeningController;
    const cases = [
      { name: "block", tagName: "div", css: "display:block;position:relative" },
      { name: "inline-block", tagName: "article", css: "display:inline-block;position:relative" },
      { name: "flex", tagName: "section", css: "display:flex;position:relative" },
      { name: "grid", tagName: "aside", css: "display:grid;position:relative" },
      {
        name: "transformed",
        tagName: "div",
        css: "display:block;position:relative;transform:translateX(2px)",
      },
      {
        name: "overflow-hidden",
        tagName: "section",
        css: "display:block;position:relative;overflow:hidden",
      },
      { name: "static", tagName: "article", css: "display:block;position:static" },
    ] as const;

    return Promise.all(
      cases.map(async ({ name, tagName, css }) => {
        const target = document.createElement(tagName);
        target.dataset.case = name;
        target.style.cssText = `${css};width:300px;height:340px;padding:120px 32px 32px`;
        const content = document.createElement("button");
        content.textContent = name;
        target.append(content);
        document.body.append(target);
        const originalParent = content.parentNode;
        const controller = gateFrame(target, { seed: name });
        await controller.whenReady();
        return {
          name,
          contentStayedPut: content.parentNode === originalParent && originalParent === target,
          overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
          inlinePosition: target.style.position,
        };
      }),
    );
  });

  expect(results).toEqual([
    { name: "block", contentStayedPut: true, overlayCount: 1, inlinePosition: "relative" },
    { name: "inline-block", contentStayedPut: true, overlayCount: 1, inlinePosition: "relative" },
    { name: "flex", contentStayedPut: true, overlayCount: 1, inlinePosition: "relative" },
    { name: "grid", contentStayedPut: true, overlayCount: 1, inlinePosition: "relative" },
    { name: "transformed", contentStayedPut: true, overlayCount: 1, inlinePosition: "relative" },
    {
      name: "overflow-hidden",
      contentStayedPut: true,
      overlayCount: 1,
      inlinePosition: "relative",
    },
    { name: "static", contentStayedPut: true, overlayCount: 1, inlinePosition: "relative" },
  ]);
});

test("rejects native elements whose content model cannot contain the owned SVG", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (target: HTMLElement) => HardeningController;
    const target = document.createElement("ul");
    target.style.cssText = "width:300px;height:340px;padding:120px 32px 32px";
    const content = document.createElement("li");
    content.textContent = "Existing content";
    target.append(content);
    document.body.append(target);
    const beforeStyle = target.getAttribute("style");
    const beforeChildren = Array.from(target.childNodes);

    try {
      gateFrame(target).destroy();
      return { returned: true };
    } catch (cause) {
      return {
        returned: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        context:
          cause instanceof Error && "context" in cause
            ? (cause.context as Record<string, unknown>)
            : null,
        unchanged:
          target.getAttribute("style") === beforeStyle &&
          target.childNodes.length === beforeChildren.length &&
          beforeChildren.every((child, index) => target.childNodes[index] === child),
      };
    }
  });

  expect(result).toEqual({
    returned: false,
    code: "UNSUPPORTED_TARGET",
    context: { tagName: "ul", reason: "content-model" },
    unchanged: true,
  });
});

test("rejects representative unsupported target categories before mutation", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const results = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
    ) => (HardeningController & { destroy(): void }) | undefined;
    const cases: Array<{ name: string; target: HTMLElement; reason: string }> = [];

    const image = document.createElement("img");
    cases.push({ name: "replaced", target: image, reason: "replaced-element" });
    const input = document.createElement("input");
    cases.push({ name: "form", target: input, reason: "restricted-form-control" });
    const cell = document.createElement("td");
    cases.push({ name: "table", target: cell, reason: "table-internal" });
    const inline = document.createElement("span");
    cases.push({ name: "inline", target: inline, reason: "display-inline" });
    const contents = document.createElement("div");
    contents.style.display = "contents";
    cases.push({ name: "contents", target: contents, reason: "display-contents" });
    const vertical = document.createElement("div");
    vertical.style.writingMode = "vertical-rl";
    cases.push({ name: "vertical", target: vertical, reason: "writing-mode" });
    const fragmented = document.createElement("div");
    fragmented.style.columnCount = "2";
    cases.push({ name: "fragmented", target: fragmented, reason: "fragmented" });
    const shadowHost = document.createElement("div");
    shadowHost.attachShadow({ mode: "open" });
    cases.push({ name: "shadow-host", target: shadowHost, reason: "shadow-host" });

    return cases.map(({ name, target, reason }) => {
      target.style.width = "300px";
      target.style.height = "340px";
      target.style.padding = "120px 32px 32px";
      const content = document.createTextNode(name);
      target.append(content);
      document.body.append(target);
      const beforeStyle = target.getAttribute("style");
      const beforeChildren = Array.from(target.childNodes);
      try {
        const controller = gateFrame(target);
        const unchangedBeforeCleanup =
          target.getAttribute("style") === beforeStyle &&
          target.childNodes.length === beforeChildren.length &&
          beforeChildren.every((child, index) => target.childNodes[index] === child);
        controller?.destroy();
        return { name, reason, returned: true, unchangedBeforeCleanup };
      } catch (cause) {
        const base = packageRecord.GateFrameError;
        const specific = packageRecord.GateFrameUnsupportedTargetError;
        return {
          name,
          reason,
          returned: false,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          errorName: cause instanceof Error ? cause.name : null,
          isBase:
            typeof base === "function" &&
            cause instanceof (base as new (...args: never[]) => Error),
          isSpecific:
            typeof specific === "function" &&
            cause instanceof (specific as new (...args: never[]) => Error),
          contextReason:
            cause instanceof Error &&
            "context" in cause &&
            typeof cause.context === "object" &&
            cause.context !== null &&
            "reason" in cause.context
              ? cause.context.reason
              : null,
          unchanged:
            target.getAttribute("style") === beforeStyle &&
            target.childNodes.length === beforeChildren.length &&
            beforeChildren.every((child, index) => target.childNodes[index] === child),
        };
      }
    });
  });

  for (const result of results) {
    expect(result, result.name).toMatchObject({
      name: result.name,
      reason: result.reason,
      returned: false,
      code: "UNSUPPORTED_TARGET",
      errorName: "GateFrameUnsupportedTargetError",
      isBase: true,
      isSpecific: true,
      contextReason: result.reason,
      unchanged: true,
    });
  }
});

test("rejects static targets with absolute descendants before mutation but accepts positioned targets", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options?: { readonly seed?: string },
    ) => HardeningController & { destroy(): void };
    const target = document.createElement("div");
    target.style.cssText =
      "display:block;position:static;width:300px;height:340px;padding:120px 32px 32px";
    const absolute = document.createElement("span");
    absolute.style.position = "absolute";
    target.append(absolute);
    document.body.append(target);
    const beforeStyle = target.getAttribute("style");
    let conflict: Record<string, unknown>;
    try {
      const unexpected = gateFrame(target);
      conflict = {
        returned: true,
        unchanged: target.getAttribute("style") === beforeStyle,
      };
      unexpected.destroy();
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFramePositioningConflictError;
      conflict = {
        returned: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
        context: cause instanceof Error && "context" in cause ? cause.context : null,
        unchanged: target.getAttribute("style") === beforeStyle,
      };
    }

    target.style.position = "relative";
    const positioned = gateFrame(target, { seed: "positioned" });
    const snapshot = await positioned.whenReady();
    return {
      conflict,
      positionedSeed: snapshot.seed,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(result).toEqual({
    conflict: {
      returned: false,
      code: "POSITIONING_CONFLICT",
      name: "GateFramePositioningConflictError",
      isBase: true,
      isSpecific: true,
      context: { tagName: "div", descendantTagName: "span" },
      unchanged: true,
    },
    positionedSeed: "positioned",
    overlayCount: 1,
  });
});

test("rejects invalid initial options synchronously without target or registry mutation", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const results = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options?: Record<string, unknown>,
    ) => HardeningController & { destroy(): void };
    const cases = [
      { name: "shape-range", options: { density: 1.1 } },
      { name: "unsafe-paint", options: { stroke: "url(https://example.invalid/paint)" } },
      { name: "responsive-type", options: { responsive: "yes" } },
      { name: "responsive-null", options: { responsive: null } },
    ] as const;

    return cases.map(({ name, options }) => {
      const target = document.createElement("div");
      target.style.cssText =
        "display:block;position:static;width:300px;height:340px;padding:120px 32px 32px";
      const content = document.createElement("span");
      target.append(content);
      document.body.append(target);
      const beforeStyle = target.getAttribute("style");
      const beforeChildren = Array.from(target.childNodes);
      try {
        const unexpected = gateFrame(target, options);
        const result = {
          name,
          returned: true,
          unchanged: target.getAttribute("style") === beforeStyle,
        };
        unexpected.destroy();
        return result;
      } catch (cause) {
        const base = packageRecord.GateFrameError;
        const specific = packageRecord.GateFrameInvalidOptionsError;
        const unchanged =
          target.getAttribute("style") === beforeStyle &&
          target.childNodes.length === beforeChildren.length &&
          beforeChildren.every((child, index) => target.childNodes[index] === child);
        let registryClean = false;
        try {
          const valid = gateFrame(target, { seed: `valid-after-${name}` });
          valid.destroy();
          registryClean = true;
        } catch {
          registryClean = false;
        }
        return {
          name,
          returned: false,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          errorName: cause instanceof Error ? cause.name : null,
          isBase:
            typeof base === "function" &&
            cause instanceof (base as new (...args: never[]) => Error),
          isSpecific:
            typeof specific === "function" &&
            cause instanceof (specific as new (...args: never[]) => Error),
          contextFrozen:
            cause instanceof Error &&
            "context" in cause &&
            typeof cause.context === "object" &&
            cause.context !== null &&
            Object.isFrozen(cause.context),
          unchanged,
          registryClean,
        };
      }
    });
  });

  for (const result of results) {
    expect(result, result.name).toMatchObject({
      name: result.name,
      returned: false,
      code: "INVALID_OPTIONS",
      errorName: "GateFrameInvalidOptionsError",
      isBase: true,
      isSpecific: true,
      contextFrozen: true,
      unchanged: true,
      registryClean: true,
    });
  }
});

test("applies the exact generation-v2 option category and key precedence", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options: Record<PropertyKey, unknown>,
    ) => {
      whenReady(): Promise<object>;
      snapshot(): object | null;
      status(): object;
      toSVG(): string;
      update(options: unknown): unknown;
      destroy(): void;
    };
    const capture = (action: () => unknown) => {
      try {
        action();
        return {
          returned: true,
          code: null,
          category: null,
          optionKeys: null,
          contextFrozen: false,
          optionKeysFrozen: false,
        };
      } catch (cause) {
        const context =
          cause instanceof Error && "context" in cause
            ? (cause.context as Readonly<Record<string, unknown>>)
            : null;
        return {
          returned: false,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          category: context?.category ?? null,
          optionKeys: context?.optionKeys ?? null,
          contextFrozen: context !== null && Object.isFrozen(context),
          optionKeysFrozen:
            context !== null && Array.isArray(context.optionKeys)
              ? Object.isFrozen(context.optionKeys)
              : false,
        };
      }
    };
    const createTarget = (): HTMLDivElement => {
      const target = document.createElement("div");
      target.style.cssText =
        "box-sizing:border-box;display:block;position:relative;width:300px;height:342px;padding:150px 40px 40px";
      document.body.append(target);
      return target;
    };

    const unknown = { generationVersion: 2, zeta: true } as Record<PropertyKey, unknown>;
    unknown[Symbol("beta")] = true;
    const initialCases: Array<{ name: string; options: Record<PropertyKey, unknown> }> = [
      { name: "unknown-key", options: unknown },
      {
        name: "responsive-before-family",
        options: { generationVersion: 2, responsive: "yes", family: "invalid" },
      },
      {
        name: "family-before-seed",
        options: { generationVersion: 2, family: "invalid", seed: Number.POSITIVE_INFINITY },
      },
      {
        name: "seed-before-value",
        options: { generationVersion: 2, seed: Number.POSITIVE_INFINITY, density: 2 },
      },
      { name: "null-seed", options: { generationVersion: 2, seed: null } },
      {
        name: "value-order",
        options: { generationVersion: 2, density: 2, curvature: 2 },
      },
      {
        name: "crest-before-paint",
        options: {
          generationVersion: 2,
          family: "arcade",
          crest: "fleur",
          stroke: "url(https://example.invalid/paint)",
        },
      },
      {
        name: "paint-order",
        options: {
          generationVersion: 2,
          family: "arcade",
          crest: "diamond",
          stroke: "url(https://example.invalid/stroke)",
          surface: "url(https://example.invalid/surface)",
        },
      },
    ];
    const initial = initialCases.map(({ name, options }) => {
      const target = createTarget();
      const outcome = capture(() => gateFrame(target, options));
      target.remove();
      return { name, ...outcome };
    });

    const target = createTarget();
    const controller = gateFrame(target, {
      generationVersion: 2,
      seed: "v2-oracle-update",
      family: "arcade",
      crest: "diamond",
    });
    await controller.whenReady();
    const snapshot = controller.snapshot();
    const status = controller.status();
    const standalone = controller.toSVG();
    const overlay = target.querySelector(":scope > svg[data-gate-frame-overlay]");
    const updateCases = [
      { name: "shape", options: null },
      { name: "responsive-before-version", options: { responsive: "yes", generationVersion: 4 } },
      { name: "version", options: { generationVersion: 4 } },
      { name: "seed-null", options: { seed: null } },
    ];
    const updates = updateCases.map(({ name, options }) => ({
      name,
      ...capture(() => controller.update(options)),
      atomic:
        controller.snapshot() === snapshot &&
        controller.status() === status &&
        controller.toSVG() === standalone &&
        target.querySelector(":scope > svg[data-gate-frame-overlay]") === overlay,
    }));
    controller.destroy();
    return { initial, updates };
  });

  expect(
    result.initial.map(({ name, category, optionKeys }) => ({ name, category, optionKeys })),
  ).toEqual([
    { name: "unknown-key", category: "unknown-key", optionKeys: ["Symbol(beta)", "zeta"] },
    { name: "responsive-before-family", category: "responsive", optionKeys: ["responsive"] },
    { name: "family-before-seed", category: "family", optionKeys: ["family"] },
    { name: "seed-before-value", category: "seed", optionKeys: ["seed"] },
    { name: "null-seed", category: "seed", optionKeys: ["seed"] },
    { name: "value-order", category: "value", optionKeys: ["density"] },
    { name: "crest-before-paint", category: "crest", optionKeys: ["crest"] },
    { name: "paint-order", category: "paint", optionKeys: ["stroke"] },
  ]);
  expect(
    result.updates.map(({ name, category, optionKeys, atomic }) => ({
      name,
      category,
      optionKeys,
      atomic,
    })),
  ).toEqual([
    { name: "shape", category: "shape", optionKeys: [], atomic: true },
    {
      name: "responsive-before-version",
      category: "responsive",
      optionKeys: ["responsive"],
      atomic: true,
    },
    { name: "version", category: "version", optionKeys: ["generationVersion"], atomic: true },
    { name: "seed-null", category: "seed", optionKeys: ["seed"], atomic: true },
  ]);
  for (const outcome of [...result.initial, ...result.updates]) {
    expect(outcome.returned, outcome.name).toBe(false);
    expect(outcome.code, outcome.name).toBe("INVALID_OPTIONS");
    expect(outcome.contextFrozen, outcome.name).toBe(true);
    expect(outcome.optionKeysFrozen, outcome.name).toBe(true);
  }
});

test("ignores inherited generation-v2 option values on mount and update", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) throw new Error("missing #target fixture");
    target.style.padding = "150px 40px 40px";

    const gateFrame = (window.gateFramePackage as unknown as Record<string, unknown>).gateFrame as (
      target: HTMLElement,
      options: Record<PropertyKey, unknown>,
    ) => {
      whenReady(): Promise<{
        generationVersion: number;
        geometry: { options: Record<string, unknown> };
      }>;
      update(options: Record<PropertyKey, unknown>): unknown;
      destroy(): void;
    };
    const initialOptions = Object.assign(
      Object.create({ family: "invalid", density: 2, responsive: "yes" }) as Record<
        PropertyKey,
        unknown
      >,
      { generationVersion: 2, seed: "own-values-only" },
    );
    const controller = gateFrame(target, initialOptions);
    const initial = await controller.whenReady();
    const updates = Object.assign(
      Object.create({ generationVersion: 3, density: 2, responsive: "yes" }) as Record<
        PropertyKey,
        unknown
      >,
      { sideComplexity: 0.8 },
    );
    controller.update(updates);
    const updated = await controller.whenReady();
    controller.destroy();
    return {
      initialVersion: initial.generationVersion,
      initialDensity: initial.geometry.options.density,
      updatedVersion: updated.generationVersion,
      updatedDensity: updated.geometry.options.density,
      updatedSideComplexity: updated.geometry.options.sideComplexity,
    };
  });

  expect(result).toEqual({
    initialVersion: 2,
    initialDensity: 0.55,
    updatedVersion: 2,
    updatedDensity: 0.55,
    updatedSideComplexity: 0.8,
  });
});

test("rejects invalid updates atomically without changing committed state or overlay identity", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options: Record<string, unknown>,
    ) => {
      status(): object;
      whenReady(): Promise<{
        readonly seed: string | number;
        readonly geometry: { readonly options: { readonly density: number } };
        readonly paint: { readonly stroke: string };
      }>;
      snapshot(): object | null;
      toSVG(): string;
      update(options: Record<string, unknown>): unknown;
    };
    const controller = gateFrame(target, {
      seed: "atomic-update",
      density: 0.7,
      stroke: "#123456",
    });
    const initialSnapshot = await controller.whenReady();
    const initialStatus = controller.status();
    const initialExport = controller.toSVG();
    const initialOverlay = target.querySelector(":scope > svg[data-gate-frame-overlay]");

    let error: Record<string, unknown>;
    try {
      controller.update({ density: 2 });
      error = { returned: true };
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFrameInvalidOptionsError;
      error = {
        returned: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
      };
    }

    const currentSnapshot = controller.snapshot();
    const atomicState = {
      error,
      sameSnapshot: currentSnapshot === initialSnapshot,
      sameStatus: controller.status() === initialStatus,
      sameExport: controller.toSVG() === initialExport,
      sameOverlay: target.querySelector(":scope > svg[data-gate-frame-overlay]") === initialOverlay,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      seed: initialSnapshot.seed,
      density: initialSnapshot.geometry.options.density,
      stroke: initialSnapshot.paint.stroke,
    };
    controller.update({
      seed: undefined,
      density: undefined,
      stroke: undefined,
      responsive: undefined,
    });
    const retried = await controller.whenReady();
    return {
      ...atomicState,
      retried: {
        seed: retried.seed,
        density: retried.geometry.options.density,
        stroke: retried.paint.stroke,
      },
    };
  });

  expect(result).toEqual({
    error: {
      returned: false,
      code: "INVALID_OPTIONS",
      name: "GateFrameInvalidOptionsError",
      isBase: true,
      isSpecific: true,
    },
    sameSnapshot: true,
    sameStatus: true,
    sameExport: true,
    sameOverlay: true,
    overlayCount: 1,
    seed: "atomic-update",
    density: 0.7,
    stroke: "#123456",
    retried: { seed: "atomic-update", density: 0.7, stroke: "#123456" },
  });
});

test("rejects unknown and planned option keys before initial mutation and atomically on update", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options?: Record<string, unknown>,
    ) => {
      status(): object;
      whenReady(): Promise<{
        readonly seed: string | number;
        readonly geometry: { readonly options: { readonly density: number } };
        readonly paint: { readonly stroke: string };
      }>;
      snapshot(): object | null;
      toSVG(): string;
      update(options: Record<string, unknown>): unknown;
      destroy(): void;
    };
    const initialCases = [
      { name: "unknown", options: { unknownOption: undefined } },
      { name: "planned", options: { symmetry: 1 } },
    ] as const;

    let entropyCalls = 0;
    const ownGetRandomValuesDescriptor = Object.getOwnPropertyDescriptor(crypto, "getRandomValues");
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: ArrayBufferView<ArrayBuffer>): ArrayBufferView<ArrayBuffer> => {
        entropyCalls += 1;
        return originalGetRandomValues(array);
      },
    });

    let initial: Array<Record<string, unknown>>;
    try {
      initial = initialCases.map(({ name, options }) => {
        const target = document.createElement("div");
        target.style.cssText =
          "box-sizing:border-box;display:block;position:static;width:300px;height:340px;padding:120px 32px 32px";
        const content = document.createElement("span");
        content.textContent = name;
        target.append(content);
        document.body.append(target);
        const beforeStyle = target.getAttribute("style");
        const beforeChildren = Array.from(target.childNodes);
        const entropyBefore = entropyCalls;
        let outcome: Record<string, unknown>;
        try {
          const unexpected = gateFrame(target, options);
          outcome = {
            returned: true,
            entropyCalls: entropyCalls - entropyBefore,
            unchanged:
              target.getAttribute("style") === beforeStyle &&
              target.childNodes.length === beforeChildren.length &&
              beforeChildren.every((child, index) => target.childNodes[index] === child),
          };
          unexpected.destroy();
        } catch (cause) {
          const specific = packageRecord.GateFrameInvalidOptionsError;
          const context =
            cause instanceof Error && "context" in cause
              ? (cause.context as Readonly<Record<string, unknown>>)
              : null;
          outcome = {
            returned: false,
            code: cause instanceof Error && "code" in cause ? cause.code : null,
            errorName: cause instanceof Error ? cause.name : null,
            isSpecific:
              typeof specific === "function" &&
              cause instanceof (specific as new (...args: never[]) => Error),
            context,
            contextFrozen: context !== null && Object.isFrozen(context),
            optionKeysFrozen:
              context !== null && Array.isArray(context.optionKeys)
                ? Object.isFrozen(context.optionKeys)
                : false,
            entropyCalls: entropyCalls - entropyBefore,
            unchanged:
              target.getAttribute("style") === beforeStyle &&
              target.childNodes.length === beforeChildren.length &&
              beforeChildren.every((child, index) => target.childNodes[index] === child),
          };
        }

        let registryClean = false;
        try {
          const valid = gateFrame(target, { seed: `valid-after-${name}` });
          valid.destroy();
          registryClean = true;
        } catch {
          registryClean = false;
        }
        return { name, ...outcome, registryClean };
      });
    } finally {
      if (ownGetRandomValuesDescriptor === undefined) {
        Reflect.deleteProperty(crypto, "getRandomValues");
      } else {
        Object.defineProperty(crypto, "getRandomValues", ownGetRandomValuesDescriptor);
      }
    }

    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    const controller = gateFrame(target, {
      seed: "unknown-update-atomicity",
      density: 0.7,
      stroke: "#123456",
    });
    const snapshot = await controller.whenReady();
    const status = controller.status();
    const standalone = controller.toSVG();
    const overlay = target.querySelector(":scope > svg[data-gate-frame-overlay]");
    const updateCases = [
      { name: "unknown", options: { unknownOption: undefined } },
      { name: "planned", options: { symmetry: 1 } },
    ] as const;
    const updates = updateCases.map(({ name, options }) => {
      let error: Record<string, unknown>;
      try {
        controller.update(options);
        error = { returned: true };
      } catch (cause) {
        const specific = packageRecord.GateFrameInvalidOptionsError;
        const context =
          cause instanceof Error && "context" in cause
            ? (cause.context as Readonly<Record<string, unknown>>)
            : null;
        error = {
          returned: false,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          errorName: cause instanceof Error ? cause.name : null,
          isSpecific:
            typeof specific === "function" &&
            cause instanceof (specific as new (...args: never[]) => Error),
          context,
          contextFrozen: context !== null && Object.isFrozen(context),
          optionKeysFrozen:
            context !== null && Array.isArray(context.optionKeys)
              ? Object.isFrozen(context.optionKeys)
              : false,
        };
      }
      return {
        name,
        ...error,
        sameSnapshot: controller.snapshot() === snapshot,
        sameStatus: controller.status() === status,
        sameExport: controller.toSVG() === standalone,
        sameOverlay: target.querySelector(":scope > svg[data-gate-frame-overlay]") === overlay,
        overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      };
    });

    controller.update({
      seed: undefined,
      density: undefined,
      stroke: undefined,
      responsive: undefined,
    });
    const knownUndefined = await controller.whenReady();
    controller.destroy();
    return {
      initial,
      updates,
      knownUndefined: {
        seed: knownUndefined.seed,
        density: knownUndefined.geometry.options.density,
        stroke: knownUndefined.paint.stroke,
      },
    };
  });

  expect(result.initial).toEqual([
    {
      name: "unknown",
      returned: false,
      code: "INVALID_OPTIONS",
      errorName: "GateFrameInvalidOptionsError",
      isSpecific: true,
      context: { optionKeys: ["unknownOption"], reason: "unsupported option keys" },
      contextFrozen: true,
      optionKeysFrozen: true,
      entropyCalls: 0,
      unchanged: true,
      registryClean: true,
    },
    {
      name: "planned",
      returned: false,
      code: "INVALID_OPTIONS",
      errorName: "GateFrameInvalidOptionsError",
      isSpecific: true,
      context: { optionKeys: ["symmetry"], reason: "unsupported option keys" },
      contextFrozen: true,
      optionKeysFrozen: true,
      entropyCalls: 0,
      unchanged: true,
      registryClean: true,
    },
  ]);
  expect(result.updates).toEqual([
    {
      name: "unknown",
      returned: false,
      code: "INVALID_OPTIONS",
      errorName: "GateFrameInvalidOptionsError",
      isSpecific: true,
      context: { optionKeys: ["unknownOption"], reason: "unsupported option keys" },
      contextFrozen: true,
      optionKeysFrozen: true,
      sameSnapshot: true,
      sameStatus: true,
      sameExport: true,
      sameOverlay: true,
      overlayCount: 1,
    },
    {
      name: "planned",
      returned: false,
      code: "INVALID_OPTIONS",
      errorName: "GateFrameInvalidOptionsError",
      isSpecific: true,
      context: { optionKeys: ["symmetry"], reason: "unsupported option keys" },
      contextFrozen: true,
      optionKeysFrozen: true,
      sameSnapshot: true,
      sameStatus: true,
      sameExport: true,
      sameOverlay: true,
      overlayCount: 1,
    },
  ]);
  expect(result.knownUndefined).toEqual({
    seed: "unknown-update-atomicity",
    density: 0.7,
    stroke: "#123456",
  });
});

test("rejects an invalid explicit randomize seed with the same atomic INVALID_OPTIONS contract", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options: { readonly seed: string },
    ) => {
      status(): object;
      whenReady(): Promise<object>;
      snapshot(): object | null;
      randomize(seed: number): unknown;
      toSVG(): string;
      destroy(): void;
    };
    const controller = gateFrame(target, { seed: "valid-before-randomize" });
    const snapshot = await controller.whenReady();
    const status = controller.status();
    const standalone = controller.toSVG();
    const overlay = target.querySelector(":scope > svg[data-gate-frame-overlay]");
    let error: Record<string, unknown>;
    try {
      controller.randomize(Number.POSITIVE_INFINITY);
      error = { returned: true };
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFrameInvalidOptionsError;
      error = {
        returned: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
      };
    }
    const atomic = {
      sameSnapshot: controller.snapshot() === snapshot,
      sameStatus: controller.status() === status,
      sameExport: controller.toSVG() === standalone,
      sameOverlay: target.querySelector(":scope > svg[data-gate-frame-overlay]") === overlay,
    };
    controller.destroy();
    return { error, atomic };
  });

  expect(result).toEqual({
    error: {
      returned: false,
      code: "INVALID_OPTIONS",
      name: "GateFrameInvalidOptionsError",
      isBase: true,
      isSpecific: true,
    },
    atomic: {
      sameSnapshot: true,
      sameStatus: true,
      sameExport: true,
      sameOverlay: true,
    },
  });
});

test("reclassifies pending targets before measurement acceptance and RAF commit", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  await page.evaluate(() => {
    const target = document.createElement("div");
    target.style.cssText =
      "box-sizing:border-box;display:none;position:relative;width:300px;height:340px;padding:120px 32px 32px";
    const content = document.createElement("span");
    content.textContent = "pending content";
    target.append(content);
    document.body.append(target);

    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "pending-classification",
    });
    window.gateFrameController = controller;
    window.originalGateFrameChildren = [content];
    (
      window as unknown as { hardeningReadyResult: Promise<Record<string, unknown>> }
    ).hardeningReadyResult = controller.whenReady().then(
      () => ({ resolved: true }),
      (cause: unknown) => ({
        resolved: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
      }),
    );
    target.style.display = "table";
  });

  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.status().state))
    .toBe("error");

  const rejectedMeasurement = await page.evaluate(async () => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const target = document.querySelector<HTMLElement>("div[style*='display: table']");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    if (target === null || controller === undefined || originalChildren === undefined) {
      throw new Error("incomplete pending classification fixture");
    }
    const status = controller.status() as unknown as {
      readonly state: string;
      readonly error: Error & {
        readonly code: string;
        readonly context: Readonly<Record<string, unknown>>;
      };
    };
    const specific = packageRecord.GateFrameUnsupportedTargetError;
    return {
      state: status.state,
      statusFrozen: Object.isFrozen(status),
      code: status.error.code,
      name: status.error.name,
      isSpecific:
        typeof specific === "function" &&
        status.error instanceof (specific as new (...args: never[]) => Error),
      context: status.error.context,
      contextFrozen: Object.isFrozen(status.error.context),
      readiness: await (
        window as unknown as { hardeningReadyResult: Promise<Record<string, unknown>> }
      ).hardeningReadyResult,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      contentIdentity: originalChildren[0] === target.firstChild,
    };
  });

  expect(rejectedMeasurement).toEqual({
    state: "error",
    statusFrozen: true,
    code: "UNSUPPORTED_TARGET",
    name: "GateFrameUnsupportedTargetError",
    isSpecific: true,
    context: { tagName: "div", reason: "unsupported-display", display: "table" },
    contextFrozen: true,
    readiness: {
      resolved: false,
      code: "UNSUPPORTED_TARGET",
      name: "GateFrameUnsupportedTargetError",
    },
    overlayCount: 0,
    contentIdentity: true,
  });

  const recoveredMeasurement = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("div[style*='display: table']");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    if (target === null || controller === undefined || originalChildren === undefined) {
      throw new Error("incomplete pending classification recovery fixture");
    }
    target.style.display = "block";
    controller.update({});
    const snapshot = await controller.whenReady();
    return {
      seed: snapshot.seed,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      contentIdentity: originalChildren[0] === target.firstChild,
    };
  });
  expect(recoveredMeasurement).toEqual({
    seed: "pending-classification",
    overlayCount: 1,
    contentIdentity: true,
  });

  const rejectedCommit = await page.evaluate(async () => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const target = document.querySelector<HTMLElement>("div[style*='display: block']");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete RAF classification fixture");
    }

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    let queuedFrame: FrameRequestCallback | null = null;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      queuedFrame = callback;
      return 1_000_001;
    };
    try {
      controller.update({});
      const readiness = controller.whenReady().then(
        () => ({ resolved: true }),
        (cause: unknown) => ({
          resolved: false,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          name: cause instanceof Error ? cause.name : null,
        }),
      );
      target.style.display = "inline";
      if (queuedFrame === null) {
        throw new Error("expected update to queue an animation frame");
      }
      (queuedFrame as FrameRequestCallback)(performance.now());

      const status = controller.status() as unknown as {
        readonly state: string;
        readonly error: Error & {
          readonly code: string;
          readonly context: Readonly<Record<string, unknown>>;
        };
      };
      const specific = packageRecord.GateFrameUnsupportedTargetError;
      return {
        state: status.state,
        statusFrozen: Object.isFrozen(status),
        code: status.error.code,
        name: status.error.name,
        isSpecific:
          typeof specific === "function" &&
          status.error instanceof (specific as new (...args: never[]) => Error),
        context: status.error.context,
        contextFrozen: Object.isFrozen(status.error.context),
        readiness: await readiness,
        overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      };
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  expect(rejectedCommit).toEqual({
    state: "error",
    statusFrozen: true,
    code: "UNSUPPORTED_TARGET",
    name: "GateFrameUnsupportedTargetError",
    isSpecific: true,
    context: { tagName: "div", reason: "display-inline", display: "inline" },
    contextFrozen: true,
    readiness: {
      resolved: false,
      code: "UNSUPPORTED_TARGET",
      name: "GateFrameUnsupportedTargetError",
    },
    overlayCount: 0,
  });

  const recoveredCommit = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("div[style*='display: inline']");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    if (target === null || controller === undefined || originalChildren === undefined) {
      throw new Error("incomplete RAF classification recovery fixture");
    }
    target.style.display = "block";
    controller.update({});
    await controller.whenReady();
    const result = {
      state: controller.status().state,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      contentIdentity: originalChildren[0] === target.firstChild,
    };
    controller.destroy();
    return result;
  });

  expect(recoveredCommit).toEqual({ state: "ready", overlayCount: 1, contentIdentity: true });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(pageErrors).toEqual([]);
});

test("publishes UNSUPPORTED_DIMENSIONS without an overlay and recovers on supported resize", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    target.style.width = "120px";
    target.style.height = "200px";
    target.style.padding = "40px";
    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "dimension-recovery",
    });
    window.gateFrameController = controller;
    (
      window as unknown as { hardeningReadyResult: Promise<Record<string, unknown>> }
    ).hardeningReadyResult = controller.whenReady().then(
      () => ({ resolved: true }),
      (cause: unknown) => ({
        resolved: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
      }),
    );
  });

  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.status().state))
    .toBe("error");

  const failed = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete dimension error fixture");
    }
    const status = controller.status() as unknown as {
      readonly state: string;
      readonly error?: Error & {
        readonly code: string;
        readonly context: Record<string, unknown>;
      };
    };
    const readiness = await (
      window as unknown as { hardeningReadyResult: Promise<Record<string, unknown>> }
    ).hardeningReadyResult;
    return {
      state: status.state,
      statusFrozen: Object.isFrozen(status),
      code: status.error?.code,
      name: status.error?.name,
      context: status.error?.context,
      contextFrozen: status.error === undefined ? false : Object.isFrozen(status.error.context),
      dimensionsFrozen:
        status.error?.context.dimensions !== null &&
        typeof status.error?.context.dimensions === "object" &&
        Object.isFrozen(status.error.context.dimensions),
      readiness,
      snapshot: controller.snapshot(),
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });

  expect(failed).toEqual({
    state: "error",
    statusFrozen: true,
    code: "UNSUPPORTED_DIMENSIONS",
    name: "GateFrameUnsupportedDimensionsError",
    context: { dimensions: { width: 118, height: 198 } },
    contextFrozen: true,
    dimensionsFrozen: true,
    readiness: {
      resolved: false,
      code: "UNSUPPORTED_DIMENSIONS",
      name: "GateFrameUnsupportedDimensionsError",
    },
    snapshot: null,
    overlayCount: 0,
  });

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    target.style.width = "300px";
    target.style.height = "342px";
    target.style.padding = "120px 32px 32px";
  });

  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.status().state))
    .toBe("ready");

  const recovered = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    if (target === null || controller === undefined) {
      throw new Error("incomplete dimension recovery fixture");
    }
    return {
      dimensions: controller.snapshot()?.geometry.dimensions,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
    };
  });
  expect(recovered).toEqual({ dimensions: { width: 298, height: 340 }, overlayCount: 1 });
});

test("reports exact insufficient physical padding and recovers after CSS correction plus update", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    target.style.padding = "20px";
    window.originalGateFrameChildren = Array.from(target.children);
    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "padding-recovery",
    });
    window.gateFrameController = controller;
    (
      window as unknown as { hardeningReadyResult: Promise<Record<string, unknown>> }
    ).hardeningReadyResult = controller.whenReady().then(
      () => ({ resolved: true }),
      (cause: unknown) => ({
        resolved: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
      }),
    );
  });

  await expect
    .poll(() => page.evaluate(() => window.gateFrameController?.status().state))
    .toBe("error");

  const failed = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    if (target === null || controller === undefined || originalChildren === undefined) {
      throw new Error("incomplete padding error fixture");
    }
    const status = controller.status() as unknown as {
      readonly state: string;
      readonly error?: Error & {
        readonly code: string;
        readonly context: Record<string, unknown>;
      };
    };
    return {
      code: status.error?.code,
      name: status.error?.name,
      context: status.error?.context,
      contextFrozen: status.error === undefined ? false : Object.isFrozen(status.error.context),
      measuredFrozen:
        status.error?.context.measured !== null &&
        typeof status.error?.context.measured === "object" &&
        Object.isFrozen(status.error.context.measured),
      requiredFrozen:
        status.error?.context.required !== null &&
        typeof status.error?.context.required === "object" &&
        Object.isFrozen(status.error.context.required),
      readiness: await (
        window as unknown as { hardeningReadyResult: Promise<Record<string, unknown>> }
      ).hardeningReadyResult,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      contentIdentity: originalChildren.every((child, index) => target.children[index] === child),
    };
  });

  expect(failed).toEqual({
    code: "INSUFFICIENT_CONTENT_SPACE",
    name: "GateFrameInsufficientSpaceError",
    context: {
      measured: { top: 20, right: 20, bottom: 20, left: 20 },
      required: { top: 111.38, right: 26.88, bottom: 26.88, left: 26.88 },
    },
    contextFrozen: true,
    measuredFrozen: true,
    requiredFrozen: true,
    readiness: {
      resolved: false,
      code: "INSUFFICIENT_CONTENT_SPACE",
      name: "GateFrameInsufficientSpaceError",
    },
    overlayCount: 0,
    contentIdentity: true,
  });

  const recovered = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    const controller = window.gateFrameController;
    const originalChildren = window.originalGateFrameChildren;
    if (target === null || controller === undefined || originalChildren === undefined) {
      throw new Error("incomplete padding recovery fixture");
    }
    target.style.padding = "112px 27px 27px";
    controller.update({});
    await controller.whenReady();
    return {
      state: controller.status().state,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      contentIdentity: originalChildren.every((child, index) => target.children[index] === child),
    };
  });

  expect(recovered).toEqual({ state: "ready", overlayCount: 1, contentIdentity: true });
});

test("returns a null snapshot and throws NOT_READY before the first commit", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(() => {
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options?: { readonly seed?: string },
    ) => {
      snapshot(): object | null;
      toSVG(): string;
      destroy(): void;
    };
    const detached = document.createElement("div");
    const controller = gateFrame(detached, { seed: "not-ready" });
    const snapshot = controller.snapshot();
    let error: Record<string, unknown>;
    try {
      controller.toSVG();
      error = { returned: true };
    } catch (cause) {
      const base = packageRecord.GateFrameError;
      const specific = packageRecord.GateFrameNotReadyError;
      error = {
        returned: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
        isBase:
          typeof base === "function" && cause instanceof (base as new (...args: never[]) => Error),
        isSpecific:
          typeof specific === "function" &&
          cause instanceof (specific as new (...args: never[]) => Error),
        context: cause instanceof Error && "context" in cause ? cause.context : null,
      };
    }
    controller.destroy();
    return { snapshot, error };
  });

  expect(result).toEqual({
    snapshot: null,
    error: {
      returned: false,
      code: "NOT_READY",
      name: "GateFrameNotReadyError",
      isBase: true,
      isSpecific: true,
      context: {},
    },
  });
});

test("cleans up reversibly after move or detach and preserves later user position changes", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const gateFrame = window.gateFramePackage.gateFrame as unknown as (
      target: HTMLElement,
      options?: { readonly seed?: string },
    ) => HardeningController & { destroy(): void };
    const createTarget = (): HTMLDivElement => {
      const target = document.createElement("div");
      target.style.cssText =
        "display:block;position:static !important;width:300px;height:340px;padding:120px 32px 32px";
      target.append(document.createElement("span"));
      document.body.append(target);
      return target;
    };

    const moved = createTarget();
    const movedController = gateFrame(moved, { seed: "moved-cleanup" });
    await movedController.whenReady();
    const destination = document.createElement("section");
    document.body.append(destination);
    destination.append(moved);
    movedController.destroy();
    movedController.destroy();

    const detached = createTarget();
    const detachedController = gateFrame(detached, { seed: "detached-cleanup" });
    await detachedController.whenReady();
    const ownedOverlay = detached.querySelector(":scope > svg[data-gate-frame-overlay]");
    const unownedOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    unownedOverlay.setAttribute("data-gate-frame-overlay", "user-owned");
    detached.append(unownedOverlay);
    detached.remove();
    detached.style.setProperty("position", "absolute", "important");
    detachedController.destroy();
    detachedController.destroy();

    return {
      moved: {
        position: moved.style.getPropertyValue("position"),
        priority: moved.style.getPropertyPriority("position"),
        parentIsDestination: moved.parentElement === destination,
        overlayCount: moved.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      },
      detached: {
        position: detached.style.getPropertyValue("position"),
        priority: detached.style.getPropertyPriority("position"),
        isConnected: detached.isConnected,
        ownedRemoved: ownedOverlay?.parentNode === null,
        unownedPreserved: unownedOverlay.parentNode === detached,
      },
    };
  });

  expect(result).toEqual({
    moved: {
      position: "static",
      priority: "important",
      parentIsDestination: true,
      overlayCount: 0,
    },
    detached: {
      position: "absolute",
      priority: "important",
      isConnected: false,
      ownedRemoved: true,
      unownedPreserved: true,
    },
  });
});

test("cancels pending ownership work and enforces DESTROYED on every post-destroy API", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  const result = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    const packageRecord = window.gateFramePackage as unknown as Record<string, unknown>;
    const gateFrame = packageRecord.gateFrame as (
      target: HTMLElement,
      options?: Record<string, unknown>,
    ) => {
      status(): object;
      whenReady(): Promise<object>;
      update(options: Record<string, unknown>): unknown;
      randomize(seed?: string): unknown;
      snapshot(): object | null;
      toSVG(): string;
      destroy(): void;
    };
    const controller = gateFrame(target, { seed: "destroyed-surface" });
    await controller.whenReady();

    const frameCallbacks = new Map<number, FrameRequestCallback>();
    const frameIds: number[] = [];
    const cancelledFrameIds: number[] = [];
    let nextFrameId = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = ++nextFrameId;
      frameIds.push(id);
      frameCallbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      cancelledFrameIds.push(id);
    };

    controller.update({ density: 0.6 });
    const activeWaiter = controller.whenReady().then(
      () => ({ resolved: true }),
      (cause: unknown) => ({
        resolved: false,
        code: cause instanceof Error && "code" in cause ? cause.code : null,
        name: cause instanceof Error ? cause.name : null,
      }),
    );
    const unownedOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    unownedOverlay.setAttribute("data-gate-frame-overlay", "unowned");
    target.append(unownedOverlay);
    controller.destroy();
    controller.destroy();
    frameCallbacks.get(1)?.(performance.now());

    const resized = new Promise<void>((resolve) => {
      const measurement = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === target);
        const borderBox = Array.isArray(entry?.borderBoxSize)
          ? entry.borderBoxSize[0]
          : entry?.borderBoxSize;
        if (borderBox?.inlineSize === 360) {
          measurement.disconnect();
          resolve();
        }
      });
      measurement.observe(target, { box: "border-box" });
    });
    target.style.width = "360px";
    await resized;

    const describeDestroyed = async (
      label: string,
      invoke: () => unknown | Promise<unknown>,
    ): Promise<Record<string, unknown>> => {
      try {
        await invoke();
        return { label, returned: true };
      } catch (cause) {
        const base = packageRecord.GateFrameError;
        const specific = packageRecord.GateFrameDestroyedError;
        return {
          label,
          returned: false,
          code: cause instanceof Error && "code" in cause ? cause.code : null,
          name: cause instanceof Error ? cause.name : null,
          isBase:
            typeof base === "function" &&
            cause instanceof (base as new (...args: never[]) => Error),
          isSpecific:
            typeof specific === "function" &&
            cause instanceof (specific as new (...args: never[]) => Error),
        };
      }
    };

    const errors = await Promise.all([
      describeDestroyed("update", () => controller.update({})),
      describeDestroyed("randomize", () => controller.randomize("after-destroy")),
      describeDestroyed("snapshot", () => controller.snapshot()),
      describeDestroyed("toSVG", () => controller.toSVG()),
      describeDestroyed("whenReady", () => controller.whenReady()),
    ]);
    const status = controller.status();
    return {
      activeWaiter: await activeWaiter,
      errors,
      status,
      statusFrozen: Object.isFrozen(status),
      frameIds,
      cancelledFrameIds,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay='']").length,
      unownedPreserved: unownedOverlay.parentNode === target,
    };
  });

  expect(result.activeWaiter).toEqual({
    resolved: false,
    code: "DESTROYED",
    name: "GateFrameDestroyedError",
  });
  for (const error of result.errors) {
    expect(error, String(error.label)).toMatchObject({
      returned: false,
      code: "DESTROYED",
      name: "GateFrameDestroyedError",
      isBase: true,
      isSpecific: true,
    });
  }
  expect(result).toMatchObject({
    status: { state: "destroyed" },
    statusFrozen: true,
    frameIds: [1],
    cancelledFrameIds: [1],
    overlayCount: 0,
    unownedPreserved: true,
  });
});

test("preserves focus, pointer, identity, and the observable accessibility tree", async ({
  page,
}, testInfo) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => typeof window.gateFramePackage === "object");

  await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    target.replaceChildren();
    const button = document.createElement("button");
    button.id = "hardening-button";
    button.textContent = "Action";
    const link = document.createElement("a");
    link.id = "hardening-link";
    link.href = "#destination";
    link.textContent = "Destination";
    target.append(button, link);
    (window as unknown as { hardeningContentNodes: Node[] }).hardeningContentNodes = [button, link];
    (window as unknown as { hardeningClickCount: number }).hardeningClickCount = 0;
    button.addEventListener("click", () => {
      (window as unknown as { hardeningClickCount: number }).hardeningClickCount += 1;
    });
    const controller = window.gateFramePackage.gateFrame(target, {
      seed: "interaction-accessibility",
    });
    window.gateFrameController = controller;
    await controller.whenReady();
  });

  const button = page.getByRole("button", { name: "Action" });
  const link = page.getByRole("link", { name: "Destination" });
  await expect(button).toHaveCount(1);
  await expect(link).toHaveCount(1);
  await expect(page.getByRole("img")).toHaveCount(0);
  const ariaTree = await page.locator("#target").ariaSnapshot();
  expect(ariaTree).toContain('button "Action"');
  expect(ariaTree).toContain('link "Destination"');
  expect(ariaTree).not.toContain("svg");

  const tabKey = testInfo.project.name === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(tabKey);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("hardening-button");
  await page.keyboard.press(tabKey);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("hardening-link");

  const box = await button.boundingBox();
  if (box === null) {
    throw new Error("missing button box");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const observed = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#target");
    const contentNodes = (window as unknown as { hardeningContentNodes: Node[] })
      .hardeningContentNodes;
    if (target === null) {
      throw new Error("missing #target fixture");
    }
    return {
      clickCount: (window as unknown as { hardeningClickCount: number }).hardeningClickCount,
      overlayCount: target.querySelectorAll(":scope > svg[data-gate-frame-overlay]").length,
      contentStayedPut: contentNodes.every((node) => node.parentNode === target),
      activeElementIsOverlay:
        document.activeElement instanceof SVGElement &&
        document.activeElement.hasAttribute("data-gate-frame-overlay"),
    };
  });

  expect(observed).toEqual({
    clickCount: 1,
    overlayCount: 1,
    contentStayedPut: true,
    activeElementIsOverlay: false,
  });
});
