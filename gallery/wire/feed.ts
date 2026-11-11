/**
 * feed.ts — the gallery's lists, feeds and times, on the library.
 */

import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

// A card writes its times as seconds before the page loaded, in data-ago,
// so they read the same on every visit.
for (const time of document.querySelectorAll<HTMLTimeElement>("time[data-ago]")) {
  time.dateTime ||= new Date(Date.now() - Number(time.dataset["ago"]) * 1000).toISOString();
  enhanceRelativeTime(time, { style: time.dataset["style"] === "narrow" ? "narrow" : "long" });
}
