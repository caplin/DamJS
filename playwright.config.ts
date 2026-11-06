import { defineConfig, devices } from "@playwright/test";

const damJSPort = Number(process.env.DAMJS_PORT || 8125);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // The app under test (a running fxtrader / FX Pro instance).
    baseURL: process.env.FXTRADER_URL || "http://localhost:8080",
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } }],
  // Serves this repo so the bookmarklet can load index.js / AMD modules from it,
  // exactly as it would from https://caplin.github.io/DamJS.
  webServer: {
    command: `python3 -m http.server ${damJSPort} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${damJSPort}/index.js`,
    reuseExistingServer: true,
    stderr: "ignore",
  },
});

export const damJSDomain = `http://127.0.0.1:${damJSPort}`;
