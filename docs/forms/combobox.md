# combobox

`@cplieger/ui/combobox`

The [combobox with a list popup](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) over a text field and a listbox you fill. Focus stays in the field while the arrow keys move through the options, and Enter or a press accepts one. You decide which options show and what accepting one does, and the popup shows while it holds a visible option.

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
- `signal` removes the listeners and the field's combobox attributes, and closes the popup.

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
