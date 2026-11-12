# reorder

`@cplieger/ui/reorder`

A list the person puts in order, such as audio languages by preference or subtitle providers by priority. Each item has Move up and Move down, so one press moves it with no drag. A handle drags it with a mouse or a finger, and Alt with the Up or Down arrow moves the item holding focus. The others slide aside, the ranks renumber and the new place is said.

```html
<ol class="cp-list cp-reorder" aria-label="Audio languages, first is preferred">
  <li data-name="Japanese">
    <div class="cp-list-row">
      <span data-part="handle" aria-hidden="true"><span class="cp-icon" data-cp-icon="grip-vertical"></span></span>
      <span data-part="rank">1</span>
      <span class="cp-cell-stack">Japanese<small>Original audio</small></span>
      <span data-part="move">
        <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-move="up" aria-label="Move Japanese up" data-cp-tip="Move Japanese up"><span class="cp-icon" data-cp-icon="arrow-up" aria-hidden="true"></span></button>
        <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-move="down" aria-label="Move Japanese down" data-cp-tip="Move Japanese down"><span class="cp-icon" data-cp-icon="arrow-down" aria-hidden="true"></span></button>
      </span>
    </div>
  </li>
</ol>
```

```ts
import { installAnnouncer } from "@cplieger/ui/announce";
import { enhanceReorder } from "@cplieger/ui/reorder";

installAnnouncer({ signal: page.signal });
enhanceReorder(list, {
  onChange: (items) => save(items.map((li) => li.dataset.name)),
  signal: page.signal,
});
```

## API

- `enhanceReorder(list, opts?)` wires an `<ol>` or `<ul>` whose `<li>` items are the things to order. An item holds any content, a card with its own switch, fields and buttons included, and these parts, each optional:
  - `[data-part="handle"]`, the grip a pointer drags, `aria-hidden` since the buttons and the keys do the same for everyone else.
  - `[data-part="rank"]`, which the module numbers from 1.
  - Buttons `[data-move="up"]` and `[data-move="down"]`, usually inside a `[data-part="move"]` at the end of the item's line.
- `ReorderOptions` = `{ name?, words?, onChange?, signal? }`.
  - `name(item)` is the item's name in what is said, by default its `data-name`, else its text. Set `data-name` on an item that holds more than its name.
  - `words(name, position, count)` is what is said after a move, by default "Japanese, position 2 of 3".
  - `onChange(items, moved)` runs after each move that changed the order, with the items in their new order.
  - `signal` removes the listeners, drops an item being dragged where it is and clears every slide.
- Say it through [announce](../feedback/announce.md): call `installAnnouncer()` once for the page.

## Behaviour

- A move takes the moved item's neighbours across it and never takes the item itself out of the document. Focus stays on the button pressed, or the field it was in, and the item scrolls into view when focus is in it.
- The first item's Move up and the last item's Move down carry `aria-disabled="true"` and do nothing, so they keep focus and are still read. Items the app adds or removes later are numbered and given the right ends too.
- Alt with an arrow is left to a text field, a `<select>`, a combobox, a listbox and editable text, where it already moves the caret or the choice.
- A drag starts on a primary pointer's press on the handle. The item lifts with the overlay shadow and follows the pointer within the list, and the others slide aside by its height. The nearest scroller scrolls while the pointer is within 2rem of its edge, and the release, or a lost pointer, drops it at the slot it is over.
- Items slide over `--cp-dur-medium` on `--cp-ease-move`. Under reduced motion they move at once.
- A list inside an item is its own: its buttons, keys and handle move its own items only.
- The module does nothing when it is imported.
