# jobs

`@cplieger/ui/jobs`

A list of jobs the app runs, such as finding subtitles for a season: what each job does, where as a link, how far with a bar, its phase, and Stop while it can be stopped. An ended job drops its bar and Stop, and keeps its outcome at its end and its cause under its scope. Each job is a row of the [list system](../data/list-row.md), a running job as it describes.

```html
<ul class="cp-list" aria-label="Running jobs">
  <li>
    <div class="cp-list-row">
      <span class="cp-cell-stack"><strong data-part="kind">Finding subtitles</strong><a href="/library/frieren/1">Frieren, Season 1</a></span>
      <button class="cp-button" data-size="sm" type="button" data-part="stop">Stop</button>
      <progress max="40" value="12" aria-label="Finding subtitles, Frieren Season 1"></progress>
      <small><span data-part="count">12 of 40</span> · <span data-part="phase">Searching providers</span></small>
    </div>
  </li>
  <li class="cp-list-foot"><button class="cp-button" data-variant="quiet" data-size="sm" type="button">Show all 5 running</button></li>
</ul>
```

```ts
import { enhanceJobs } from "@cplieger/ui/jobs";
import { enhanceLoadMore } from "@cplieger/ui/load-more";

const jobs = enhanceJobs(list, {
  stop: (row, signal) => api.stopJob(row.dataset.job, { signal }),
  signal: view.signal,
});
events.on("job", (e) => {
  const row = list.querySelector(`[data-job="${e.id}"]`);
  if (e.ended) jobs.end(row, { words: "Finished", tone: "success", cause: `All ${e.total} done` });
  else {
    jobs.progress(row, e.done, e.total);
    jobs.phase(row, e.phase);
  }
});
enhanceLoadMore(list.querySelector(".cp-list-foot button"), {
  load: (signal) => api.runningJobs({ after: list.children.length - 1, signal }).then(rowsFor),
  words: { count: (n) => (n === 1 ? "1 more job" : `${n} more jobs`) },
  signal: view.signal,
});
```

Ended, a job reads:

```html
<div class="cp-list-row" data-ended>
  <span class="cp-cell-stack"><strong data-part="kind">Finding subtitles</strong><a href="/library/frieren/1">Frieren, Season 1</a><small data-part="cause">Stopped by you at 12 of 40</small></span>
  <span data-part="end"><span class="cp-state" data-tone="neutral"><span class="cp-icon" data-cp-icon="circle-minus" aria-hidden="true"></span>Stopped</span></span>
</div>
```

## API

- `enhanceJobs(list, opts?)` wires `list`, a `.cp-list` of job rows, and returns a `Jobs` handle. Each row is a `div.cp-list-row` holding a body (its first `.cp-cell-stack`) with a `[data-part="kind"]` and the scope, an optional `[data-part="stop"]` button, a `<progress>` child and a `<small>` holding a `[data-part="count"]` and a `[data-part="phase"]`. Its listener is on the list, so rows added later need no call.
- `JobsOptions` = `{ stop?, locale?, words?, signal? }`.
  - `stop(row, signal)` stops the job of `row`, the pressed Stop's `.cp-list-row`. Without it the module leaves the Stop buttons to the host, which calls `end` itself.
  - `locale` is the language the counts are written in, by default the list's `lang`.
  - `words` = `{ count?, stopped?, stoppedCause?, said?, stopFailed? }`, each count already written in that language. A word function that throws is reported to the page as an uncaught error, and its default takes its place, so the count is still written and a stopped job still ends.
    - `count(done, total)` is how far the job is, by default "{done} of {total}".
    - `stopped` is the outcome of a job stopped from its button, by default "Stopped". An app whose button reads Cancel passes "Cancelled".
    - `stoppedCause(done?, total?)` is its cause, given how far the bar was at the press, or nothing for a row with no bar, by default "Stopped by you at {count}", such as "Stopped by you at 12 of 40", or "Stopped by you". An app whose button reads Cancel passes `(done, total) => \`Cancelled by you at ${done} of ${total}\``.
    - `said(kind)` is said once a job stops, by default "{kind} stopped".
    - `stopFailed` is the sentence for a stop that failed, or a function given what `stop` rejected with, by default "The job could not be stopped.".
  - `signal` ends the wiring and any stop under way, which then writes nothing.
- `Jobs` = `{ progress, phase, end }`, each taking a job's `.cp-list-row` or its `li`.
  - `progress(row, done, total?)` sets the bar to `done` of `total`, by default its `max`, and writes the count from the bar's own value, so a `done` past `total` reads as the bar does.
  - `phase(row, words)` writes the job's phase.
  - `end(row, { words, tone, cause?, said? })` ends the job: `data-ended`, the outcome as a `.cp-state` in `data-part="end"` after the body, its glyph by `tone` (`success` a `circle-check`, `warning` a `triangle-alert`, `danger` a `circle-x`, `neutral` a `circle-minus`), and `cause` as the body's last `small`. The bar, Stop and the lines under the bar go. Calling it again on an ended job rewrites its outcome and cause. `said` is said politely, such as "Fixing timing finished", since a job ends while the reader is elsewhere.

## Behaviour

- A press on Stop runs `stop` with the button `aria-busy`, still focusable, and a second press while the first runs does nothing. The busy state lasts only while `stop` is pending. Once it resolves the job ends with `stopped` in the neutral tone and the count at the press as its cause. When the app's job stream later reports the job's own end, `end` rewrites that outcome and cause; leave its `said` out then, since the stop was already said. An end the app writes while Stop is pending wins: the stop's answer, a success or a failure, then writes nothing.
- A stop that fails keeps the job running and adds its sentence under the row as a failed `.cp-state`, with focus left on Stop, so a second press tries again. That press removes the line.
- When the job ends while focus is on Stop or a line that goes, focus moves to the job's first part that takes focus, its link, else the row, so it never drops to the page.
- The list's foot is [load-more](../data/load-more.md), which adds the next jobs before it and focuses the first one's link.

## Accessibility

- Each stop, and each end given its `said`, is said politely, and each failed stop assertively, through [announce](announce.md). Focus never moves to a `<progress>`.
- The outcome is a word after its glyph, so colour is never the only signal. An ended job's words are muted and still pass AA.
- Give each `<progress>` an `aria-label` naming its job, since a list holds several.
