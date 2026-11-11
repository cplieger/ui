# stepper

`@cplieger/ui/stepper`

A number between a minus and a plus. Each press steps the number field by its own `step`, within `min` and `max`, and the number rolls to its new value.

```html
<div class="cp-field">
  <span class="cp-label" id="checks-l">Parallel checks</span>
  <div class="cp-stepper" role="group" aria-labelledby="checks-l">
    <button class="cp-button" data-variant="quiet" type="button" data-step="-1" aria-label="Fewer" data-cp-tip="Fewer">…</button>
    <input type="number" min="1" max="8" value="3" aria-labelledby="checks-l">
    <button class="cp-button" data-variant="quiet" type="button" data-step="1" aria-label="More" data-cp-tip="More">…</button>
  </div>
</div>
```

```ts
import { enhanceStepper } from "@cplieger/ui/stepper";

enhanceStepper(stepper, { signal: page.signal });
```

- `data-step` says how many of the field's steps a press moves, negative for the minus.
- Each change fires `input` and `change` on the field, as typing would, and is said through [announce](../feedback/announce.md) when an announcer is installed.
- The button at an end the value cannot pass carries `aria-disabled="true"`, keeps its focus and does nothing. The marks follow typed values too.
- The number rolls up as it grows and down as it shrinks, laid over the field. A keystroke ends the roll at once, and under reduced motion the value only changes.
- A `.cp-stepper` whose value is a `.cp-stepper-value` button, such as a zoom that resets on a press, takes the same look and leaves the steps to the app.
- `signal` removes the listeners, the roll and the end marks.
