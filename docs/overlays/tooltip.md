# tooltip

`@cplieger/ui/tooltip`

A short name or hint for a control, from its `data-cp-tip`, in one native popover placed above the control by CSS anchor positioning.

```html
<button class="cp-button" data-variant="quiet" type="button" aria-label="Settings" data-cp-tip="Settings">…</button>
```

```ts
import { installTooltips } from "@cplieger/ui/tooltip";

installTooltips({ signal: page.signal }); // at startup
```

- A mouse that rests on the control for `delay` ms (500 by default) shows its tip, and leaving hides it. Keyboard focus shows it at once. Escape and blur hide it.
- On touch, a tap toggles the tip of a control marked `data-cp-tip-toggle`, and does nothing for the others.
- The tip's words never replace the control's own name. A tip that says more than the control's `aria-label` also describes the control, through `aria-describedby`.
- The words are read each time the tip shows, so a control whose tip names its next press stays true.
