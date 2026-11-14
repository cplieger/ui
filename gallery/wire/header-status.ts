/**
 * header-status.ts — the gallery's header status on the library: pills in
 * each state, an urgent condition's banner, a pill and panel whose problem
 * link lands on a component's status block, and that block's chart and test.
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
  const scanning: StatusModel["work"][number] = {
    id: "scan",
    title: "Scanning Sonarr",
    phase: "Reading series",
    value: 12,
    max: 40,
    href: "#cs-sonarr",
    stop: {
      ask: {
        message: "The series read so far are kept.",
        title: "Stop the scan?",
        confirmLabel: "Stop the scan",
        cancelLabel: "Keep scanning",
        tone: "danger",
      },
      run: () =>
        new Promise<void>((done) => {
          setTimeout(() => {
            show(work.filter((w) => w.id !== "scan"));
            done();
          }, 900);
        }),
    },
  };
  const queued: StatusModel["work"][number] = {
    id: "quick",
    title: "Quick check",
    queued: true,
    stop: {
      run: () => {
        show(work.filter((w) => w.id !== "quick"));
        return Promise.resolve();
      },
    },
  };
  const status = createHeaderStatus({ button, panel });
  let work: StatusModel["work"] = [];
  const show = (next: StatusModel["work"]): void => {
    work = next;
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
  show([scanning, queued]);
}

const STATES: readonly StatusModel[] = [
  {
    conditions: [
      {
        id: "store",
        level: "problem",
        urgent: true,
        title: "Store full",
        since: now - 20 * MINUTE,
      },
      { id: "push", level: "problem", title: "Pushes failing", since: now - 5 * MINUTE },
    ],
    work: [],
  },
  {
    conditions: [{ id: "sonarr", level: "problem", title: "Sonarr rejected the API key" }],
    work: [{ id: "full", title: "Full check", value: 3, max: 8 }],
  },
  { conditions: [{ id: "nyaa", level: "warning", title: "The Nyaa indexer is slow" }], work: [] },
  {
    conditions: [],
    work: [
      { id: "a", title: "Scanning Sonarr" },
      { id: "b", title: "Scanning Radarr" },
      { id: "c", title: "Fetching subtitles" },
    ],
  },
  { conditions: [], work: [], next: "Next quick check at 14:32" },
  {
    conditions: [],
    work: [{ id: "full", title: "Full check", phase: "Reading series", value: 3, max: 8 }],
  },
];

const row = document.querySelector<HTMLElement>("[data-hs-states]");
if (row !== null) {
  let live: ReturnType<typeof createHeaderStatus> | undefined;
  STATES.forEach((state, i) => {
    const pill = document.createElement("button");
    pill.className = "cp-header-status";
    pill.type = "button";
    pill.setAttribute("popovertarget", `hs-state-${String(i)}`);
    const sheet = document.createElement("div");
    sheet.className = "cp-popover cp-status-panel";
    sheet.dataset["variant"] = "panel";
    sheet.id = `hs-state-${String(i)}`;
    sheet.popover = "auto";
    row.append(pill, sheet);
    const status = createHeaderStatus({ button: pill, panel: sheet });
    status.update({
      ...state,
      reconnect: () => {
        status.connection("live");
      },
    });
    live = status;
  });
  const drop = document.querySelector<HTMLButtonElement>("button[data-hs-drop]");
  drop?.addEventListener("click", () => {
    live?.connection("lost");
  });
}

const urgentPill = document.querySelector<HTMLButtonElement>("button[data-hs-urgent]");
const urgentPanel = document.querySelector<HTMLElement>("[data-hs-urgent-panel]");
const banner = document.querySelector<HTMLElement>("[data-hs-banner]");
if (urgentPill !== null && urgentPanel !== null && banner !== null) {
  createHeaderStatus({ button: urgentPill, panel: urgentPanel, banner }).update({
    conditions: [
      {
        id: "exposed",
        level: "problem",
        urgent: true,
        title: "This hub can be reached from the internet",
        reasons: [
          "It answers on a public address, 203.0.113.7.",
          "Sign-in by password is on, with no passkey required.",
        ],
        since: now - 3 * 60 * MINUTE,
        seen: now - 2 * MINUTE,
        docs: { href: "#status", label: "How to close it" },
      },
      {
        id: "store",
        level: "problem",
        urgent: true,
        title: "Store full",
        since: now - 20 * MINUTE,
        seen: now - MINUTE,
        href: "#status",
      },
    ],
    work: [],
    recent: [{ id: "r1", words: "Pushes recovered", at: now - 30 * MINUTE }],
    history: { href: "#status", label: "Open statistics" },
  });
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
