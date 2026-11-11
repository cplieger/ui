# choice

`@cplieger/ui/choice`

A radio's own field, such as "Every [30] minutes", live only while its radio is chosen.

```html
<fieldset class="cp-choices">
  <legend class="cp-label">Run checks</legend>
  <div class="cp-choice">
    <input class="cp-radio" type="radio" name="cadence" id="every" checked aria-labelledby="every-l minutes every-u">
    <span class="cp-choice-field">
      <label id="every-l" for="every">Every</label>
      <input class="cp-input" id="minutes" type="number" min="5" value="30" aria-label="Minutes between checks">
      <span id="every-u">minutes</span>
    </span>
  </div>
  <label class="cp-choice"><input class="cp-radio" type="radio" name="cadence"><span>Only when triggered<small>From the webhook or the Run button</small></span></label>
</fieldset>
```

```ts
import { enhanceChoiceFields } from "@cplieger/ui/choice";

enhanceChoiceFields(fieldset, { signal: page.signal });
```

- While its radio is not chosen, the field leaves the tab order and carries `aria-disabled="true"`. It is never `disabled`, because a focused field that turns disabled drops focus to the page.
- Focusing the field, by a press on it, chooses its radio and fires `input` and `change` on the radio, as a press of the radio would.
- `enhanceChoiceFields` returns `sync`, which marks the fields again. Call it after adding choices, since otherwise a new field is marked at the group's next change.
- `signal` removes the listeners and the state written on the fields.
