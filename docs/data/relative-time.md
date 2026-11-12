# relative-time

`@cplieger/ui/relative-time`

A `<time>` that says how long ago its moment was, or how far ahead it is, in the locale's words, and keeps itself current. The exact time stays beside the words: a screen reader hears it, and a mouse sees it on hover through the [tooltip](../overlays/tooltip.md).

```html
<time datetime="2026-11-11T14:02:00Z">14:02</time>
```

```ts
import { enhanceRelativeTime, formatRelative } from "@cplieger/ui/relative-time";

enhanceRelativeTime(time, { signal: page.signal }); // "4 minutes ago"
enhanceRelativeTime(compact, { style: "narrow", signal: page.signal }); // "4m ago"

formatRelative(Date.parse(entry.at)); // "yesterday"
formatRelative(at, { now: start, locale: "fr" }); // "dans 25 minutes"
```

## API

- `enhanceRelativeTime(time, opts?)` reads the time's `datetime` and replaces its content with the words, then a visually hidden span holding the exact time, and sets `data-cp-tip` to the same exact time. It throws a `TypeError` when `datetime` does not parse.
- `RelativeTimeOptions` = `{ style?, locale?, signal? }`. `signal` stops keeping the time current, and its words stay as they last read. A second call on the same time replaces the first.
- `formatRelative(date, opts?)` returns the words for a `Date` or a number of ms since the epoch, without a page. `FormatRelativeOptions` = `{ now?, style?, locale? }`, where `now` is the moment to count from, by default the present. It throws a `TypeError` for an invalid date.
- `style` is `"long"` by default, or `"short"` or `"narrow"`, as `Intl.RelativeTimeFormat` names them. `locale` is a BCP 47 language tag, by default the browser's.

## The words

| Age | `long` | `narrow` |
| --- | --- | --- |
| under a minute, either way | now | now |
| 4 minutes 29 seconds ago | 4 minutes ago | 4m ago |
| 25 minutes ahead | in 25 minutes | in 25m |
| 1 day ago | yesterday | 1d ago |
| 3 weeks ago | 3 weeks ago | 3w ago |

- The words come from `Intl.RelativeTimeFormat`, so every locale reads its own. `long` lets the locale name the nearest day ("yesterday", "tomorrow"). `short` and `narrow` always give a number, because a compact form reads as one.
- The unit is the largest that fits: a minute, an hour, a day, a week, a month of 30 days or a year of 365 days, each rounded to the nearest whole one. A unit takes over half a smaller unit before the smaller count would reach it. So a time 59 and a half minutes old reads "1 hour ago", never "60 minutes ago", and one 346 days old reads "last year", never "12 months ago".
- The exact time is `Intl.DateTimeFormat` with `dateStyle: "medium"` and `timeStyle: "short"`, in the same locale.

## Keeping current

- Every time `enhanceRelativeTime` keeps current shares one timer, set to the next moment any of their words change. A time reading "3 hours ago" next wakes the page half an hour later, and a feed of fifty times sets one timer, not fifty.
- A page coming back into view brings every time up to date at once, since a hidden page's timers run late.
- A time out of the page is kept current too, so one put back reads the present. A time the page drops is collected with its element.
- The module does nothing when it is imported.
