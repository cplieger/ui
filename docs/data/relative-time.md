# relative-time

`@cplieger/ui/relative-time`

A `<time>` that says how long ago its moment was, or how far ahead it is, in the locale's fewest words, such as "3m ago", and keeps itself current. The exact time stays beside the words: a screen reader hears it, and a mouse sees it on hover through the [tooltip](../overlays/tooltip.md).

```html
<time datetime="2026-11-11T14:02:00Z">14:02</time>
```

```ts
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

enhanceRelativeTime(time, { signal: page.signal }); // "4m ago"
enhanceRelativeTime(inSentence, { style: "long", signal: page.signal }); // "4 minutes ago"
```

## API

- `enhanceRelativeTime(time, opts?)` reads the time's `datetime` and replaces its content with the words, then a visually hidden span holding the exact time, and sets `data-cp-tip` to the same exact time. It throws a `TypeError` when `datetime` does not parse.
- `RelativeTimeOptions` = `{ style?, locale?, signal? }`. `signal` stops keeping the time current, and its words stay as they last read. A second call on the same time replaces the first.
- `style` is `"narrow"` by default, "3m ago", "5h ago", "2d ago", so a time in a row, a list's end or a feed's head takes little width. A time read inside a sentence, such as "Last full check at 14:02, 6 minutes ago.", passes `"long"`. `"short"` sits between them. The names are `Intl.RelativeTimeFormat`'s.
- `locale` is a BCP 47 language tag. By default it is the `lang` of the time or its nearest ancestor, so a time writes in the language of the text around it. With no `lang` on the time or any ancestor, as for a time not yet in the page, it takes the page's `lang`. An empty `lang`, or one that is not a tag, means the browser's language.
- The words without a `<time>` are `relative(at, { now, style, locale })` from [format](../core/format.md).

## The words

| Age | `long` | `narrow` |
| --- | --- | --- |
| under a minute, either way | now | now |
| 4 minutes 29 seconds ago | 4 minutes ago | 4m ago |
| 25 minutes ahead | in 25 minutes | in 25m |
| 1 day ago | yesterday | 1d ago |
| 3 weeks ago | 3 weeks ago | 3w ago |

- The words come from `Intl.RelativeTimeFormat`, so every locale reads its own. A no-break space binds the number to its unit, so "4 minutes" never breaks across a line. `long` lets the locale name the nearest day ("yesterday", "tomorrow"). `short` and `narrow` always give a number, because a compact form reads as one.
- The unit is the largest that fits: a minute, an hour, a day, a week, a month of 30 days or a year of 365 days, each rounded to the nearest whole one. A unit takes over half a smaller unit before the smaller count would reach it. So a time 59 and a half minutes old reads "1 hour ago", never "60 minutes ago", and one 346 days old reads "last year", never "12 months ago".
- The words are [format](../core/format.md)'s `relative`, and the exact time is its `date(at, "datetime")`, the medium date and the short time joined by no-break spaces, in the same locale.
- The time carries `aria-live="off"`, so its own rewrites are not said again when it sits inside a live region, such as a banner's "Last seen 40 minutes ago". The time is still read whole when its region changes.

## Keeping current

- Every time `enhanceRelativeTime` keeps current shares one timer, set to the next moment any of their words change. A time reading "3 hours ago" next wakes the page half an hour later, and a feed of fifty times sets one timer, not fifty.
- A page coming back into view brings every time up to date at once, since a hidden page's timers run late.
- A time out of the page is kept current too, so one put back reads the present. A time the page drops is collected with its element.
- The module does nothing when it is imported.
