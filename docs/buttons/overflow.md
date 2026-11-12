# overflow

`@cplieger/ui/overflow`

A toolbar that keeps to one line. A `.cp-overflow` holds quiet small buttons and, last, a More button. As the toolbar narrows, the buttons that no longer fit leave it, last first, and More offers them in its menu in the toolbar's order. As room returns, they fade back in, and More leaves once every button fits.

```html
<div class="cp-overflow">
  <button class="cp-button" data-variant="quiet" data-size="sm" type="button"><span class="cp-icon" data-cp-icon="search" aria-hidden="true"></span>Search</button>
  <button class="cp-button cp-toggle" data-kind="pin" data-variant="quiet" data-size="sm" type="button" aria-pressed="false"><span class="cp-icon" data-cp-icon="pin" aria-hidden="true"></span><span class="cp-icon" data-cp-icon="pin-filled" data-part="on" aria-hidden="true"></span>Pin</button>
  <button class="cp-button" data-variant="quiet" data-size="sm" type="button"><span class="cp-icon" data-cp-icon="trash-2" aria-hidden="true"></span>Remove</button>
  <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-part="more" popovertarget="more-actions" hidden><span class="cp-icon" data-cp-icon="ellipsis" aria-hidden="true"></span>More</button>
  <div class="cp-popover cp-menu" id="more-actions" popover role="menu" aria-label="More actions"></div>
</div>
```

```ts
import { installAnchors } from "@cplieger/ui/anchor";
import { enhanceOverflow } from "@cplieger/ui/overflow";

installAnchors({ signal: page.signal });
const toolbar = enhanceOverflow(bar, { signal: page.signal });
```

- More is the button marked `data-part="more"`, and its `popovertarget` names an empty `role="menu"` popover. Give it `hidden`, so a page without the script never shows an empty menu. Without the script the toolbar wraps, as a `.cp-toolbar` does.
- Each button that leaves is an item in the menu with its icon and its words, or its `aria-label`. Choosing the item presses the button, so the action runs as it does from the toolbar, through the button's own click listener. A disabled button's item is disabled, and a `data-tone="danger"` button's item keeps its tone.
- A button with `aria-pressed`, such as a [toggle](toggle.md), is a check item that shows its state, and the menu stays open after it, as for any check item.
- A child that is not a button, or a button the page hid, keeps its place.
- The menu is enhanced as a [menu](../overlays/menu.md) by this call. Enhance it nowhere else.
- Focus on a button that leaves moves to More, and focus on More moves to the last button once More leaves. A menu that is open while its buttons change closes.
- The toolbar fits itself again when its own width changes and when a web font loads. `toolbar.fit()` fits it again after a button's words change or a button comes or goes.
- `signal` shows every button again, hides More and removes the listeners.
- A toolbar with no More button or no menu throws a `TypeError`.
