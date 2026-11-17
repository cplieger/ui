# proposal

`@cplieger/ui/proposal`

A change shown before it applies, such as a subtitle timing the app worked out: what would change and how sure the app is, with Apply and Discard. A proposal nobody could check is the unverified variant. Its Apply is the secondary button and asks before it runs. Once applied, the card says what applied, with Undo when the app can put it back.

```html
<div class="cp-proposal">
  <p><strong>Proposed:</strong> +1.250 s with drift corrected. Reference track confidence 82%.</p>
  <div class="cp-cluster">
    <button class="cp-button" data-variant="primary" data-size="sm" type="button" data-part="apply">
      <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span><span class="cp-roll">Apply</span>
    </button>
    <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-part="discard">Discard</button>
  </div>
</div>

<div class="cp-proposal" data-variant="unverified">
  <p><strong>Proposed, not checked:</strong> +0.400 s. No reference track was found to check it against.</p>
  <div class="cp-cluster">
    <button class="cp-button" data-size="sm" type="button" data-part="apply">
      <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span><span class="cp-roll">Apply anyway…</span>
    </button>
    <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-part="discard">Discard</button>
  </div>
</div>
```

```ts
import { enhanceProposal } from "@cplieger/ui/proposal";

enhanceProposal(card, {
  apply: (signal) => api.applyTiming(file, proposal, { signal }),
  undo: (signal) => api.restoreTiming(file, { signal }),
  discard: (signal) => api.dropProposal(file, { signal }),
  words: { applied: "Applied: +1.250 s with drift corrected." },
  signal: view.signal,
});

enhanceProposal(unchecked, {
  apply: (signal) => api.applyTiming(file, other, { signal }),
  confirm: {
    title: "Apply an unchecked change?",
    message: "Nothing confirmed that +0.400 s matches the audio.",
    cancelLabel: "Keep the current timing",
  },
  words: { applied: "Applied: +0.400 s, not checked against a reference." },
});
```

## API

- `enhanceProposal(card, opts)` wires a `.cp-proposal`. The card holds its words in a `<p>`, a `data-part="apply"` button with a `.cp-roll` and its `spinner-arc` busy span, and may hold a `data-part="discard"` button. It throws a `TypeError` when the `<p>` or Apply is missing, when a `data-variant="unverified"` card has no `confirm`, and when any other card has one. It writes the card's `data-tone` and puts that tone's glyph first in the card, as a notice leads with its tone's glyph: `warning` and `triangle-alert` while it is unverified, `success` and `circle-check` once applied. A checked proposal before Apply has neither, and keeps its dashed accent edge.
- `ProposalOptions` = `{ apply, discard?, undo?, confirm?, returnFocus?, words, signal? }`.
  - `apply(signal)` applies the change. A rejection is the failed state.
  - `discard(signal)` drops the change where the app keeps it. Without it, Discard removes the card at once.
  - `undo(signal)` puts back what Apply changed. Without it the applied card has no Undo.
  - `confirm` = `{ title, message, confirmLabel?, cancelLabel? }` is the question an unverified proposal asks before Apply runs, through [ask](../overlays/ask.md) with the declining button focused and no tone, since an unchecked change is neither the normal answer nor a removal. Its buttons default to "Apply" and "Cancel".
  - `returnFocus` is where focus goes once Discard removed the card, by default the card's parent.
  - `words` = `{ applied, applying?, discarded?, undo?, undoing?, undone?, applyFailed?, discardFailed?, undoFailed? }`. `applied` is what the card says once the change applied, and is required. `applying` is Apply's words while it runs, by default "Applying…". `discarded` and `undone` are said once the card went and once Undo put it back, by default "Proposal discarded" and "Change undone". `undo` and `undoing` are Undo's words, by default "Undo" and "Undoing…". Each `…Failed` is the failed line's sentence, or a function given what the action rejected with, by default "The change could not be applied.", "The proposal could not be discarded." and "The change could not be undone.". A failed-line function that throws is reported to the page as an uncaught error, and its default sentence takes its place.
  - `signal` ends the card's wiring and any action under way: an open question answers as declined and closes, and nothing applies.

## Behaviour

- One action runs at a time. Apply and Undo turn busy through [confirm](../buttons/confirm.md)'s cycle and stay focusable. Discard carries `aria-busy` while `discard` runs.
- Apply that succeeds marks the card `data-cp-state="applied"` and `data-tone="success"`, which turns its edge solid on the success wash behind the success glyph, puts the `applied` words in the `<p>` and says them politely. Focus goes to Undo, or to the words when there is no Undo. Undo takes Apply's place and Discard goes. A checked proposal's words and buttons move over for the success glyph, and an unverified one's stay where they were.
- Undo that succeeds puts the proposal's tone, words and buttons back where they were, focuses Apply and says `undone`.
- Discard that succeeds removes the card, focuses `returnFocus` and says `discarded`.
- Each of these focus moves happens only when focus was in the card, or would drop to the page. A person who moved on while the action ran keeps their place.
- An action that fails leaves the card as it was, with a `.cp-state[data-cp-state="failed"]` line under the words, said assertively, and focus on the button pressed, so a second press tries again. The next action removes the line.
- The unverified card asks first. A declined question runs nothing, and focus is back on Apply.

## Accessibility

- The applied card and each failure are said through [announce](announce.md), so a person on a screen reader hears what happened without moving.
- The failed line is a `.cp-state` in the danger tone after its glyph, so colour is never the only signal. The tone's glyph leads the words, so the warning and success washes are never the only signal. In forced colours the dashed edge of a proposal and the solid edge of an applied change still differ.
