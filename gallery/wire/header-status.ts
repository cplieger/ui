/**
 * header-status.ts — the gallery's header status on the library: a pill and
 * its panel kept by `createHeaderStatus`, whose problem link lands on a
 * component's status block, and that block's answer-time chart and test.
 */

import { renderChart } from "@cplieger/ui/chart";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { createHeaderStatus, type StatusModel } from "@cplieger/ui/header-status";
import { toast } from "@cplieger/ui/toast";

const MINUTE = 60_000;
const now = Date.now();

const button = document.querySelector<HTMLButtonElement>("button[data-hs-pill]");
const panel = document.querySelector<HTMLElement>("[data-hs-panel]");
if (button !== null && panel !== null) {
  const scanning = {
    id: "scan",
    title: "Scanning Sonarr",
    phase: "Reading series",
    value: 12,
    max: 40,
    href: "#cs-sonarr",
  };
  const status = createHeaderStatus({ button, panel });
  const show = (work: StatusModel["work"]): void => {
    status.update({
      conditions: [
        {
          id: "seadex",
          level: "problem",
          title: "SeaDex is not answering",
          reasons: ["Its API answers 503 Service Unavailable"],
          since: now - 45 * MINUTE,
          href: "#cs-seadex",
        },
        {
          id: "nyaa",
          level: "warning",
          title: "The Nyaa indexer is slow",
          reasons: ["Its answers take 8 seconds"],
          since: now - 10 * MINUTE,
        },
      ],
      work,
      next: "Next full check at 03:00",
      recent: [
        { id: "r3", words: "Grabbed Frieren S01E28", at: now - 6 * MINUTE },
        { id: "r2", words: "SeaDex stopped answering", at: now - 45 * MINUTE },
        { id: "r1", words: "Imported Mushishi S02E04", at: now - 80 * MINUTE },
      ],
      history: { href: "#status", label: "Open the activity log" },
    });
  };
  show([
    {
      ...scanning,
      stop: {
        run: () =>
          new Promise<void>((done) => {
            setTimeout(() => {
              show([]);
              done();
            }, 900);
          }),
      },
    },
  ]);
}

// Every 15 minutes over the last day, the last three checks unanswered.
const STEPS = 96;
const DOWN = 3;
const at = Array.from({ length: STEPS }, (_, i) => now - (STEPS - 1 - i) * 15 * MINUTE);
const answer = at.map((_, i) =>
  i >= STEPS - DOWN ? null : Math.round(180 + 60 * Math.sin(i / 7) + (i % 5) * 12 + i * 4),
);
for (const figure of document.querySelectorAll<HTMLElement>("figure[data-hs-chart]")) {
  renderChart(figure, {
    x: { type: "time", domain: [at[0] ?? now, now] },
    y: { label: "Answer time", format: "duration" },
    marks: [{ mark: "line", x: at, series: [{ name: "Answer time", slot: 1, y: answer }] }],
    empty: "No checks in this range.",
  });
}

// SeaDex still answers 503, so each test ends in the same failure.
for (const test of document.querySelectorAll<HTMLButtonElement>("button[data-hs-test]")) {
  const cycle = enhanceConfirm(test, { busy: "Testing…", done: "Answered" });
  test.addEventListener("click", () => {
    cycle
      .run(
        () =>
          new Promise<never>((_, refuse) => {
            setTimeout(() => {
              refuse(new Error("503 Service Unavailable"));
            }, 900);
          }),
      )
      .catch(() => {
        toast({ kind: "error", title: "SeaDex still answers 503 Service Unavailable" });
      });
  });
}
