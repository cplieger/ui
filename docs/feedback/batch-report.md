# batch-report

`@cplieger/ui/batch-report`

A batched action: work on more items than one press should send, such as finding subtitles for 248 episodes. Each press sends the next batch, and the button names what its next press does, such as "Start the next 100" or "Start the remaining 48". The `.cp-batch-report` under it sums up the presses and lists each item that did not go, with its reason. After the last batch the button is disabled and says what started, and focus moves from it to the report.

```html
<button class="cp-button" data-variant="primary" type="button" id="find-subtitles">
  <span class="cp-icon" data-cp-icon="captions" aria-hidden="true"></span>
  <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span>
  <span class="cp-roll">Start the first 100</span>
</button>
<div class="cp-batch-report"><p>248 episodes need subtitles.</p></div>
```

```ts
import { enhanceBatchedAction } from "@cplieger/ui/batch-report";

enhanceBatchedAction(button, report, {
  total: 248,
  size: 100,
  // queue holds the episodes not yet started, the ones held back first.
  send: async (count, signal) => {
    const batch = queue.slice(0, count);
    const answer = await api.findSubtitles(batch, { signal });
    queue = [...answer.held, ...queue.slice(count)];
    return {
      started: answer.started.length,
      missed: answer.refused.map((r) => ({ name: r.title, reason: r.reason })),
      pending: answer.held.length,
    };
  },
  signal: view.signal,
});
```

After each press the report holds its sum and the misses so far:

```html
<div class="cp-batch-report">
  <p>Started 246 of 248. None remain. 2 couldn't start:</p>
  <dl class="cp-facts" data-variant="compare">
    <dt>Kaiba, episode 4</dt>
    <dd><span class="cp-state" data-cp-state="failed">No provider has Basque subtitles</span><small>Checked 6 providers</small></dd>
    <dt>Kaiba, episode 9</dt>
    <dd><span class="cp-state" data-cp-state="failed">The video file is missing</span></dd>
  </dl>
</div>
```

## API

- `enhanceBatchedAction(button, report, opts)` wires `button`, which holds a `.cp-roll` with the first press's words and a `spinner-arc` busy span, and writes each press's result into `report`, a `.cp-batch-report`. It throws a `RangeError` when `total` or `size` is not a whole number of at least 1, and a `TypeError` when the button has no `.cp-roll`.
- `BatchOptions` = `{ total, size, send, locale?, words?, signal? }`.
  - `total` is how many items the action covers, and `size` how many one press sends.
  - `send(count, signal)` sends the app's next `count` items, the pending ones first, so the app keeps the queue and each item's own key. It resolves with a `BatchAnswer` = `{ started, missed?, pending? }` accounting for every item of the batch: how many started, each `BatchMiss` = `{ name, reason, note? }` refused for good, and how many wait to be sent again, such as those a full queue or a lost connection held back, or those the app never sent once it stopped at the first of them. Pending items stay in what remains, and the button reads "Start the remaining 18" until none is held back. A rejection fails the press: nothing counts, so the next press sends the same items. An answer that does not account for exactly `count` items fails the press the same way, with a `RangeError`.
  - `locale` is the language the counts are written in, by default the button's `lang`.
  - `words` = `{ next?, done?, busy?, report?, failed? }`, each count already written in that language. A word function that throws is reported to the page as an uncaught error, and its default takes its place, so a press that started work still reads as started.
    - `next(size, left, last)` is the button's words while batches remain, by default "Start the next {size}", or "Start the remaining {left}" when `last`, once one press covers what is left.
    - `done(started, total, all)` is its words after the last batch, by default "All {total} started" when `all` started, else "{started} of {total} started".
    - `busy` is its words while a batch is sent, by default "Starting…".
    - `report(counts)` is the sum after each press, given `{ started, total, left, pending, missed, format }`, the numbers and the page's way of writing one, where `left` counts items never sent and `pending` those the last press held back. By default `Started {started} of {total}. {left} remain.` (`1 remains.` for one) with `{pending} waiting to be sent again.` before it while some are held back, `None remain.` at the end, and `{missed} couldn't start:` once an item did not go. An app with its own reason for holding items back words it here, such as "12 waiting for capacity".
    - `failed` is the sentence for a press that failed outright, or a function given what `send` rejected with, by default "The batch could not start.".
  - `signal` ends the wiring and the batch under way, which then writes nothing.

## Behaviour

- One batch goes at a time. The button turns busy through [confirm](../buttons/confirm.md)'s cycle, `aria-busy` and still focusable, then rolls to the next press's words.
- The report's sum replaces the last one, and its compared [facts](../design-components.md) list every item that did not go across all presses, each reason a failed `.cp-state`.
- A press that fails outright adds its sentence as a failed `.cp-state` line at the report's end, leaves the counts and the button's words as they were, and keeps focus on the button, so a second press tries again. The next press removes the line.
- After the last batch the button is disabled and, when focus was on the button or lost to the page, it moves to the report, since a disabled button cannot hold it. A person who moved on while the last batch was sent keeps their place.

## Accessibility

- Each sum is said politely and each outright failure assertively, through [announce](announce.md).
- Each miss's reason is a word after the failed state's glyph, so colour is never the only signal.
