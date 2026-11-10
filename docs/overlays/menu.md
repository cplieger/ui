# menu

`@cplieger/ui/menu`

The [menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) over a native popover. The button opens a `role="menu"` popover by `popovertarget`, and the popover closes on Escape and on a press outside, returning focus to the button.

```html
<button class="cp-button" type="button" popovertarget="sort">Sort</button>
<div class="cp-popover cp-menu" popover id="sort" role="menu">
  <div class="cp-menu-label">Sort by</div>
  <div role="group" aria-label="Sort by">
    <button role="menuitemradio" aria-checked="true" type="button">Name</button>
    <button role="menuitemradio" aria-checked="false" type="button">Added</button>
  </div>
  <hr>
  <button role="menuitemcheckbox" aria-checked="false" type="button">Show posters</button>
  <button role="menuitem" type="button" data-tone="danger">Clear filters</button>
</div>
```

```ts
import { installAnchors } from "@cplieger/ui/anchor";
import { enhanceMenu } from "@cplieger/ui/menu";

installAnchors({ signal: page.signal });
enhanceMenu(button, menu, { onSelect: (item) => run(item), signal: page.signal });
```

- The menu opens with focus on its first item, and ArrowDown and ArrowUp on the button open it at the first or the last item.
- The arrow keys wrap through the items, Home and End go to the ends, and typed letters jump to the item they start. The same letter again steps through the items it starts.
- A `menuitem` that is chosen closes the menu and calls `onSelect`. A `menuitemcheckbox` toggles its `aria-checked`, and a `menuitemradio` checks itself and unchecks the others in its `role="group"`. Both keep the menu open and then call `onSelect`.
- An item with `aria-disabled="true"` takes focus but cannot be chosen.
- Aborting `signal` closes the menu and removes the button's ARIA.

## Context menu

`enhanceContextMenu(zone, menu, { onOpen, onSelect, hold, signal })` opens a `popover="manual"` menu at the pointer on a right click inside `zone`, or on a finger held still for `hold` ms (500 by default). `onOpen` gets the element pressed, so the menu can be filled for that row. A press outside or Escape closes it. The hold selects no text and opens no browser menu, and the lift that ends it clicks nothing.
