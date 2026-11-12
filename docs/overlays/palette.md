# palette

`@cplieger/ui/palette`

A command palette, for an app with many places and actions: Ctrl+K, or Command+K on a Mac, opens a dialog near the top of the window with its search field focused, typing narrows its list of actions, the arrow keys move through them while focus stays in the field, and Enter or a press runs one. It is a `<dialog class="cp-dialog cp-palette">` over an inline [combobox](../forms/combobox.md).

```html
<button class="cp-button" type="button" commandfor="palette" command="show-modal">Open, or press <kbd>Ctrl</kbd> <kbd>K</kbd></button>
<dialog class="cp-dialog cp-palette" id="palette" aria-label="Command palette" closedby="any">
  <div class="cp-palette-field">
    <span class="cp-icon" data-cp-icon="search" aria-hidden="true"></span>
    <input aria-label="Search actions and pages" placeholder="Search actions and pages">
  </div>
  <ul role="listbox" aria-label="Actions">
    <li role="option" data-value="library"><span class="cp-icon" data-cp-icon="library" aria-hidden="true"></span><span>Go to the library</span><kbd>G L</kbd></li>
    <li role="option" data-value="settings"><span class="cp-icon" data-cp-icon="settings" aria-hidden="true"></span><span>Open settings</span><kbd>,</kbd></li>
  </ul>
  <p data-part="empty" hidden>No action matches.</p>
</dialog>
```

```ts
import { installDialogs } from "@cplieger/ui/dialog";
import { enhancePalette } from "@cplieger/ui/palette";

installDialogs({ signal: page.signal });
const palette = enhancePalette(dialog, { onRun: (option) => run(option.dataset.value), signal: page.signal });
palette.open(); // from your own code, such as a menu item
```

- `onRun(option)` runs after Enter on the active action or a press on one, as the palette closes. Focus goes back to where it was before the palette opened.
- Typing shows the actions whose words hold the text, ignoring case and the keys a `<kbd>` names. The first action shown is active, so Enter runs the best match.
- While no action matches, the `data-part="empty"` element shows and its words are said to a screen reader through [announce](../feedback/announce.md).
- `key` is the letter that opens the palette with Ctrl or Command, `"k"` by default, or `null` for none. It does nothing while another modal dialog is open.
- Each open starts with the field empty and every action shown. Escape and, with `closedby="any"`, a press outside close it.
- A dialog with no `<input>` or no `role="listbox"` throws a `TypeError`. `signal` removes the listeners, the key's among them.

The keys at an action's end are muted words, as in a [menu](menu.md). A list of every shortcut is the `.cp-keys` list in a dialog, as [Components](../design-components.md) describes.
