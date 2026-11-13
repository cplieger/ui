# list-row

`@cplieger/ui/list-row`

The list: one element for every set of items a person scans, picks or opens, such as conversations, problems, jobs, the day's history, uploaded files, a rail's filters, a settings page's categories and a library's posters. A `.cp-list` holds `li` items, each holding one `.cp-list-row`. The list's attributes set what every row in it looks like, and each row fills the same slots: a lead, a body, an end and a part under them. Entries a person reads, such as messages, are a [feed](feed.md), and values compared down columns are a [table](table.md).

```html
<h3 class="cp-list-heading">Today</h3>
<ul class="cp-list" aria-label="Conversations">
  <li>
    <a class="cp-list-row" href="/c/ui" aria-current="page" data-unread>
      <span class="cp-avatar" data-harmony="3">UI</span>
      <span class="cp-cell-stack">
        <span class="cp-truncate cp-mono" data-cut="start">/workspace/ui</span>
        <small class="cp-truncate">@kiro: the list system</small>
      </span>
      <span data-part="end">
        <time datetime="2026-11-13T09:12:00Z">09:12</time>
        <span class="cp-cluster"><span class="cp-badge" data-variant="quiet">3<span class="cp-visually-hidden"> unread</span></span></span>
      </span>
    </a>
  </li>
  <li class="cp-list-foot"><button class="cp-button" data-size="sm" type="button">Show older</button></li>
</ul>
```

```ts
import { markKept } from "@cplieger/ui/list-row";

markKept(row, { from: walk.lastComplete, reason: "Sonarr walk partial" });
markKept(row, null); // fresh again
```

## The list's attributes

Each one is set on the `.cp-list` and applies to every row in it.

| Attribute | Values | Default | What it does |
| --- | --- | --- | --- |
| `data-density` | `compact`, `tall` | regular | Row height and the lead's size. Regular rows are 3.25rem, with an icon, a 2rem avatar or a cover 2.25rem tall. `compact` rows are a small control tall, 44px under a finger, with an icon, a swatch, a dot, a box, a 1.5rem avatar or a cover 1.5rem tall as their lead and the end along their one line, as a rail's filters and a popup's options are. `tall` rows are 4.5rem, with a 2.5rem avatar or a cover 3rem tall, for a list of posters. A cover keeps its 2:3 shape. |
| `data-surface` | `plain` | raised | `plain` drops the list's box, border and corners, so the list sits in a rail, a popover, a dialog or a panel. |
| `data-divider` | `none` | line | `none` drops the line between rows and gives each row the control's corners for its fill, as a rail draws its rows. |
| `data-layout` | `grid` | rows | `grid` lays the rows out as tiles in as many columns of `--cp-grid-min` (9.5rem) as fit, 12px apart, with no box, lines or fill: the cover on top at its 2:3 shape, the title in the heading weight and the facts under it, 8px apart, a chip in the cover at its top start. The cover takes the focus ring and grows a little under a mouse (not under reduced motion). A library's List and Grid views are this one attribute, switched by a `.cp-segmented[data-variant="icons"]`. |
| `data-variant` | `timeline` | none | Each row's lead is a round mark in its tone, and a line joins the marks in place of the line between rows, as a history of events is drawn. Its rows keep a 16px inset at every density so the line meets the marks; with `data-surface="plain"` the marks sit at the list's edge, its heading lines up with them, and the rows take no fill under a mouse. An event's `<details>` opens its words in place under them, the summary an accent line after a chevron. |
| `aria-busy` | `true` | | The list is loading: its rows are skeletons (`data-skeleton`). |

A list with no items yet, such as a file field's before the first choice, draws nothing.

## The row's slots

- **Lead**, the first child, optional, sized by the list's density: a `.cp-icon` (in its `data-tone`'s colour when it has one), a `[data-part="mark"]` (a 2rem round in its `data-tone`'s wash holding a glyph in its ink, outlined in forced colours, as a timeline's events have), a `.cp-avatar`, a `.cp-cover`, a `.cp-swatch` or `.cp-dot`, a checkbox for a list whose rows are chosen, or the [reorder](reorder.md) handle and rank.
- **Body**, a `.cp-cell-stack`: the title, then up to two lines (`<small>` or `.cp-meta`). A name with no break point, such as a file's, wraps inside the row rather than widening it. A line in a `.cp-truncate` is cut at the row's edge, and a `.cp-truncate[data-cut="start"]` is cut at its start, so the end of a path or a name stays in view ("…/marotte/web"). Its full text stays in the page for a screen reader, and `data-cp-tip` shows it on hover. In a right-to-left page a line cut at its start keeps its left end, and machine text there carries `dir="ltr"` so it keeps its leaf on the right.
- **End**, a `[data-part="end"]`: a `<time>` over a `.cp-cluster` of counts (a `.cp-meta` with its icon, a `.cp-badge`) and a `.cp-state`. After the end, at most one of: one worded action (`.cp-button[data-size="sm"]`), one ⋯ button that opens the row's `.cp-menu` of actions (a quiet small `.cp-button` named and tipped "More for Frieren", which takes a fill of its own under the mouse in a hovered row), or a chevron for a row that opens a page, which faces the other way right to left. The step track's compact form, `.cp-track-compact`, stands in the place of the action it follows, as it does in a table's row.
- **Under**, optional: a direct `<progress>`, `.cp-track` or `<details>` child takes a line of its own across the row under its text, such as a running job's bar, and what follows it, such as how far the job is, lines up under it.
- **Sentences**: `data-lines="wrap"` on the row lets its body run to paragraphs, such as a problem, with its `<time>` under them. From 40rem wide the row shows the exact time beside the relative one, "2 hours ago (12 Nov 2026, 14:02)", read from the time's `data-cp-tip`, which [relative-time](relative-time.md) sets in the locale's words; a screen reader hears it once, as before.

## The row as a target

- `a.cp-list-row` or `button.cp-list-row` when the whole row opens or picks one thing.
- Else a `div.cp-list-row` that holds at most a title link and the end's one action or ⋯ button, and nothing else that takes a click.

## The row's states

- `aria-current="page"` marks the open row of a list that navigates (`"true"` when the list sits inside the open view), `aria-pressed="true"` a filter that is on, and `aria-selected="true"` a chosen option. The three share one look: the selected wash with the accent's darkest ink at the medium weight, its lines still muted and in the body weight, and a quiet count turns solid in the accent. A toggle's wash fades in and out over 240ms. In forced colours the row is outlined.
- `data-unread` sets the title in the heading weight.
- `data-kept` (from `markKept`) and `data-ended` set the row in muted ink, which still passes AA. A kept row's title link is muted too, and a step track in it, `.cp-track` under its text or `.cp-track-compact` at its end, goes grey with it, so the row's `.cp-kept` line says when all of it was true. A kept `tr` of a `.cp-table` mutes every cell the same way. A `.cp-track-compact[data-kept]` greys a compact track kept alone in a live row.
- `data-skeleton` draws the row as a loading placeholder.
- An item whose own work is under way, done or failed carries the `.cp-state[data-cp-state]` mark in its end, with Retry as the row's one action when it failed.

## Groups and markers

- A group is a `.cp-list-heading` followed by its own `.cp-list`, such as one list per day. The heading is any heading element, small and in the heading weight, with more space above it than below; over a list with no box it lines up with the rows' content.
- `.cp-since` is the "New since your last visit" line, which a list or a feed holds as an item at the place the new rows start.
- `.cp-list-foot` is the list's last item, holding one action for the whole list, such as Show older (see [load-more](load-more.md)).

## What each case writes

- **A conversation**: `a.cp-list-row` with an avatar, a title cut at its start, a preview line, and an end of the time over the participants and a quiet unread badge, as above.
- **A rail's filters, a settings page's categories**: under a `.cp-list-heading` for the section, `ul.cp-list[data-surface="plain"][data-divider="none"][data-density="compact"]` of `a.cp-list-row[aria-current="page"]` for one choice written to the URL, or `button.cp-list-row[aria-pressed]` for filters that are on or off each, with a `.cp-swatch` lead for a filter's tone and its count, a quiet `.cp-badge`, in the end. A settings page's `.cp-settings-nav` keeps its categories a control tall, 4px apart and inset 12px, beside a form of controls that tall; a category with unsaved changes holds a `.cp-dot` in its end with ", unsaved changes" for a screen reader.
- **A problem**: `div.cp-list-row[data-lines="wrap"]` with a toned `.cp-icon`, a body of `<p>` and `<time>`, and the link to its fix; a `.cp-state` in the end for its kind.
- **A history event**: `ol.cp-list[data-variant="timeline"][data-surface="plain"]` under a `.cp-list-heading` for the day, each `div.cp-list-row[data-lines="wrap"]` holding its `[data-part="mark"][data-tone]` with the glyph, a `<div>` of its words in a `<p>` and an optional `<details>`, and its `<time>` in the end.
- **A running job**: `div.cp-list-row` with its kind and scope, its Stop button and a `<progress>` child; ended, `data-ended` and a `.cp-state` for its outcome.
- **A file**: `ul.cp-list[data-density="compact"]` of `div.cp-list-row` with a `file-text` icon, the name in the body, and its size in the end, as [file](../forms/file.md) writes them; an upload's state in the end.
- **A library in grid view**: `ul.cp-list[data-layout="grid"]` of `a.cp-list-row` with a `.cp-cover` (its image or stand-in glyph, and a `.cp-chip` for its state) and a body of a `<strong>` title and a `<small>` of its facts; the list view is the same items in a `data-density="tall"` list.

## Behaviours over any list

- [held-list](held-list.md) holds changes while the reader is in the list and offers them with a count.
- [keyed-list](keyed-list.md) keeps rows keyed through live updates, with focus and the reader's place kept, and draws only the rows in view of a long list.
- [load-more](load-more.md) adds the next page before the list's foot.
- [reorder](reorder.md) moves rows by handle and keys; [roving-focus](../core/roving-focus.md) gives a list one Tab stop and arrow keys; [relative-time](relative-time.md) keeps each `<time>` current.

## API

- `markKept(row, kept, opts?)` marks an `li`, a `.cp-list-row` or the `tr` of a `.cp-table` kept: `kept` = `{ from, reason }`, where `from` is a `Date` or ms since the epoch. The row's visible `small` and `.cp-meta` lines in its first `.cp-cell-stack` give way to a `small.cp-kept` line, "Kept from 03:00: Sonarr walk partial", whose clock the stylesheet draws; a row with none takes the line at its end, or in its first cell for a table row. Null marks it fresh again and shows the lines it hid. Calling it again on a kept row rewrites its one line. It throws a `TypeError` for an invalid date.
- `KeptOptions` = `{ words?, locale? }`. `words(time, reason)` gives the line. `locale` is a BCP 47 language tag for the time, by default the browser's. The time is the time of day when it is today's, "03:00", and the date with the time on another day, "9 Nov 2026, 03:00".
- The module does nothing when it is imported.
