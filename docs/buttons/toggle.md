# toggle

`@cplieger/ui/toggle`

An on and off button such as Pin, Favourite, Notify me or the theme. A press flips `aria-pressed`. While it is on, the button shows its other drawing, in its tone when it has one. A change plays its motion. A toggle that starts on does not play it, nor does one pressed while it is not drawn, as from a toolbar's [More menu](overflow.md).

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

- `on` reads the state, and `set(on)` changes it without a press and without the motion.
- `signal` removes the listeners.

## Its tone and its motion

Two attributes make any kind of toggle:

- `data-tone` colours it while it is on: the drawing takes the tone's step 9 and any words its step 11, the steps a tone gives a mark and words. With each of the library's tones the drawing clears 3:1 and the words 4.5:1 on the page and on a raised surface. An app's own [tone](../design-colour.md#tones) works too. Without one, the toggle keeps the ink around it and the drawing alone marks the state.
- `data-motion` is how a change moves:
  - `drop`: a mouse over it lifts the drawing 2px. Turning on carries it up and down past its rest as if into a board, and turning off lifts it out.
  - `beat`: a mouse over it tints the drawing in its tone, and turning on beats it once.
  - `turn`: the drawing now shown turns over into place, both ways.

  Without one, a change does not move. Under reduced motion, no motion plays and nothing lifts.

```html
<button class="cp-button cp-toggle" data-variant="quiet" data-tone="accent" data-motion="beat" aria-pressed="false" type="button">
  <span class="cp-icon" data-cp-icon="bell" aria-hidden="true"></span>
  <span class="cp-icon" data-cp-icon="bell-ring" data-part="on" aria-hidden="true"></span>
  Notify me
</button>
```

## Kinds

`data-kind` is a preset of both. A toggle's own `data-tone` or `data-motion` wins over its preset's, so `data-kind="pin" data-motion="beat"` is an accent pin that beats.

| `data-kind` | Tone | Motion |
| --- | --- | --- |
| `pin` | the accent | `drop` |
| `favourite` | its own red, a heart's and not a tone, since a tone reads as a state. Its words keep their ink. | `beat` |
| `theme` | the ink it sits on, in the header or a page | `turn` |

A theme toggle is pressed while the theme is dark, `sun` at rest and `moon` marked `data-part="on"`. Its `onChange` applies the theme inside `viewTransition(apply, { from: button })` from [view-transition](../core/view-transition.md), so the new look grows from the button.

In forced colours the drawing keeps the system's ink, and the change of drawing marks the state.
