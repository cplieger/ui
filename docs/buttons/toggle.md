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

## Toggle group

Quiet icon buttons on one track for one choice among views, such as List, Grid and Compact. One is pressed at a time, and it is raised on the track. With words in place of icons it would be a segmented choice, `.cp-segmented`, which runs on radios.

```html
<div class="cp-toggle-group" role="group" aria-label="View">
  <button class="cp-button" data-variant="quiet" type="button" aria-pressed="true" aria-label="List" data-cp-tip="List">
    <span class="cp-icon" data-cp-icon="list" aria-hidden="true"></span>
  </button>
  <button class="cp-button" data-variant="quiet" type="button" aria-pressed="false" aria-label="Grid" data-cp-tip="Grid">
    <span class="cp-icon" data-cp-icon="layout-grid" aria-hidden="true"></span>
  </button>
</div>
```

```ts
import { enhancePill } from "@cplieger/ui/pill";
import { enhanceToggleGroup } from "@cplieger/ui/toggle";

const view = enhanceToggleGroup(group, { onChange: (b) => showView(b), signal: page.signal });
enhancePill(group, { signal: page.signal });
view.set(gridButton); // a view restored from settings, without onChange
```

- A press on a button presses it and lets go of the others. A press on the pressed one keeps it pressed, so one view always holds. `onChange` runs only when the pressed button changed.
- `pressed` is the pressed button, or `null` while none is. `set(button)` presses one of the group's buttons without a press and without `onChange`.
- Each button is named by its `aria-label`, and a tooltip with the same words shows it under a mouse. A screen reader hears the pressed state from each button itself.
- With [pill](../core/pill.md), one raised pill slides to the pressed button in place of each button raising itself, also when `set` or the host presses another.
- `signal` removes the listener.
