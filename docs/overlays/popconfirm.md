# popconfirm

`@cplieger/ui/popconfirm`

A small confirmation next to its button, for a short removal that does not need a dialog. A `.cp-popover[data-variant="confirm"]` holds the question and a `<form>` with its two answers, and opens by its button's `popovertarget`. It closes on Escape and on a press outside by itself.

```html
<button class="cp-button" type="button" popovertarget="remove-label">Remove</button>
<div class="cp-popover" data-variant="confirm" popover id="remove-label">
  <form>
    <p>Remove this label from 3 entries?</p>
    <div class="cp-cluster">
      <button class="cp-button" data-variant="primary" data-tone="danger" data-size="sm">Remove</button>
      <button class="cp-button" data-size="sm" type="button" commandfor="remove-label" command="hide-popover">Keep it</button>
    </div>
  </form>
</div>
```

```ts
import { installAnchors } from "@cplieger/ui/anchor";
import { enhancePopconfirm } from "@cplieger/ui/popconfirm";

installAnchors({ signal: page.signal });
enhancePopconfirm(popover, { onConfirm: () => removeLabel(), signal: page.signal });
```

- The confirming answer is the form's one submit button. `onConfirm` runs after it is pressed, once the popover has closed and focus is back on its button. Safari focuses no button on a click, so focus comes back there only on a page that called `installAnchors()`.
- The declining answer is a plain `type="button"` button whose `command="hide-popover"` closes the popover. It takes focus as the popover opens, since a removal is the harmful answer.
- A popover with no `role` becomes an `alertdialog`, named by its question, the first `<p>`, unless it has `aria-label` or `aria-labelledby`.
- A popover with no `<form>` or no `type="button"` button throws a `TypeError`.
- `signal` removes the listeners.

A removal that cannot be undone, or that names many things, asks in a [dialog](dialog.md) with `data-variant="confirm"` instead.
