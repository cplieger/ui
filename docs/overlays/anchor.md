# anchor

`@cplieger/ui/anchor`

Native popovers placed by CSS anchor positioning. A `.cp-popover` opened by its button's `popovertarget` sits by that button and flips to stay in view. It closes on Escape and on a press outside by itself, and the browser keeps it in the top layer, so no z-index decides it.

```html
<button class="cp-button" type="button" popovertarget="row-menu">Actions</button>
<div class="cp-popover cp-menu" popover id="row-menu" role="menu">…</div>
```

```ts
import { installAnchors, showPopoverAt } from "@cplieger/ui/anchor";

installAnchors({ signal: page.signal }); // at startup
showPopoverAt(menu, event.clientX, event.clientY); // a context menu
```

- `installAnchors(opts?)` names each button and the popover it opens as a pair when the button is pressed, so CSS can place one by the other. A popover several buttons share, such as one menu for every row, follows the one pressed. It covers `popovertarget` and a `commandfor` button with a popover command. Every call shares one listener, which stays until every caller's `signal` has aborted.
- `anchorTo(popover, opener)` names one pair by hand, for a popover your code opens.
- `showPopoverAt(popover, x, y)` opens a popover with its corner at a point in viewport pixels, moved in so it stays inside the window.
- `.cp-popover[data-variant="panel"]` is a panel of controls rather than a list of choices.
