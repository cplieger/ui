# share-bar

`@cplieger/ui/share-bar`

The parts of a whole, such as a library's copies by verdict, as one bar of segments sized by share. A 2px gap separates the segments, each has a tip, and a legend of chips sits under the bar. A Table view toggle shows the same numbers as a table. The page writes the table, so the numbers are there before the script runs and without it.

```html
<section class="cp-panel" aria-labelledby="verdicts-h">
  <div class="cp-heading-row">
    <h2 id="verdicts-h">Library against SeaDex</h2>
    <button class="cp-filter-chip" type="button" aria-pressed="false" hidden><span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span>Table view</button>
  </div>
  <div class="cp-share" id="verdicts">
    <table class="cp-table">
      <caption class="cp-visually-hidden">Copies by verdict</caption>
      <thead><tr><th scope="col">Verdict</th><th scope="col" data-col="num">Copies</th></tr></thead>
      <tbody>
        <tr data-series="1"><th scope="row"><a href="/library?verdict=have_best"><span class="cp-icon" data-cp-icon="shield-check" aria-hidden="true"></span>On the best</a></th><td data-col="num"><data value="402">402</data></td></tr>
        <tr data-series="2"><th scope="row"><a href="/library?verdict=have_unlisted"><span class="cp-icon" data-cp-icon="tag" aria-hidden="true"></span>Not listed</a></th><td data-col="num"><data value="58">58</data></td></tr>
      </tbody>
    </table>
  </div>
</section>
```

```ts
import { enhanceShareBar } from "@cplieger/ui/share-bar";

enhanceShareBar(verdicts, { toggle, signal: page.signal });
```

- Each body row of the table is one part. Its first `<th>`, or its first cell, is its label, its `<data value>` its count, and its `data-series` or `data-tone` its colour. Give each part a slot of the [series colours](../design-colour.md#series-colours), the most common parts the low numbers. A row with no count of 0 or more is left out.
- A segment's tip says its label, then its count as the table writes it and its share, in the language of the page around the bar, such as "On the best: 402, 61%". A share under 10% shows up to one decimal, and a part too small for it shows its first significant digit, such as "0.01%", so a part with a count never reads as 0%. A part just short of the whole takes the decimals that tell it from the whole, such as "99.5%", so it never reads as 100%. A mouse shows it as the tip of any control, and a tap toggles it. The script starts [tooltip](../overlays/tooltip.md)'s tips itself. A part of 0 has no segment, and a whole of 0 is a bare track.
- The legend holds one chip per part, a part of 0 included. A chip holds the part's swatch, its label's content with any glyph, its count, and its share for readers only, such as ", 61%". It has the segment's tip too, which focus and a mouse show, and a tap on a chip that is not a link. Every chip has the hit area of the pointer, 24px under a mouse and 44px under a finger. A chip whose label holds a link is that link, with its `href` and its other attributes but not its `id` or `style`. Nothing a chip copies keeps an `id`, so each `id` stays on the table's own node. Readers skip the bar, since the legend says every part's words, count and share. A whole of 0 has no shares, so its chips have neither.
- `toggle` is the button that shows the table in place of the bar and the legend, and back, by its `aria-pressed`. Write it `hidden`. The script shows it, so a page without the script shows only the table. Starting it pressed starts on the table. A `.cp-filter-chip` gives it the pressed fill and check.
- A change to the table, such as a new count, a row added or an attribute of a row's link, redraws the bar and the legend, and a chip with focus keeps it.
- `signal` removes the bar, the legend and the listeners, shows the table and hides the toggle.
