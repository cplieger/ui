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

- A mouse that rests on the control for `delay` ms (500 by default) shows its tip, and leaving hides it. That holds for a tipped part under a row's stretched action too, such as a row's `<time>` in a row that is one link ([list-row](../data/list-row.md) "The row as a target"): the tip follows the mouse from part to part while a press still follows the action. The mouse may move from the control onto the tip, which stays while the mouse is over either and hides once it leaves both. Keyboard focus shows it at once. Escape hides a shown tip and cancels one still waiting on the mouse's rest, and blur hides it.
- On touch, a tap toggles the tip of an element marked `data-cp-tip-toggle`, or of a control with `aria-disabled="true"`, whose tap runs nothing, so its tip can say why. The tip stays as the finger lifts, and a second tap on it or a tap elsewhere hides it. A tap does nothing for the others. A tip toggle is never a button: it is text or an info glyph with `tabindex="0"`, so the keyboard reaches its tip, such as a cut path or a plain legend chip.
- An info glyph, `.cp-info`, explains a piece of text that is not a control, such as a word, a figure or a heading, and never sits beside a button. It is a `<span>` inside the element that holds that text, so it shares its line, centred on the text's cap band, one `em` square in the text's secondary ink, with no fill, border or pressed state in any state. It takes `tabindex="0"`, `role="img"`, an `aria-label` naming what it explains, its words in `data-cp-tip` and `data-cp-tip-toggle`, so a mouse, the keys and a tap all show them, and it draws the focus ring only on `:focus-visible`. A finger gets the pointer's hit area round it, 44px, while the glyph keeps the text's size.

```html
<span>Seeders<span class="cp-info" tabindex="0" role="img" aria-label="About seeders" data-cp-tip="People sharing the release right now" data-cp-tip-toggle></span></span>
```
- The tip's words never replace the control's own name. A tip that says more than that name, the control's `aria-label` or else its own words, visually hidden ones included, also describes the control, through `aria-describedby`. Punctuation, spacing and case do not count as more. On a label, as a segment of a `.cp-segmented` with icons, the tip shows when its radio has keyboard focus, and it describes the radio unless the radio's own `aria-label` already says the same words. In Safari it follows the arrow keys from radio to radio through [`@cplieger/ui/radio-focus`](../core/radio-focus.md), which `installTooltips()` installs under the same signal.
- The tip follows its control while it shows. A control that changes face, such as Send turning into Cancel, takes the tip's words and its description with it, and a control whose `data-cp-tip` is removed hides it.
