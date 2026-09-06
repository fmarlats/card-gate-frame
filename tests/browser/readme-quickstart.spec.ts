import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

const fencedBlock = (language: "html" | "css"): string => {
  const match = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``).exec(readme);
  if (match?.[1] === undefined) {
    throw new Error(`README is missing its first ${language} quick-start block`);
  }
  return match[1];
};

for (const width of [320, 1280, 1920]) {
  test(`runs the documented browser quick start without ambient CSS at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/tests/browser/fixture.html");
    await page.waitForFunction(() => typeof window.gateFramePackage === "object");

    const result = await page.evaluate(
      async ({ css, html }) => {
        for (const style of document.querySelectorAll("style")) style.remove();
        document.body.innerHTML = html;
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);

        const controller = window.gateFramePackage.gateFrame(
          document.querySelector<HTMLElement>("#card") as HTMLElement,
          {
            seed: "lyon-42",
            family: "courtyard",
            density: 0.58,
            curvature: 0.72,
            stroke: "#20221e",
            surface: "rgba(143, 119, 79, 0.12)",
          },
        );

        try {
          const snapshot = await controller.whenReady();
          return {
            state: controller.status().state,
            generationVersion: snapshot.generationVersion,
            overlayCount: document.querySelectorAll("#card > svg[data-gate-frame-overlay]").length,
          };
        } catch (error) {
          return {
            state: controller.status().state,
            errorCode: error instanceof Error && "code" in error ? error.code : null,
            overlayCount: document.querySelectorAll("#card > svg[data-gate-frame-overlay]").length,
          };
        } finally {
          controller.destroy();
        }
      },
      { css: fencedBlock("css"), html: fencedBlock("html") },
    );

    expect(result).toEqual({ state: "ready", generationVersion: 1, overlayCount: 1 });
  });
}
