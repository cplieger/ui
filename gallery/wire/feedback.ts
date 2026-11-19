/**
 * feedback.ts — the gallery's wiring for the feedback lane's cards that run
 * on the library: the region refreshing over its old content, the message
 * feed's read summaries, which load on first open, announcements that
 * reach a dialog, the proposals shown before they apply, the batched
 * action, the running jobs and a row's action settling into its outcome.
 */

import { anchorTo } from "@cplieger/ui/anchor";
import { announce } from "@cplieger/ui/announce";
import { enhanceBatchedAction } from "@cplieger/ui/batch-report";
import { enhanceJobs } from "@cplieger/ui/jobs";
import { enhanceLoadMore } from "@cplieger/ui/load-more";
import { enhanceLoadingRegion } from "@cplieger/ui/loading-region";
import { enhanceOutcome } from "@cplieger/ui/outcome";
import { enhancePanel } from "@cplieger/ui/panel";
import { enhanceProposal } from "@cplieger/ui/proposal";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

// The stale card's two buttons refresh one panel; data-fail makes the
// refresh fail as an app's would when its service does not answer.
for (const region of document.querySelectorAll<HTMLElement>("#stale-region")) {
  let fail = false;
  const checked = region.querySelector<HTMLTimeElement>("time");
  // From data-ago: feed.ts, which imports this module, writes the time's
  // dateTime only after this runs.
  const ago = Number(checked?.dataset["ago"] ?? Number.NaN);
  const sonarr = enhanceLoadingRegion(region, {
    ...(Number.isFinite(ago) ? { loadedAt: new Date(Date.now() - ago * 1000) } : {}),
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
      remedy: () => "Check that Sonarr is running, then press Retry.",
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

function readers(title: string, names: readonly string[], loading = false): HTMLElement {
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
    const item = document.createElement("li");
    if (loading) {
      const bar = document.createElement("span");
      bar.className = "cp-skeleton";
      item.append(bar);
    } else {
      const link = document.createElement("a");
      link.href = `#agent-${name === "You" ? "user" : name.slice(1)}`;
      link.textContent = name;
      item.append(link);
    }
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
 * Gives a read summary's button its panel, which loads the names on each
 * open after 600 ms. A button marked data-read-fails fails its first load,
 * so the panel shows its Retry.
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
          refuse(signal.reason);
        });
      }),
    // The button holds the names, so the placeholder has the panel's shape.
    placeholder: () => {
      const shape = document.createDocumentFragment();
      shape.append(
        readers("Read", people(button.dataset["read"]), true),
        readers("Not read yet", people(button.dataset["waiting"]), true),
      );
      return shape;
    },
    render: () => {
      panel.replaceChildren(
        readers("Read", people(button.dataset["read"])),
        readers("Not read yet", people(button.dataset["waiting"])),
      );
    },
    words: { loading: "Loading who read it…", failed: "The readers could not be loaded." },
  });
  panel.addEventListener("beforetoggle", (e) => {
    if (e.newState === "open") {
      void names.load();
    }
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-announce]")) {
  button.addEventListener("click", () => {
    announce(button.dataset["announce"] ?? "");
  });
}

// The heard log reads what the library wrote into its live regions, so it
// shows where a message was said from, not where the gallery meant it to go.
for (const log of document.querySelectorAll<HTMLOListElement>("ol#heard")) {
  new MutationObserver((records) => {
    for (const { target } of records) {
      const said = target.textContent ?? "";
      if (
        !(target instanceof HTMLElement) ||
        !target.matches("[data-cp-live-regions] > [aria-live]") ||
        said === ""
      ) {
        continue;
      }
      const quote = document.createElement("q");
      quote.textContent = said;
      const item = document.createElement("li");
      item.append(
        quote,
        target.closest("dialog") === null
          ? ", from the page's live region"
          : ", from the dialog's own live region, while the page is inert",
      );
      log.append(item);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

/** Settles after `ms`, as an app's request to its server would. */
function after(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
    });
  });
}

for (const card of document.querySelectorAll<HTMLElement>("#proposal .cp-proposal")) {
  const unchecked = card.dataset["variant"] === "unverified";
  enhanceProposal(card, {
    apply: (signal) => after(900, signal),
    undo: (signal) => after(600, signal),
    words: {
      applied: unchecked
        ? "Applied: +0.400 s, not checked against a reference."
        : "Applied: +1.250 s with drift corrected.",
    },
    ...(unchecked
      ? {
          confirm: {
            title: "Apply an unchecked change?",
            message: "Nothing confirmed that +0.400 s matches the audio.",
            cancelLabel: "Keep the current timing",
          },
        }
      : {}),
  });
}

/** The episodes the gallery's last batch fails to start, with their reasons. */
const UNSTARTED = [
  {
    name: "Kaiba, episode 4",
    reason: "No provider has Basque subtitles",
    note: "Checked 6 providers",
  },
  { name: "Kaiba, episode 9", reason: "The video file is missing" },
];

// A batched action names its report by data-report, its total by
// data-batch-total and a press's share by data-batch-size.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-batch-total]")) {
  const report = document.getElementById(button.dataset["report"] ?? "");
  if (report === null) {
    continue;
  }
  // The second press holds 12 back, which the third sends again; the last
  // refuses two for good.
  const total = Number(button.dataset["batchTotal"]);
  let left = total;
  enhanceBatchedAction(button, report, {
    total,
    size: Number(button.dataset["batchSize"]),
    send: async (count, signal) => {
      await after(900, signal);
      const pending = left === total - 100 ? 12 : 0;
      const missed = count === left ? UNSTARTED : [];
      left -= count - pending;
      return { started: count - missed.length - pending, missed, pending };
    },
  });
}

// Each job gains a step every 700 ms and finishes at its end; Stop takes
// 600 ms, and the foot adds the three other running jobs.
for (const list of document.querySelectorAll<HTMLElement>("[data-jobs]")) {
  const template = list.querySelector("li:has(> .cp-list-row)")?.cloneNode(true);
  const jobs = enhanceJobs(list, { stop: (_row, signal) => after(600, signal) });
  setInterval(() => {
    for (const row of list.querySelectorAll<HTMLElement>(".cp-list-row:not([data-ended])")) {
      const bar = row.querySelector("progress");
      if (bar === null || row.querySelector('[aria-busy="true"]') !== null) {
        continue;
      }
      jobs.progress(row, bar.value + 1);
      if (bar.value === bar.max) {
        const kind = row.querySelector('[data-part="kind"]')?.textContent ?? "A job";
        jobs.end(row, {
          words: "Finished",
          tone: "success",
          cause: `All ${String(bar.max)} done`,
          said: `${kind} finished`,
        });
      }
    }
  }, 700);
  const more = list.querySelector<HTMLButtonElement>(".cp-list-foot > button");
  if (more === null || !(template instanceof HTMLElement)) {
    continue;
  }
  enhanceLoadMore(more, {
    load: async (signal) => {
      await after(600, signal);
      const added = Array.from({ length: 3 }, () => template.cloneNode(true) as HTMLElement);
      for (const item of added) {
        jobs.progress(item, 0);
      }
      return { items: added, more: false };
    },
    words: { count: (n) => (n === 1 ? "1 more job" : `${String(n)} more jobs`) },
  });
}

// A row's Download settles into its result; the one marked
// data-outcome="fail" fails once, and its Retry then succeeds.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-outcome]")) {
  let fails = button.dataset["outcome"] === "fail";
  enhanceOutcome(button, {
    run: async (signal) => {
      await after(1400, signal);
      if (fails) {
        fails = false;
        throw new Error("The provider timed out.");
      }
      return { href: "#table", words: "Downloaded · Pinned" };
    },
    words: {
      busy: "Downloading…",
      said: () => "Downloaded and pinned.",
      failedSaid: () => "Download failed: the provider timed out.",
    },
  });
}
