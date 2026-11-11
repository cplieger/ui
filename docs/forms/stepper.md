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
- Shift with Up or Down moves ten steps.
- `signal` removes the listeners, the roll and the end marks.

## Nudges

`data-variant="nudge"` is a signed value in its own text field, between buttons of several sizes and a Reset, such as a subtitle's timing offset.

```html
<div class="cp-field">
  <label class="cp-label" for="offset" id="offset-l">Offset, in seconds</label>
  <div class="cp-stepper" data-variant="nudge" role="group" aria-labelledby="offset-l">
    <button class="cp-button" type="button" data-step="-10" data-cp-tip="1 second earlier">−1 s</button>
    <button class="cp-button" type="button" data-step="-1" data-cp-tip="0.1 seconds earlier">−0.1 s</button>
    <input class="cp-input" id="offset" value="+1.25" inputmode="decimal" data-min="-60" data-max="60" data-step="0.1" aria-describedby="offset-help">
    <button class="cp-button" type="button" data-step="1" data-cp-tip="0.1 seconds later">+0.1 s</button>
    <button class="cp-button" type="button" data-step="10" data-cp-tip="1 second later">+1 s</button>
    <button class="cp-button" data-variant="quiet" type="button" data-reset="0">Reset</button>
  </div>
  <span class="cp-help" id="offset-help">Arrow keys move 0.1&nbsp;s, with Shift 1&nbsp;s.</span>
</div>
```

- The field is a text `<input class="cp-input">`, since a number field can show no "+". It takes its range and step from `data-min`, `data-max` and `data-step`, and Up and Down step it.
- It shows a sign before the value at the step's or the markup's decimals, whichever is finer, with a true minus: "+1.25", "−1.25" or "0.00". `format(value)` gives another form. A typed value settles to that form within the range once the field changes, and text that is no number puts back the last value.
- A button marked `data-reset` sets the value to that attribute's value, or with no value back to the markup's value.
- Give each button a tip that says what it does, such as `data-cp-tip="1 second earlier"`, since "−1 s" alone reads as "minus 1 s". The tip describes the button, and its name stays its visible words, so speech input reaches it by what it shows.
