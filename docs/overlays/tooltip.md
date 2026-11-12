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
- The tip's words never replace the control's own name. A tip that says more than that name, the control's `aria-label` or else its own words, visually hidden ones included, also describes the control, through `aria-describedby`. On a label, as a segment of a `.cp-segmented` with icons, the tip shows when its radio has keyboard focus, and it describes the radio unless the radio's own `aria-label` already says the same words. In Safari it follows the arrow keys from radio to radio through [`@cplieger/ui/radio-focus`](../core/radio-focus.md), which `installTooltips()` installs under the same signal.
- The tip follows its control while it shows. A control that changes face, such as Send turning into Cancel, takes the tip's words and its description with it, and a control whose `data-cp-tip` is removed hides it.
