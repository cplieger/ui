/**
 * feedback.ts — the gallery's wiring for the feedback lane's cards that run
 * on the library: the region refreshing over its old content and the
 * message feed's read summaries, which load on first open.
 */

import { anchorTo } from "@cplieger/ui/anchor";
import { enhanceLoadingRegion } from "@cplieger/ui/loading-region";
import { enhancePanel } from "@cplieger/ui/panel";
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

function people(list: string | undefined): string[] {
  return (list ?? "").split(" ").filter((name) => name !== "");
}

function readers(title: string, names: readonly string[]): HTMLElement {
  const heading = document.createElement("h4");
  heading.textContent = title;
  const section = document.createElement("section");
  section.append(heading);
  if (names.length === 0) {
    const none = document.createElement("p");
    none.className = "cp-meta";
    none.textContent = "No one yet.";
    section.append(none);
    return section;
  }
  const list = document.createElement("ul");
  for (const name of names) {
    const link = document.createElement("a");
    link.href = `#agent-${name === "You" ? "user" : name.slice(1)}`;
    link.textContent = name;
    const item = document.createElement("li");
    item.append(link);
    list.append(item);
  }
  section.append(list);
  return section;
}

let readSeq = 0;

/** A read summary's button, "Read by 1 of 3", holding the names its panel lists. */
export function readButton(read: readonly string[], waiting: readonly string[]): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "cp-button";
  button.dataset["variant"] = "quiet";
  button.dataset["size"] = "sm";
  button.type = "button";
  button.textContent = `Read by ${String(read.length)} of ${String(read.length + waiting.length)}`;
  button.dataset["read"] = read.join(" ");
  button.dataset["waiting"] = waiting.join(" ");
  return button;
}

/**
 * Gives a read summary's button its panel, which loads the names on its
 * first open after 600 ms, and again on an open after a failure. A button
 * marked data-read-fails fails its first load, so the panel shows its Retry.
 */
export function readSummary(button: HTMLButtonElement): void {
  const panel = document.createElement("div");
  panel.className = "cp-popover cp-feed-readers";
  panel.dataset["variant"] = "panel";
  panel.popover = "auto";
  panel.id = `msg-readers-${String(++readSeq)}`;
  panel.setAttribute("aria-label", "Who read this message");
  button.setAttribute("popovertarget", panel.id);
  button.after(panel);
  anchorTo(panel, button);
  enhancePanel(panel);
  let fails = button.hasAttribute("data-read-fails");
  const names = enhanceLoadingRegion(panel, {
    load: (signal) =>
      new Promise<void>((done, refuse) => {
        const timer = setTimeout(() => {
          if (fails) {
            fails = false;
            refuse(new Error("The server did not answer."));
          } else {
            done();
          }
        }, 600);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
        });
      }),
    render: () => {
      panel.append(
        readers("Read", people(button.dataset["read"])),
        readers("Not read yet", people(button.dataset["waiting"])),
      );
    },
    words: { loading: "Loading who read it…", failed: "The readers could not be loaded." },
  });
  panel.addEventListener("toggle", (e) => {
    if (e.newState === "open" && (names.state === "idle" || names.state === "failed")) {
      void names.load();
    }
  });
}
