# toggle

`@cplieger/ui/toggle`

An on and off button such as Pin or Favourite. A press flips `aria-pressed`. While it is on, the button shows its filled drawing in its own colour, the accent for a pin and a red for a favourite. A change plays the drawing's motion: a pin drops in and lifts out, and a heart beats. A toggle that starts on does not play it.

```html
<button class="cp-button cp-toggle" data-variant="quiet" data-kind="pin" aria-pressed="false" aria-label="Pin" type="button">
  <span class="uip-icon" data-uip-icon="pin" aria-hidden="true"></span>
  <span class="uip-icon" data-uip-icon="pin-filled" data-uip-part="on" aria-hidden="true"></span>
</button>
```

```ts
import { enhanceToggle } from "@cplieger/ui/toggle";

const pin = enhanceToggle(button, { onChange: (on) => api.setPinned(id, on), signal: page.signal });
pin.set(false); // after the server refused, without the motion
```

- `data-kind` is `"pin"` or `"favourite"`, and picks the colour and the motion.
- `on` reads the state, and `set(on)` changes it without a press and without the motion.
- `signal` removes the listeners.
