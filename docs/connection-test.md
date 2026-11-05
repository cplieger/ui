# connection-test

`@cplieger/ui/connection-test`

The state machine behind a "Test connection" button: idle, busy, passed, failed. It runs a check you supply, writes the answer into a status element you render, and marks the field a failure names, so the message sits next to what needs fixing. You own every visual; nothing animates or fades.

## Usage

```ts
import { createConnectionTest } from "@cplieger/ui/connection-test";

const test = createConnectionTest(
  testButton,
  statusLine,
  {
    run: async (signal) => {
      const r = await fetch("/api/test-connection", { method: "POST", body: form(), signal });
      return r.json(); // { ok: true, message } or { ok: false, message, field? }
    },
    fields: { url: { input: urlInput } },
  },
  card, // optional: carries data-state and scopes the inputs whose edit resets the test
);
```

## API

- `createConnectionTest(button, status, opts, root?)` returns `{ state(), start(), reset(), dispose() }`. It throws a `TypeError` when `button` is not a `<button>`, `status` contains it, or another live control already shows its state in `status`.
- `opts.run(signal)` resolves with `{ ok: true, message }` or `{ ok: false, message, field? }`. Reject only for a failure you did not turn into an answer, such as a network error. A `run` that throws is a failure, as a rejection is. A `field` that is null, or set on a pass, is ignored.
- `opts.errorMessage(error)` words a rejected `run`. Without it the error's `message` is used, or "The test could not run."
- `opts.fields` maps a field name, as your server names it, to `{ input?, mark? }`.
- `opts.watch` lists the elements whose `input` or `change` event resets the test. Without it, every such event inside `root` does, or without `root` every `fields` input.
- `opts.busyMessage` (default "Testing…"), `opts.live` (`"status"`, the default, or `"none"`) and `opts.onChange(state, result)`.

## Notes

- `status` and `root` carry `data-state` (`idle`, `busy`, `passed`, `failed`) for your CSS. `status` never gets `aria-busy`, because a screen reader may skip a busy live region's changes and would miss "Testing…".
- A click on the button starts a test and never submits a form around it. While busy the button gets `aria-disabled="true"` and a click does nothing; it is never given `disabled`, which would move focus off it. An `aria-disabled` you set on the button yourself is put back when the test ends.
- `status` becomes a polite live region (`role="status"`) unless it already has a role. With `live: "none"` no role is written, and you announce from `onChange` yourself.
- Draw the glyph and colour from `data-state`, so the state is text, glyph and colour together. Busy always has its text.
- A failure naming a field in `fields` sets `aria-invalid="true"` on its input and adds the status element's id to the input's `aria-describedby`, giving `status` an id if it has none. Clearing removes only that id, and once no control marks the input any more, restores the `aria-invalid` it had before the first mark. `mark(message)` is called on marking and `mark(null)` on clearing. A failure naming no field you passed still shows its message.
- An edit, a new test, `reset()` or `dispose()` aborts a running test's `signal`, and its late answer is dropped. A `run` rejecting with an `AbortError` returns the control to idle.
- An answer of the wrong shape fails with "The test returned no answer." and is logged with `console.error`. An `errorMessage` that throws is logged and replaced by the default message.
- `dispose()` aborts, removes everything the control added and calls neither `onChange` nor `mark`, so clear your own marking from your owner's cleanup. After it, `start` and `reset` do nothing and `state()` reports `"idle"`. A control made under an owner ends with that owner.
