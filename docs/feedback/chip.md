# chip

`@cplieger/ui/chip`

A flash for a `.cp-chip` whose state changes while the person watches, such as a service going from Up to Down on a dashboard. The chip shows its tone's solid, a little larger, and fades back to its wash over 900ms. A chip that only shows a state needs no script.

## Usage

```ts
import { announce } from "@cplieger/ui/announce";
import { flashChip } from "@cplieger/ui/chip";

chip.dataset.tone = "danger";
glyph.dataset.cpIcon = "x";
word.textContent = "Down";
flashChip(chip);
announce("Down");
```

```html
<span class="cp-chip" data-tone="success">
  <span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span><span>Up</span>
</span>
```

## API

- `flashChip(chip)` starts the flash on a `.cp-chip`. It returns nothing.

## Notes

- Write the new tone, glyph and word first, then call `flashChip`. The flash reads the chip's tone, so a tone that changes during a flash flashes the new one.
- A second call during a flash starts it again from its solid.
- The flash sets `data-cp-flash` on the chip and removes it when the flash ends. css/system draws it, and the chip's size in the layout never changes.
- Under reduced motion the chip keeps the colour and does not grow.
- The flash is only seen. When the change matters to someone not looking, say it through `@cplieger/ui/announce`.
- Flash a change the person did not cause. A chip that changes because of their own press already has their attention.
- A chip is a state, never a control: it has no hit area of its own, so a press belongs to a button beside it.
