// The element folders, the design language's computed-style checks, and the
// Node tests. A root-level `expect.requireAssertions` would reach every
// project, `extends` or not, so the strict options are spread into each.
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

// The browsers the element tests run in: CPLIEGER_BROWSERS=chromium,firefox,webkit
// runs all three, and Chromium alone runs when it is unset, as in CI.
const ENGINES = (process.env["CPLIEGER_BROWSERS"] ?? "chromium").split(",") as (
  "chromium" | "firefox" | "webkit"
)[];

function engines() {
  return {
    ...chromium(),
    instances: ENGINES.map((browser) =>
      browser === "chromium"
        ? { browser }
        : { browser, provider: playwright({ launchOptions: {} }) },
    ),
  };
}

// The design language's element folders, one per purpose.
const CATEGORIES = [
  "core",
  "foundations",
  "layout",
  "forms",
  "buttons",
  "feedback",
  "overlays",
  "navigation",
  "data",
  "media",
  "screens",
];

const EXCLUDE = ["**/node_modules/**", "**/.stryker-tmp/**"];

const strict = {
  passWithNoTests: false,
  allowOnly: false,
  globals: false,
  expect: {
    requireAssertions: true,
  },
  clearMocks: true,
  mockReset: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
  testTimeout: 5000,
  hookTimeout: 10000,
  sequence: {
    shuffle: { files: false, tests: false },
    concurrent: false,
    hooks: "stack",
  },
  printConsoleTrace: true,
  expandSnapshotDiff: true,
  chaiConfig: {
    truncateThreshold: 0,
    showDiff: true,
    includeStack: true,
  },
} as const;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...strict,
          name: "elements",
          isolate: true,
          exclude: [...EXCLUDE, "src/**/*.node.test.ts"],
          include: CATEGORIES.map((c) => `src/${c}/**/*.test.ts`),
          setupFiles: ["./src/fc-strict-setup.ts"],
          browser: engines(),
        },
      },
      {
        test: {
          ...strict,
          name: "system",
          include: ["src/system/**/*.test.ts"],
          isolate: true,
          exclude: [...EXCLUDE, "src/**/*.node.test.ts"],
          browser: engines(),
        },
      },
      {
        test: {
          ...strict,
          name: "node",
          environment: "node",
          isolate: true,
          exclude: EXCLUDE,
          include: ["src/**/*.node.test.ts", "gallery/*.node.test.ts"],
        },
      },
    ],
    bail: process.env["CI"] ? 1 : 0,
    slowTestThreshold: 300,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/**/*-setup.ts", "src/**/test-helpers/**"],
      reportOnFailure: true,
      reporter: ["text", "text-summary", "lcov"],
    },
  },
});
