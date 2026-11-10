# roll

`@cplieger/ui/roll`

Words or a number that change by sliding. The old line slides out, the new one slides in, and the window's width glides to the new line's. Words roll up on a spring. A number rolls up when it grows and down when it shrinks. Under reduced motion the text changes at once.

```html
<span class="cp-roll">Grab</span>
<span class="cp-roll" data-uip-roll="number">100%</span>
```

```ts
import { roll } from "@cplieger/ui/roll";

roll(words, "Grabbed");
roll(zoom, "110%");
roll(zoom, "100%", { down: true });
```

- `roll(host, text, { down })` rolls a `.cp-roll` to `text`. A roll that starts while another runs takes over from the line that one was rolling to, so two lines never show side by side.
- `rollText(host)` returns the text the window shows or is rolling to.
- `measureRoll(host, text)` returns the width `text` would take in the window, in pixels.

[confirm](../buttons/confirm.md) rolls its button's words with it.
