/**
 * marks.ts — the gallery's wiring for the shared marks' cards that run on
 * the library: the state words card's connection test and the work card's
 * Retry.
 */

import { announce } from "@cplieger/ui/announce";
import { enhanceConfirm } from "@cplieger/ui/confirm";
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

// The upload's Retry fails once more, then the file uploads.
for (const row of document.querySelectorAll<HTMLElement>("[data-work-retry]")) {
  const retry = row.querySelector<HTMLButtonElement>("button");
  const state = row.querySelector<HTMLElement>(".cp-state");
  const reason = row.querySelector<HTMLElement>(".cp-cell-stack > small");
  if (retry === null || state === null || reason === null) {
    continue;
  }
  const name = row.querySelector(".cp-truncate")?.textContent ?? "";
  const cycle = enhanceConfirm(retry, { busy: "Retrying…", done: false });
  let fails = true;
  const upload = (): Promise<void> =>
    new Promise((ok, no) => {
      setTimeout(() => {
        if (fails) {
          fails = false;
          no(new Error("The server is still not answering."));
        } else {
          ok();
        }
      }, 1200);
    });
  retry.addEventListener("click", () => {
    cycle.run(upload).then(
      (ran) => {
        if (!ran) {
          return;
        }
        const focused = document.activeElement === retry;
        state.dataset["cpState"] = "done";
        state.textContent = "Uploaded";
        reason.textContent = row.dataset["doneLine"] ?? "";
        retry.remove();
        if (focused) {
          row.tabIndex = -1;
          row.focus({ preventScroll: true });
        }
        announce(`${name} uploaded.`);
      },
      (err: unknown) => {
        reason.textContent = err instanceof Error ? err.message : "The upload failed.";
        announce(`${name} not uploaded: ${reason.textContent}`, "assertive");
      },
    );
  });
}
