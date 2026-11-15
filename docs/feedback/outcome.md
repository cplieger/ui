# outcome

`@cplieger/ui/outcome`

A row's action whose result is worth keeping in view, such as Download in a table of releases. The button turns busy while the action runs, then its cell holds the result: a link to what it made, in the success tone, or the failure beside Retry. Focus moves with it, so it never drops to the page.

```html
<td data-col="actions">
  <button class="cp-button" data-size="sm" type="button" aria-label="Download [Arid] Frieren S01E04">
    <span class="cp-icon" data-cp-icon="download" aria-hidden="true"></span>
    <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span><span class="cp-roll">Download</span>
  </button>
</td>
```

```ts
import { enhanceOutcome } from "@cplieger/ui/outcome";

enhanceOutcome(button, {
  run: (signal) =>
    api.download(release, { signal }).then((file) => ({ href: file.url, words: "Downloaded · Pinned" })),
  words: {
    busy: "Downloading…",
    said: () => "Downloaded and pinned.",
    failedSaid: (reason) => `Download failed: ${reason instanceof Error ? reason.message : "try again."}`,
  },
  signal: view.signal,
});
```

Settled, the cell reads:

```html
<td data-col="actions">
  <span class="cp-outcome">
    <a href="/releases/arid-04"><span class="cp-icon" data-cp-icon="circle-check" aria-hidden="true"></span>Downloaded · Pinned</a>
  </span>
</td>

<td data-col="actions">
  <span class="cp-outcome">
    <span class="cp-state" data-cp-state="failed" id="cp-outcome-failed-1">The provider timed out.</span>
    <button class="cp-button" data-size="sm" type="button" aria-describedby="cp-outcome-failed-1">…<span class="cp-roll">Retry</span></button>
  </span>
</td>
```

## API

- `enhanceOutcome(button, opts)` wires `button`, which holds a `.cp-roll` with its words and its `spinner-arc` busy span. It throws a `TypeError` without the `.cp-roll`.
- `OutcomeOptions` = `{ run, words, signal? }`.
  - `run(signal)` runs the action and resolves with `{ href, words }`, the link to the result and its words. A rejection is the failure.
  - `words` = `{ busy, said?, failed?, failedSaid?, retry? }`.
    - `busy` is the button's words while the action runs, such as "Downloading…", and is required.
    - `said(result)` is said politely once the action succeeded, by default the result's words.
    - `failed(reason)` is the failure's sentence, by default the message of the `Error` `run` rejected with, else "The action failed.".
    - `failedSaid(reason)` is said assertively once the action failed, by default the failure's sentence.
    - `retry` is Retry's words, by default "Retry".
  - `signal` ends the wiring and any action under way, which then writes nothing.

## Behaviour

- A press runs the action through [confirm](../buttons/confirm.md)'s cycle with `done: false`: the button turns busy, carries `aria-busy` and stays focusable. A second press while it runs does nothing.
- A success puts a `.cp-outcome` holding the link in the button's place.
- A failure puts a `.cp-outcome` holding a `.cp-state[data-cp-state="failed"]` with the sentence and a Retry button in the button's place. Retry runs the same action through the same cycle, and its result replaces the failure.
- Focus moves to the link or to Retry when it was on the button, or had dropped to the page. A reader who moved on keeps their place.

## Accessibility

- Each result is said through [announce](announce.md), a failure assertively, since it answers what the person just did.
- Retry is described by the failure's sentence, so a screen reader names why it is there.
- The failed state is a word after its glyph in the danger tone, so colour is never the only signal.
