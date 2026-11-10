# connection-test

`@cplieger/ui/connection-test`

The "Test connection" button of a setup or settings form: idle, busy, passed or failed. It runs a check you supply, writes the answer into a status element you render, marks the field a failure names, and goes back to idle once the person edits the form.

```ts
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";

enhanceConnectionTest(testButton, statusLine, {
  run: async (signal) => {
    const r = await fetch("/api/test-connection", { method: "POST", body: new FormData(form), signal });
    return r.json(); // { ok: true, message } or { ok: false, message, field? }
  },
  fields: { url: { input: urlInput, mark: urlError } },
  signal: page.signal,
});
```

- `run(signal)` resolves with the answer. Reject only for a failure you did not turn into one, such as a network error, and `errorMessage(error)` words it. The signal aborts when an edit makes the check stale.
- `fields` maps a field name, as your server names it, to its input, which gets `aria-invalid`, and the element that says why.
- The status and the form carry `data-cp-state` for your CSS. The status becomes a polite live region unless it has a role, and never gets `aria-busy`, which would make a reader skip "Testing…".
- While busy the button is `aria-disabled` and a press does nothing. It is never `disabled`, which would move focus off it. A button with no `type` gets `type="button"`, so it never submits the form.
- It returns `{ state, start, reset }`.
