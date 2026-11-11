# state-history

`@cplieger/ui/state-history`

The states of one thing over time, such as a service's last 25 checks, as a strip of one cell per observation in its state's colour. The strip has no axis. Its name sums the states up in words, a legend pairs each colour with its word, and the same observations open as a table, so colour is never the only channel. [Components](../design-components.md) lists its class.

## Script

```ts
import { createStateHistory } from "@cplieger/ui/state-history";

const strip = createStateHistory(
  checks.map((c) => ({ state: c.state, label: c.at })),
  {
    name: "Sonarr, the last 25 checks",
    states: {
      ok: { tone: "success", word: "Answered" },
      slow: { tone: "warning", word: "Slow" },
      down: { tone: "danger", word: "Failed" },
      skipped: { tone: "neutral", word: "Not checked" },
    },
    signal: page.signal,
  },
);
card.append(strip);
```

- `createStateHistory(points, options)` returns a `.cp-state-history` element and adds nothing to the page. `points` are the observations, oldest first, each naming its key in `states`. A key `states` lacks throws a `RangeError`.
- `states` gives each state its `tone`, one of `success`, `warning`, `danger`, `neutral` and `accent`, and its `word`. The summary and the legend list the states in this order and name only those that occur.
- The strip is an `<svg>` with `role="img"`, named by `name` and the count of each state, such as "Sonarr, the last 25 checks: 22 answered, 1 slow, 1 failed, 1 not checked".
- The table lists the newest first. A point's `label`, such as its time, names its row; without one the rows read "Check 25, the latest", "Check 24" and so on. It opens from a "Show as a table" summary, which glides as [disclosure](../navigation/disclosure.md) does.
- `words` gives the words in another language: `tally(count, word)` for a state's share of the name, `show` for the summary, `point` and `state` for the table's headers, and `label(n, latest)` for a row with no label, counting from 1 for the oldest.
- `signal` stops the table's glide and removes its listener.
- A state history to update builds a new one and replaces the old one.

## Look

- The strip is the width of its box and 1.75rem tall, its cells a hair apart with rounded corners. A cell takes its tone's solid colour; a neutral one, such as a check that did not run, the line colour.
- The legend is a wrapping row of small muted words, each after a round swatch of its cells' colour.
- The summary reads in the accent, with a chevron the stylesheet draws, which turns to point down while the table is open.
- In forced colours each cell and swatch keeps its colour inside an outline.
