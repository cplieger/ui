# connection-test

`@cplieger/ui/connection-test`

The "Test connection" button of a setup or settings form: idle, busy, passed or failed. It runs a check you supply, writes the answer into a status element you render, marks the field a failure names, and goes back to idle once the person edits the form.

```html
<div class="cp-cluster">
  <button class="cp-button" type="button">Test connection</button>
  <span class="cp-state" data-size="ui"></span>
</div>
```

```ts
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";

enhanceConnectionTest(testButton, statusLine, {
  run: async (signal) => {
    const r = await fetch("/api/test-connection", { method: "POST", body: new FormData(form), signal });
    return r.json(); // { ok: true, message } or { ok: false, message, field?, fix? }
  },
  fields: { url: { input: urlInput, mark: urlError } },
  signal: page.signal,
});
```

- `run(signal)` resolves with the answer. A failure's `message` is what the service answered, said in the status, and its `fix`, by default the same words, is the field's error, a sentence that names the fix. Reject only for a failure you did not turn into one, such as a network error, and `errorMessage(error)` words it. The signal aborts when an edit makes the check stale.
- `fields` maps a field name, as your server names it, to its input and its `.cp-field-error`. A failure that names the field marks it as [form](form.md)'s `reportErrors` does: `aria-invalid`, the sentence in its error, tied by `aria-describedby`, and the error's icon kept. Without `mark`, the error is found or made as `reportErrors` finds or makes one. An input that is not an `<input>`, `<select>` or `<textarea>` gets only `aria-invalid`, and the sentence goes into its `mark`. An edit clears it. The test clears only its own error, and `reportErrors` leaves the test's, so an error your form's own checks showed on the field stays.
- `root`, by default the button's form, scopes the edits that send the test back to idle. Outside a form, pass `root`, or only an edit inside the button's parent resets the test.
- The status and `root` carry `data-cp-state`. A `.cp-state` status draws its glyph and tone from it: the spinner while busy, `circle-check` in the success tone once passed, `circle-x` in the danger tone once failed, and nothing at rest. `data-size="ui"` sets it at the interface's size beside the button. `.cp-test-status` is its former name, drawn the same until it is removed. The status becomes a polite live region unless it has a role, and never gets `aria-busy`, which would make a reader skip "Testing…".
- While busy the button is `aria-disabled` and a press does nothing. It is never `disabled`, which would move focus off it. A button with no `type` gets `type="button"`, so it never submits the form.
- `busyMessage` gives other words for "Testing…", and `onChange(state, result)` runs after each change of state.
- The test never moves focus: the status says the answer where the person is.
- It returns `{ state, start, reset }`.
