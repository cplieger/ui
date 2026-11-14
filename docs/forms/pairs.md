# pairs

`@cplieger/ui/pairs`

Rows of two fields that belong together, such as path mappings from one app's path to another's. Each row holds the first field, an arrow, the second field and the row's remove, and each field keeps its own error under it. Under 40rem the fields stack and the arrow goes.

```html
<div>
  <span class="cp-label" id="maps-l">Path mappings</span>
  <ul class="cp-pairs" aria-labelledby="maps-l">
    <li>
      <div class="cp-field"><input class="cp-input" id="from-1" aria-label="Sonarr's path" aria-describedby="from-1-error"><span class="cp-field-error" id="from-1-error" hidden>…</span></div>
      <span class="cp-icon" data-cp-icon="arrow-right" aria-hidden="true"></span>
      <div class="cp-field"><input class="cp-input" id="to-1" aria-label="This app's path" aria-describedby="to-1-error"><span class="cp-field-error" id="to-1-error" hidden>…</span></div>
      <button class="cp-button" data-variant="quiet" type="button" data-remove-pair aria-label="Remove this mapping" data-cp-tip="Remove this mapping">…</button>
    </li>
  </ul>
  <button class="cp-button" data-size="sm" type="button" data-add-pair>Add a mapping</button>
</div>
```

```ts
import { enhancePairs } from "@cplieger/ui/pairs";

enhancePairs(box, { onChange: save, signal: page.signal });
```

- `data-add-pair` appends a row copied from the first row as the page drew it, with its values and errors cleared. Each id is numbered anew, so `from-1` becomes `from-2` and `from-1-error` becomes `from-2-error`, and every `aria-describedby` and `for` follows. Focus goes to the new row's first field. The row fades in and settles 4px, and only fades under reduced motion.
- A row's `data-remove-pair` takes it away, and focus goes to the next row's first field, or the one before it, or to the add button.
- Each field's checks are the app's. Show and clear its error with [form](form.md)'s `showError` and `clearError` as the person leaves it.
- The form's reset puts back the rows the list started with and their values, and [form](form.md#unsaved-changes)'s `guardChanges` counts the list as one change against them.
- `onChange` runs after each add and removal and after a reset, and `signal` removes the listeners.
