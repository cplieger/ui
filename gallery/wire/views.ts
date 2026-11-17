/**
 * views.ts — the gallery's wiring for the view cards that run on the
 * library: the list and detail, routed by the page's hash, and the video
 * preview whose caption offset the nudge stepper sets.
 */

import { enhanceListDetail } from "@cplieger/ui/list-detail";
import { enhanceTabs } from "@cplieger/ui/tabs";
import { enhanceVideo } from "@cplieger/ui/video";

import { routeListDetail } from "./route.js";

const pane = document.getElementById("video-preview");
const nudge = document.getElementById("nudge-video-input");
if (pane !== null && nudge instanceof HTMLInputElement) {
  const video = enhanceVideo(pane);
  // The stepper writes a typographic minus, which Number() refuses.
  nudge.addEventListener("change", () => {
    video.offset = Number(nudge.value.replace("\u2212", "-"));
  });
}

const md = document.getElementById("md");
const mdTabs = document.getElementById("md-tabs");
if (md !== null && mdTabs !== null) {
  const rows = [...md.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
  const fill: Record<string, HTMLElement | null> = {
    title: document.getElementById("md-title"),
    meta: document.getElementById("md-meta"),
    episodes: document.getElementById("md-p1"),
    subtitles: document.getElementById("md-p2"),
  };
  enhanceTabs(mdTabs);
  const current = (): HTMLAnchorElement | undefined => rows.find((r) => r.hash === location.hash);
  const route = routeListDetail({
    root: md,
    names: (hash) => rows.some((r) => r.hash === hash),
    list: "#detail",
    sync: render,
    rowOrStop: (key) => rows.find((r) => r.hash === key) ?? null,
  });
  const detail = enhanceListDetail(md, { onDismiss: route.close });
  function render(still: boolean): void {
    const row = current();
    for (const r of rows) {
      if (r === row) {
        r.setAttribute("aria-current", "true");
      } else {
        r.removeAttribute("aria-current");
      }
    }
    if (row === undefined) {
      detail.show(null);
      return;
    }
    if (detail.key === row.hash) {
      return;
    }
    for (const [key, el] of Object.entries(fill)) {
      if (el !== null) {
        el.textContent = row.dataset[key] ?? "";
      }
    }
    detail.show(row.hash, { still });
  }
  route.start(detail);
}
