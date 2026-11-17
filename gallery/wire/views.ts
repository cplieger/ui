/**
 * views.ts — the gallery's wiring for the view cards that run on the
 * library: the list and detail, routed by the page's hash, and the video
 * preview whose caption offset the nudge stepper sets.
 */

import { enhanceListDetail } from "@cplieger/ui/list-detail";
import { enhanceTabs } from "@cplieger/ui/tabs";
import { enhanceVideo } from "@cplieger/ui/video";

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
  const detail = enhanceListDetail(md, {
    // Back when a row's press pushed the entry; a page that loaded on the
    // entry has no entry of its own to go back to.
    onDismiss: () => {
      if ((history.state as { md?: unknown } | null)?.md === true) {
        history.back();
      } else {
        history.replaceState(null, "", "#detail");
        route(false);
      }
    },
  });
  const current = (): HTMLAnchorElement | undefined =>
    rows.find((r) => location.hash !== "" && r.hash === location.hash);
  function route(still: boolean): void {
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
    for (const [key, el] of Object.entries(fill)) {
      if (el !== null) {
        el.textContent = row.dataset[key] ?? "";
      }
    }
    detail.show(row.hash, { still });
  }
  for (const row of rows) {
    row.addEventListener("click", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      e.preventDefault();
      // A second press on the open entry pushes nothing, so one Back closes.
      if (row !== current()) {
        history.pushState({ md: true }, "", row.href);
      }
      route(false);
    });
  }
  addEventListener("hashchange", () => {
    route(false);
  });
  if (current() !== undefined) {
    route(true);
  }
}
