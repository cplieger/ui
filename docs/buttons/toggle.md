# toggle

`@cplieger/ui/toggle`

An on and off button such as Pin, Favourite or the theme. A press flips `aria-pressed`. While it is on, the button shows its other drawing, for a pin or a favourite filled in its own colour, the accent for a pin and a red for a favourite. A change plays the drawing's motion: a pin drops in and lifts out, a heart beats, and the theme's drawing turns over. A toggle that starts on does not play it.

```html
<button class="cp-button cp-toggle" data-variant="quiet" data-kind="pin" aria-pressed="false" aria-label="Pin" type="button">
  <span class="cp-icon" data-cp-icon="pin" aria-hidden="true"></span>
  <span class="cp-icon" data-cp-icon="pin-filled" data-part="on" aria-hidden="true"></span>
</button>
```

```ts
import { enhanceToggle } from "@cplieger/ui/toggle";

const pin = enhanceToggle(button, { onChange: (on) => api.setPinned(id, on), signal: page.signal });
pin.set(false); // after the server refused, without the motion
```

- `data-kind` is `"pin"`, `"favourite"` or `"theme"`, and picks the colour and the motion. A theme toggle is pressed while the theme is dark, keeps the ink it sits on, and turns its drawing over on a change, `sun` at rest and `moon` marked `data-part="on"`. Its `onChange` applies the theme inside `viewTransition(apply, { from: button })` from [view-transition](../core/view-transition.md), so the new look grows from the button.
- `on` reads the state, and `set(on)` changes it without a press and without the motion.
- `signal` removes the listeners.
