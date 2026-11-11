# date-range

`@cplieger/ui/date-range`

Two native date fields with the quick ranges people use most. A quick range fills both dates, typing a date clears the quick range, and an end before the start is an error on the end. The platform's own calendar does the picking.

```html
<fieldset class="cp-choices">
  <legend class="cp-label">Activity between</legend>
  <div class="cp-segmented" role="radiogroup" aria-label="Quick ranges">
    <label><input type="radio" name="range" value="1">Today</label>
    <label><input type="radio" name="range" value="7" checked>7 days</label>
    <label><input type="radio" name="range" value="all">Any time</label>
  </div>
  <div class="cp-form">
    <div class="cp-field"><label class="cp-label" for="from">From</label><input class="cp-input" id="from" type="date"></div>
    <div class="cp-field"><label class="cp-label" for="to">To</label><input class="cp-input" id="to" type="date"></div>
  </div>
</fieldset>
```

```ts
import { enhanceDateRange } from "@cplieger/ui/date-range";

enhanceDateRange(fieldset, { signal: page.signal });
```

- The first `<input type="date">` is the start and the second the end. A quick range is a radio valued by the days it spans up to today, so `"7"` is the last seven days with today, or `"all"`, which clears both dates.
- A checked quick range fills the dates as the range starts. A change of either date unchecks every quick range.
- An end before the start marks the end field as [form](form.md)'s `reportErrors` does, with `order` as its words, by default "The end comes before the start." A `.cp-field-error` in the markup keeps its icon. The range clears only its own error, and `reportErrors` leaves it.
- Every change reaches your code as the fields' and the radios' own `change` events.
- `today()` gives the day the quick ranges end on, by default the clock's. `signal` removes the listener.
