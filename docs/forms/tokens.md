# tokens

`@cplieger/ui/tokens`

A field that holds chosen values as chips, such as search terms, languages or tags. Enter or a comma adds the typed words. With suggestions, the list narrows as you type, and Enter or a press takes an option. Left or Backspace from the field reaches the chips, where Left and Right move and Backspace or Delete removes one.

```html
<div class="cp-field">
  <label class="cp-label" for="langs">Subtitle languages, in order</label>
  <div class="cp-tokens">
    <span class="cp-token" data-value="English"><span>English</span><button type="button"></button></span>
    <input id="langs" placeholder="Add a language">
  </div>
  <ul class="cp-popover cp-listbox" id="langs-list" aria-label="Languages">
    <li role="option">French<small>fr</small></li>
    <li role="option">German<small>de</small></li>
  </ul>
</div>
```

```ts
import { enhanceTokens } from "@cplieger/ui/tokens";

const langs = enhanceTokens(box, { suggestions: list, max: 3, name: "lang", onChange: save, signal: page.signal });
langs.values; // ["English"]
```

- A chip in the markup is a `.cp-token` with `data-value`, its words and an empty remove `<button>`, which draws its own mark. The field names each remove button, by default "Remove English", and keeps it out of the tab order, since the arrow keys reach it.
- A value already there, in any case, shakes instead of doubling. Each add and removal is said through [announce](../feedback/announce.md), by default "French added" and "French removed", and `onChange` gets the values in order.
- `max` sets a limit. At the limit the field turns read-only and `aria-disabled="true"`, never disabled, so focus on it is never lost and Backspace still reaches the chips. `note`, or a `.cp-help` made after the field, says "3 chosen, the most allowed." and describes the field.
- `name` gives each chip a hidden input of that name, so a form sends the values.
- `suggestions` is a listbox that [combobox](combobox.md) drives. The field hides the options that are chosen or do not match the typed text, and opens the list as it takes focus. An option's value is its `data-value`, or else its text before any element, such as the words before a `<small>`.
- `allowNew` lets typed words become a value of their own. It is on without suggestions and off with them. With both, the last option offers to add the typed words, such as `Add “winter”`, whenever they match no option exactly.
- `words` gives other words for `remove`, `added`, `removed`, `addNew` and `full`.
- `add(value)` adds a value as a press would, and returns false when it is empty, already there or past the limit. `remove(value)` removes one.
- `signal` removes the listeners and a note the field made.
