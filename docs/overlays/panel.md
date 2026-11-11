# panel

`@cplieger/ui/panel`

The focus a panel of controls in a popover needs, such as a header status's panel. A `.cp-popover[data-variant="panel"]` opens by its button's `popovertarget` and closes on Escape and on a press outside by itself. It does not trap focus, since it is not modal.

```html
<button class="cp-header-status" type="button" data-state="ok" popovertarget="status">All good</button>
<div class="cp-popover" data-variant="panel" popover id="status">
  <h2>How it stands</h2>
  …
  <button class="cp-button" type="button">Run a full check</button>
</div>
```

```ts
import { installAnchors } from "@cplieger/ui/anchor";
import { enhancePanel } from "@cplieger/ui/panel";

installAnchors({ signal: page.signal });
enhancePanel(panel, { signal: page.signal });
```

- A panel with no `role` becomes a non-modal dialog, named by its first heading unless it has `aria-label` or `aria-labelledby`, so a reader hears what it is as focus lands in it.
- As the panel opens, focus moves to its first heading, which takes `tabindex="-1"`, or else to its first control.
- Tab past its last control, or past its heading when it has none, closes it, and focus goes on from the button that opened it.
- `signal` removes the listeners.
