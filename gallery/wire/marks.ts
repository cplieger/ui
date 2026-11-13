/**
 * marks.ts — the gallery's wiring for the shared marks' cards that run on
 * the library: the state words card's connection test.
 */

import { enhanceConnectionTest } from "@cplieger/ui/connection-test";

// The state words card's test passes, then fails, then passes again.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-state-test]")) {
  const status = document.getElementById(button.dataset["stateTest"] ?? "");
  if (status === null) {
    continue;
  }
  let passes = true;
  enhanceConnectionTest(button, status, {
    run: (signal) =>
      new Promise((done, fail) => {
        const pass = passes;
        passes = !passes;
        const timer = setTimeout(() => {
          done(
            pass
              ? { ok: true, message: "Connected, Sonarr 4.0.9" }
              : { ok: false, message: "Sonarr did not answer at this address and port." },
          );
        }, 1100);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          fail(new DOMException("The check was ended.", "AbortError"));
        });
      }),
  });
}
