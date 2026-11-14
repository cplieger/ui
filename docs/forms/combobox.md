# combobox

`@cplieger/ui/combobox`

The [combobox with a list popup](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) over a text field and a listbox you fill. Focus stays in the field while the arrow keys move through the options, and Enter or a press accepts one. You decide which options show and what accepting one does, and the popup shows while it holds a visible option, or a line saying nothing matches.

```html
<label class="cp-label" for="jump">Jump to an entry</label>
<input class="cp-input" id="jump">
<ul class="cp-popover cp-listbox" id="jump-list" aria-label="Entries"></ul>
```

```ts
import { enhanceCombobox } from "@cplieger/ui/combobox";

enhanceCombobox(input, list, {
  onQuery: (text) => list.replaceChildren(...matches(text).map(optionRow)), // each row role="option"
  onAccept: (option) => openEntry(option.dataset.value),
  onText: (text) => showResults(text),
  onSettle: (text) => history.replaceState(null, "", `?q=${encodeURIComponent(text)}`),
  signal: page.signal,
});
```

- `onQuery(text)` runs on each edit, before the options are read. Show, hide or render the listbox's `role="option"` rows there. An option that is hidden, inside a hidden group or `aria-disabled="true"` is skipped.
- `onAccept(option)` runs after Enter on the active option or a press on one. The popup has closed. Call `refresh()` to run `onQuery` again and show the options, as a field that takes several values does.
- `onText(text)` takes Enter with no active option. Without it, Enter does what the field does alone, such as submitting its form.
- `onSettle(text)` runs once typing has paused for `settle` ms (250 by default), for work too costly for each keystroke.
- `autoActivate` makes the first option active as typing changes the options, so Enter takes the best match. `openOnFocus` shows the options as the field takes focus. Both are off by default.
- The listbox becomes a manual popover placed under `anchor`, the field by default, and takes its look from `.cp-popover.cp-listbox`. Keep it beside the field, so it stays inside any dialog that holds the field.
- `inline` keeps the listbox in place and shown, as in a [command palette](../overlays/palette.md): it is no popover, the field stays expanded, `autoActivate` makes the first option active even with no text, and Escape is left to what holds the field, such as its dialog.
- `popup` and `empty` show a line in place of the options while the typed text matches none. `popup` is the `.cp-popover.cp-listbox` that becomes the popover in the listbox's place, holding the listbox and `empty`, a `<p class="cp-listbox-empty" hidden>` whose words you write in `onQuery`. Without `empty`, the popup closes when no option is left.
- `signal` removes the listeners and the field's combobox attributes, and closes the popup.

## An option's end word

An option is the [popup option row](../overlays/menu.md#the-option-row). A muted word at its end, in a `<small>`, marks an option that can still be chosen, such as a recipient who is away. The word is part of the option's name, so a screen reader hears "@otto Dormant". An option that cannot be chosen takes `aria-disabled="true"` instead, and the keys pass it.

```html
<li role="option">@otto<small>Dormant</small></li>
```

## Options with a cover

An option that starts with a [`.cp-cover`](../design-components.md) is drawn as an entry: its cover flush with the row's start, its title in a `<strong>` over a line of facts in a `<small>`, and the list running edge to edge. Give an `<img>` in the cover `alt=""`, since the title names the entry.

```html
<div class="cp-input-row" id="jump-row">
  <div class="cp-search"><input class="cp-input" id="jump" placeholder="Title, year or group"><button class="cp-button" data-variant="quiet" type="button" aria-label="Clear"></button></div>
  <button class="cp-button" type="button">Search</button>
</div>
<div class="cp-popover cp-listbox" id="jump-popup">
  <ul id="jump-list" aria-label="Entries">
    <li role="option"><span class="cp-cover"><img src="frieren.webp" alt=""></span><strong>Frieren</strong><small>2023 · TV</small></li>
  </ul>
  <p class="cp-listbox-empty" hidden></p>
</div>
```

```ts
enhanceCombobox(input, list, {
  popup,
  empty,
  anchor: row,
  autoActivate: true,
  onQuery: (text) => {
    filter(text);
    empty.textContent = `No entry matches “${text.trim()}”`;
  },
  onAccept: (option) => openEntry(option),
  onSettle: () => announce(count() > 0 ? `${count()} entries` : empty.textContent),
});
```

## Keys

| Key | Popup closed | Popup open |
| --- | --- | --- |
| Down | open with the first option active | the next option, wrapping |
| Up | open with the last option active | the previous option, wrapping |
| Alt+Down | open with no option active | nothing |
| Alt+Up | nothing | close, keeping the text |
| Enter | `onText`, or else the field's own | accept the active option, or else `onText` |
| Escape | clear the text, or let it pass when the field is empty | close, keeping the text |
| Tab | the field's own | close, and move focus on |

The field carries `role="combobox"`, `aria-autocomplete="list"`, `aria-controls`, `aria-expanded` and `aria-activedescendant`, and the active option `aria-selected="true"`. A press on the list keeps focus in the field. The popup closes as focus leaves the field and its list. It says nothing itself. The screen reader reads the active option, and a count of results is yours to [announce](../feedback/announce.md).
