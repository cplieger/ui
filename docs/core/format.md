# format

`@cplieger/ui/format`

One way to write a number, a count, a share, a byte size, a duration and a moment, so every app's words and every chart read the same, in the page's language. Each writer is `Intl` under a fixed rule, and binds a number to its unit with a no-break space, so "3 runs" or "1.0 MB" never breaks across a line.

```ts
import { bytes, count, date, duration, number, percent, relative } from "@cplieger/ui/format";

number(1234.5); // "1,234.5"
count(3, { one: "run", other: "runs" }); // "3 runs"
percent(0.0041); // "0.41%"
bytes(536_870_912); // "536.9 MB"
duration(87_000); // "1 min, 27 sec"
duration(845_000, "digital"); // "14:05"
date(at); // "Nov 19, 2026, 6:40 PM"
date(at, "near"); // "6:40 PM" today, "Nov 18, 4:47 AM" another day
relative(at); // "4m ago"
relative(at, { style: "long", locale: "fr" }); // "il y a 4 minutes"
```

## API

Every writer takes `locale` last, a BCP 47 language tag, except `relative`, which takes it in its options.

- `number(n, options?, locale?)` writes `n` under `Intl.NumberFormat` `options`. It never signs a zero: `signDisplay: "always"` writes 0 as "0" and +5 as "+5", and -0 reads "0". An invalid option throws Intl's `RangeError`.
- `count(n, unit, locale?)` writes `n` as `number` does and the noun `Intl.PluralRules` picks from `unit`, a `{ other, one?, two?, few?, many?, zero? }` of nouns: "1 run", "3 runs", "2,160 hours". The noun follows the written number, so a count Intl rounds to 1 takes the "one" noun.
- `percent(ratio, locale?)` writes a share of a whole, 0 to 1, at two significant digits, so no share above 0 reads "0%": 0.509 is "51%", 0.023 is "2.3%". A share below 1 that would round to the whole takes three digits, cut toward 0, so 0.9999 reads "99.9%" and only 1 reads "100%".
- `bytes(n, locale?)` writes a size in decimal units, by the rule below. A negative size keeps its sign. A value that is not finite is written as Intl writes it, such as "NaN byte", and never throws.
- `duration(ms, style?, locale?)` writes a span of time. `style` is `"short"` by default, then `"narrow"`, `"long"` or `"digital"`:
  - The word styles write the largest unit and, while its count is under 10, the next one: "0 ms", "400 ms", "1 min, 27 sec", "18 min", "9 hr, 30 min", "3 days". `"narrow"` writes "1m 27s" and `"long"` "1 minute, 27 seconds".
  - `"digital"` writes a clock: "0:42" and "14:05" under an hour, "1:02:03" and "25:00:00" from one, days folded into hours. A second shows once it has passed, so 41.6 seconds reads "0:41", and a negative span keeps its sign, "-0:42".
  - A value that is not finite throws a `RangeError` in every style.
- `date(at, style?, locale?)` writes a `Date` or a number of ms since the epoch. `style` is `"datetime"` by default:
  - `"date"` is the medium date, "Nov 19, 2026". `"time"` is the short time, "6:40 PM". `"datetime"` is both, "Nov 19, 2026, 6:40 PM".
  - `"near"` is the short time alone on today's date. Another day adds the day and the short month, "Nov 18, 4:47 AM", and a day outside the present year adds its year too, "Nov 13, 2025, 9:30 AM". Its hour takes the digits the locale's short time does, so British English writes "12 Nov, 09:30".
  - Every style joins its parts with no-break spaces, so a date never breaks across a line.
  - An invalid date throws Intl's `RangeError`.
- `relative(at, opts?)` writes how long ago or ahead `at` is, in the locale's fewest words. `opts` is `{ now?, style?, locale? }`: `now` is the moment to count from, by default the present, and `style` is `"narrow"` by default, "4m ago", then `"short"` or `"long"`, "4 minutes ago". The words and their units are [relative-time](../data/relative-time.md#the-words)'s. An invalid date throws a `TypeError`.
- Types: `Unit`, `DurationStyle`, `DateStyle`, `RelativeStyle` and `RelativeOptions`.

## The page's language

With no `locale`, a writer writes in the `lang` of the `<html>` element, read at each call, so a page that changes its language is written in the new one at the next call. With no `lang`, or an empty one, it writes in the browser's language. In Node or a worker, which have no page, it writes in the platform's. A component that writes its own element's language passes the `lang` it reads from that element.

## Byte sizes

- The units are decimal. A kilobyte is 1,000 bytes, as drives, downloads and network speeds count them. "512 MiB", 536,870,912 bytes, reads "536.9 MB".
- Whole bytes have no fraction digit, and every larger unit one: "999 byte", "1.0 kB", "999.9 kB".
- The unit is the largest that keeps the size at 1 or more once rounded to print. So 999,949 bytes reads "999.9 kB" and 999,950 bytes "1.0 MB", never "1,000.0 kB". The same holds at each step up to a petabyte, the largest unit. Past 1,000 PB the number grows, "2,000.0 PB".
- The unit words are the platform's, in the locale: German writes "1,0 MB" and French "1,0 ko". An app carries no size words of its own.

## Not here

- The app's own words. A writer translates a unit Intl knows, never a sentence. `count` takes its nouns from the app.
- Parsing: no writer reads a number, a size or a date back from text.
