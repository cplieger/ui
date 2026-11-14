/**
 * marks.ts — the gallery's wiring for the shared marks' cards that run on
 * the library: the state words card's connection test, the work card's
 * Retry, and the progress bars.
 */

import { announce } from "@cplieger/ui/announce";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";

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
        if (focused) {
          row.focus({ preventScroll: true });
        }
        retry.remove();
        announce(`${name} uploaded.`);
      },
      (err: unknown) => {
        reason.textContent = err instanceof Error ? err.message : "The upload failed.";
        announce(`${name} not uploaded: ${reason.textContent}`, "assertive");
      },
    );
  });
}

// A run that starts over is a new <progress>, so its bar starts at 0 instead
// of gliding back; the layout read gives the next value a start to glide from.
function restart(bar: HTMLProgressElement): HTMLProgressElement {
  const fresh = bar.cloneNode() as HTMLProgressElement;
  fresh.value = 0;
  bar.replaceWith(fresh);
  fresh.getBoundingClientRect();
  return fresh;
}

// Steps come a little faster than the fill's 480ms glide, so it never rests
// between them.
for (const start of document.querySelectorAll<HTMLButtonElement>("[data-progress-run]")) {
  const wrap = document.getElementById(start.dataset["progressRun"] ?? "");
  const first = wrap?.querySelector("progress");
  if (!wrap || !first) {
    continue;
  }
  let bar = first;
  let run = 0;
  start.addEventListener("click", () => {
    const mine = ++run;
    delete wrap.dataset["state"];
    bar = restart(bar);
    let p = 0;
    const step = (): void => {
      if (mine !== run) {
        return;
      }
      p = Math.min(100, p + 3 + Math.random() * 5);
      bar.value = p;
      if (p < 100) {
        setTimeout(step, 260);
      } else {
        wrap.dataset["state"] = "done";
      }
    };
    step();
  });
}

for (const wrap of document.querySelectorAll<HTMLElement>("[data-sync-demo]")) {
  const first = wrap.querySelector("progress");
  const words = wrap.querySelector(":scope > span");
  if (first === null || words === null) {
    continue;
  }
  let bar = first;
  setInterval(() => {
    const at = bar.value + 7 > bar.max ? 0 : bar.value + 7;
    if (at === 0) {
      bar = restart(bar);
    }
    bar.value = at;
    words.textContent = `Series ${String(at)} of ${String(bar.max)}`;
  }, 900);
}
