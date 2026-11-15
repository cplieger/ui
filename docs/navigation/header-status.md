# header-status

`@cplieger/ui/header-status`

Keeps the header's status pill, its panel and the urgent banner in step with the app's own model. The pill says, from any screen, whether the app needs the person and whether work is running. The panel it opens says what is wrong and where it is fixed, what is running with its Stop, the lasting notices, the last few events, and the way to the app's own history page. The app writes the empty pill and panel, and feeds `update()` its whole model on every change. The module writes the state, every word and every row, with no class or style of the app's own.

```html
<header class="cp-header">
  …
  <div class="cp-toolbar">
    <button class="cp-header-status" type="button" popovertarget="status"><span>All good</span></button>
    <div class="cp-popover cp-status-panel" data-variant="panel" popover id="status"></div>
  </div>
</header>
<main class="cp-main" id="main" tabindex="-1">
  <div class="cp-stack" data-gap="tight">
    <div class="cp-stack" data-gap="tight" id="urgent" hidden></div>
    <!-- the app's own banners -->
  </div>
  …
</main>
```

```ts
import { installAnchors } from "@cplieger/ui/anchor";
import { installAnnouncer } from "@cplieger/ui/announce";
import { createHeaderStatus } from "@cplieger/ui/header-status";

installAnchors({ signal: page.signal });
installAnnouncer({ signal: page.signal });
const status = createHeaderStatus({ button, panel, banner });
page.signal.addEventListener("abort", () => status.destroy());

stream.on("status", (s) =>
  status.update({
    conditions: s.problems.map((p) => ({
      id: p.id,
      level: p.blocking ? "problem" : "warning",
      title: p.title,
      reasons: p.reasons,
      since: p.since,
      href: `/status#${p.component}`,
    })),
    work: s.running.map((job) => ({
      id: job.id,
      title: job.title,
      phase: job.phase,
      value: job.done,
      max: job.total,
      stop: {
        run: () => api.stop(job.id),
        ask: { message: "Stop this pass?", confirmLabel: "Stop", tone: "danger" },
      },
    })),
    next: s.nextCheck,
    recent: s.events,
    history: { href: "/activity", label: "Open activity" },
    reconnect: () => stream.reconnect(),
  }),
);
stream.on("drop", () => status.connection("lost"));
stream.on("open", () => status.connection("live"));
```

## The pill

| Holds | Words | Detail |
| --- | --- | --- |
| An urgent problem | its title, "Store full" | "2 problems" when more than one problem holds, else the work |
| Problems | "1 problem", "3 problems" | the work, if any runs |
| Warnings only | "1 warning", "2 warnings" | the work, if any runs |
| An urgent warning, no problem | its title, "Sign-in turns off at the next restart" | "2 warnings" when more than one warning holds, else the work |
| Work only | one item: its title and "3/8", and several: "Working: 3" | none |
| Nothing | "All good" | none |
| Offline | "Offline" | none |

- The pill counts the worst level only, and the panel lists every level. Queued work is never counted as running. `workTotal` counts the work when the app sends only the newest few.
- A condition counts from the moment the app reports it, so the app keeps its own debouncing.
- `connection("lost")` keeps the state and reads "Reconnecting…" as the detail. After `offlineAfter`, 10 seconds by default, the state turns offline and says so once. `connection("live")` brings the pill back at once.
- Said politely, through [announce](../feedback/announce.md): a worse level ("2 problems: Sonarr rejected the API key"), a rising problem count, a new urgent condition by its title, offline at its delay, and "All good" on the return from any of them. Work and a rising warning count are never said, and the first `update()` says nothing.
- Under 40rem the pill shows its glyph alone. Its words stay its name, and the detail moves to the panel's heading.

## The panel

The module writes the panel's content and calls [panel](../overlays/panel.md) for its focus, so the panel is a non-modal dialog named by its heading. Each section is left out when it is empty, in this order:

1. The heading, the pill's words in full, "2 problems · Working: 3". Offline it reads "Offline since 14:02", with Retry calling `reconnect`.
2. `starts`, the app's own start buttons, as the app gives them, first so they never move.
3. Problems and warnings: problems before warnings, the urgent ones first within each, and the longest-standing first after that, so a cause comes before what it causes. Each row has its level's glyph, the title, one line per reason and its start as a relative time. With `href` the whole row links there, its name ending "Details and fix". Without one, the row is a fact.
4. Running: three rows, running work first, then the queue, newest first in each, then "Show all N running" to `workHref` when more run. Each row has its title, a `<progress>` under it with "12 of 40 · phase", and Stop named for the item, "Stop Scanning Sonarr" (`words.stopName`). With `stop.ask`, Stop asks first through [ask](../overlays/ask.md). It then reads "Stopping…" until the item leaves the model, and a rejected `run()` puts its message back as the row's reason line, says it, and gives Stop back. A queued item shows "Queued" and Cancel. A row with `href` and no Stop links as a whole. With both, its title is the link. While nothing runs, the section shows the `next` line, "Next scan 03:00".
5. Notices: lasting facts that never change the pill, one line each with the info glyph.
6. Recent: the first five events, each with its relative time.
7. The foot: the `history` link, held at the panel's end while the rest scrolls, its box 24px tall under a mouse and 44px under a finger.

- While offline, every condition and running row is kept, as `markKept()` in [list-row](../data/list-row.md) marks a row, with "As of 14:02". They turn live again when the stream returns.
- Rows are patched in place by `id`, so a focused Stop keeps its focus through "Stopping…". When a focused row leaves, focus moves to the next row of its section, else to the section's heading, else to the panel's heading.
- A plain press on a link in the panel closes it, so a problem's link to a [component's status](../data/list-row.md) on the same page leaves that block's heading with the focus its arrival gives it. A press for another tab or window leaves it open.

## The urgent banner

An `urgent` condition reaches every screen, such as a full store, sign-in turned off or a change that applies at the next restart. `urgent` says how far it reaches and `level` how bad it is. It names the pill unless a worse level holds, comes first in its level in the panel, and stands in `banner` as a `.cp-notice[data-variant="banner"]`, `data-tone="danger"` with the `circle-x` glyph for a problem and `data-tone="warning"` with `triangle-alert` for a warning, problems first: its title as the heading, a line per reason, and a foot with "Last seen" and its time when the condition has `seen`, then its one link, `docs` when given, else `href` as "Details and fix". The module owns the banner part's children, patches them by `id`, and hides the part while no urgent condition holds. Put the part first in the page's banner place, before the app's own banners, and make it a `.cp-stack` so two banners stand apart. The banners take no live role, since the pill already says a new urgent condition.

## API

- `createHeaderStatus(parts, options?)` takes `parts` = `{ button, panel, banner? }` and returns `{ update, connection, destroy }`.
- `update(model)` renders the whole `StatusModel` each time: `conditions` and `work`, both required, then `starts`, `next`, `workTotal`, `workHref`, `notices`, `recent`, `history` and `reconnect`. A condition is `{ id, level, urgent?, title, reasons?, since?, seen?, href?, docs? }`, `level` being `"problem"` or `"warning"`. An urgent warning stays a warning. A work item is `{ id, title, phase?, value?, max?, queued?, href?, stop? }`, `stop` being `{ run, ask? }` and `ask` the options of a yes or no [ask](../overlays/ask.md) question (no `input` or `choices`, `confirmLabel` as words) with the question as `message`. A notice is `{ id, title, href? }` and a recent event `{ id, words, at, href? }`. Times are a `Date` or ms since the epoch, and an invalid one throws a `RangeError`.
- `connection(state)` takes `"lost"` or `"live"`.
- `destroy()` stops the offline timer, the panel's listeners and its times. Later calls do nothing, and the pill and panel keep what they last showed.
- `options.words` overrides any of `StatusWords`, each pill word, the section headings, "As of", "Last seen" (per condition, as "Last seen from outside"), "Details and fix", Stop, Cancel, "Stopping…", Stop's name for a reader (`stopName(verb, work)`, "Stop Scanning Sonarr"), "Queued", "Show all N running" and a refused Stop's line. `options.locale` is a BCP 47 language tag for the counts and times, by default the browser's. `options.offlineAfter` is the delay in ms, from 0 to 2147483647, and any other value throws a `RangeError`.
- The module does nothing when it is imported.
