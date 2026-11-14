/**
 * feedback.ts — the gallery's wiring for the feedback lane's cards that run
 * on the library: the region refreshing over its old content.
 */

import { enhanceLoadingRegion } from "@cplieger/ui/loading-region";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

// The stale card's two buttons refresh one panel; data-fail makes the
// refresh fail as an app's would when its service does not answer.
for (const region of document.querySelectorAll<HTMLElement>("#stale-region")) {
  let fail = false;
  const checked = region.querySelector<HTMLTimeElement>("time");
  const sonarr = enhanceLoadingRegion(region, {
    load: (signal) =>
      new Promise<void>((done, refuse) => {
        const timer = setTimeout(() => {
          if (fail) {
            refuse(new Error("Sonarr did not answer."));
          } else {
            done();
          }
        }, 1500);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
        });
      }),
    render: () => {
      if (checked !== null) {
        checked.dateTime = new Date().toISOString();
        enhanceRelativeTime(checked);
      }
    },
    words: {
      refreshFailed: (reason, at) =>
        `The refresh failed: ${reason instanceof Error ? reason.message : String(reason)} What you see is from ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(at)}.`,
    },
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    `[data-refresh="${CSS.escape(region.id)}"]`,
  )) {
    button.addEventListener("click", () => {
      fail = button.hasAttribute("data-fail");
      void sonarr.load(button);
    });
  }
}
