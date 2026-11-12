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
import { enhanceMenu } from "@cplieger/ui/menu";

enhanceMenu(menu, { onSelect: (item) => run(item), signal: page.signal });
```

- `enhanceMenu` is called once per menu, however many buttons open it. Every element whose `popovertarget` or `commandfor` names the menu is an opener, including rows added later, so one menu can serve every row of a list. The menu sits by the opener pressed, and only that opener reads as expanded.
- The menu opens with focus on its first item, and ArrowDown and ArrowUp on an opener open it at the first or the last item. Choosing an item and Escape give focus back to the opener, even in Safari, where a click focuses no button.
- The arrow keys wrap through the items, Home and End go to the ends, and typed letters jump to the item they start. The same letter again steps through the items it starts.
- A `menuitem` that is chosen closes the menu and calls `onSelect`. A `menuitemcheckbox` toggles its `aria-checked`, and a `menuitemradio` checks itself and unchecks the others in its `role="group"`. Both keep the menu open and then call `onSelect`.
- An item with `aria-disabled="true"` takes focus but cannot be chosen.
- A `popover="manual"` menu closes on Escape and on a press outside it and its openers, as an automatic popover does by itself.
- Aborting `signal` removes the listeners and the openers' ARIA, and closes the menu if this call opened it.

## Context menu

`enhanceContextMenu(zone, menu, { onOpen, onSelect, hold, signal })` opens a `popover="manual"` menu at the pointer on a right click inside `zone`, or on a finger held still for `hold` ms (500 by default). `onOpen` gets the element pressed, so the menu can be filled for that row. A press outside or Escape closes it. The hold selects no text and opens no browser menu, and the lift that ends it clicks nothing. The call marks `zone` with `data-cp-context`, so under `data-pointer="coarse"` the stylesheet turns off text selection and iOS's link callout there; a mouse still selects. Aborting `signal` removes the mark.

One `popover="manual"` menu can take both calls, so a row's ⋯ button and a right click on the row open the same menu. The menu keeps one set of item listeners, so a key moves once and a check toggles once, and the call that opened it last closes it and gets `onSelect`.
