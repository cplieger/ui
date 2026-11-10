# radio-focus

`@cplieger/ui/radio-focus`

Keeps the focus ring on a radio that the arrow keys move to. Safari moves focus between the radios of a group without counting the move as keyboard focus, so `:focus-visible` stops matching and the ring disappears after the first arrow press. `installRadioFocus()` puts `data-uip-focus-ring` on that radio, and `@cplieger/ui/css/system` rings it like `:focus-visible`. Chromium and Firefox already match `:focus-visible` there, so the attribute never appears in them.

## Usage

```ts
import { installRadioFocus } from "@cplieger/ui/radio-focus";

const page = new AbortController();
installRadioFocus({ signal: page.signal }); // at startup
```

A stylesheet of your own that rings radios matches both:

```css
.my-choice:has(:focus-visible, [data-uip-focus-ring]:focus) {
  outline: 2px solid Highlight;
}
```

## API

- `installRadioFocus(opts?)` starts listening on `document`. Every call shares one set of listeners.
- `RadioFocusOptions` = `{ signal? }`, an `AbortSignal` that ends the call's hold on the listeners. Once no call holds them, they go, and the attribute with them. A call without a signal holds them for the page's life. A call whose signal has already aborted installs nothing.

## When the attribute is set

- An arrow key without Alt, Ctrl or Meta, pressed on a radio, moved focus to another radio that does not match `:focus-visible`.
- It leaves when that radio loses focus, on a press anywhere, and when the listeners go.
- It is never set by a pointer, so a click on a radio still shows no ring.
