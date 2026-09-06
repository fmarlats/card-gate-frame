import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "4173");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  ...(process.env.CI ? { workers: 1 } : {}),
  use: {
    baseURL,
  },
  webServer: {
    command: "pnpm build && node tests/browser/server.mjs",
    url: `${baseURL}/tests/browser/fixture.html`,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
