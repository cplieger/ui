# select-panel

`@cplieger/ui/select-panel`

A choice of several from a list too long to scan, such as the labels on an entry. A `.cp-popover.cp-select-panel` holds a `<form>` with a field that filters the options, a `role="listbox"` of options to check, and the button that applies the choice. It opens by its button's `popovertarget` and closes on Escape and on a press outside by itself.

```html
<button class="cp-button" type="button" popovertarget="labels">Labels</button>
<div class="cp-popover cp-select-panel" popover id="labels" role="dialog" aria-label="Labels">
  <form>
    <input class="cp-input" aria-label="Filter labels" placeholder="Filter labels">
    <ul role="listbox" aria-label="Labels">
      <li role="option" aria-selected="false">Watch next</li>
      <li role="option" aria-selected="true">Rewatch</li>
    </ul>
    <p data-part="empty" hidden>No label matches.</p>
    <div class="cp-cluster"><button class="cp-button" data-variant="primary" data-size="sm">Apply</button></div>
  </form>
</div>
```

```ts
import { installAnchors } from "@cplieger/ui/anchor";
import { enhanceSelectPanel } from "@cplieger/ui/select-panel";

installAnchors({ signal: page.signal });
enhanceSelectPanel(panel, { onApply: (chosen) => saveLabels(chosen), signal: page.signal });
```

- As the panel opens, its field is cleared and takes focus, and the first option is active.
- Typing shows only the options whose words hold the text. The element marked `data-part="empty"`, if there is one, shows while none does, and its words are said to a screen reader through [announce](../feedback/announce.md) on a page that called `installAnnouncer()`, since focus stays in the field.
- Up and Down move the active option, wrapping, while focus stays in the field. Enter checks or unchecks the active option, and a press checks or unchecks the one pressed. An option with `aria-disabled="true"` is skipped.
- The form's one submit button applies the choice: `onApply` runs with the checked options in their order, once the panel has closed and focus is back on its button. Safari focuses no button on a click, so focus comes back there only on a page that called `installAnchors()`. Enter in the field never applies.
- Closing it any other way, by Escape or a press outside, puts back the choice it opened with.
- The field becomes a `combobox` that controls the listbox, which becomes `aria-multiselectable`, and an option is checked by its `aria-selected`. The stylesheet draws its box as a menu's check item draws its own.
- A panel with no `<form>`, no `<input>` or no `role="listbox"` throws a `TypeError`.
- `signal` removes the listeners and the active option.
