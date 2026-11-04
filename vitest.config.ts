// One project per source package, so each suite keeps the settings it passed
// under: reactive and fetch never opted into the strict root options below,
// and a project inherits them only through `extends: true` (a sibling of
// `test`; inside `test` it is inert).
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

function chromium() {
  return {
    enabled: true,
    headless: true,
    provider: playwright({
      launchOptions: {
        channel: "chromium",
        // Chromium caps animation frames at ~60Hz, about 16.7ms per awaited frame.
        args: ["--disable-frame-rate-limit"],
      },
    }),
    instances: [{ browser: "chromium" as const }],
    viewport: { width: 1280, height: 720 },
    screenshotFailures: false,
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "reactive",
          include: ["src/index.exports.test.ts", "src/signal/**/*.test.ts", "src/dom/**/*.test.ts"],
          browser: chromium(),
        },
      },
      {
        test: {
          name: "fetch",
          include: ["src/fetch/**/*.test.ts"],
          browser: chromium(),
        },
      },
    ],
  },
});
