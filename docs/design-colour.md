# Colour

This page covers how `@cplieger/ui/css/system` builds its colours, from the seeds an app sets and the steps computed from them to light and dark, contrast, tones, harmony and series colours, and the scales that colour an amount. [Design language](design.md) covers the rest of the foundations.

## Seeds

Every colour comes from a seed, a hue in degrees and a chroma in OKLCH units:

| Seed | Default | Paints |
| --- | --- | --- |
| `--cp-accent-h`, `--cp-accent-c` | 255, 0.13 | the primary action, the current selection, links, the focus ring |
| `--cp-neutral-h`, `--cp-neutral-c` | 260, 0.008 | every surface, line and text colour |
| `--cp-brand-h`, `--cp-brand-c` | the accent's | the header and the mark |
| `--cp-danger-h`, `--cp-danger-c` | 27, 0.15 | errors and destructive actions |
| `--cp-warning-h`, `--cp-warning-c` | 75, 0.12 | states that need attention soon |
| `--cp-success-h`, `--cp-success-c` | 150, 0.12 | states that are fine |

The accent never paints a status. A chip, a notice or a dot takes a tone instead, so the colour of an action never reads as a state, and every state carries a glyph and a word as well. A badge counts, and a count is not a state, so a badge stays in the accent. Two starting points help the accent read as an action:

- Keep it about 30 degrees or more from every status hue on the same screen. If your brand is red, near hue 29, move your danger hue, for example to 355, or give the accent another hue and keep the brand for the header. A yellow brand moves the warning hue the same way, and a green one the success hue.
- Give it chroma 0.06 or more. Below that, the primary button and the current selection stop standing out from the neutrals.

These are rules of thumb. Before you settle on an accent, compare a primary button, a selected row and each status chip in both themes and in a colour-vision simulation.

## Steps and roles

Each family has 12 steps. The stylesheet fixes each step's lightness in each theme and takes the hue and chroma from the seed:

| Steps | Role |
| --- | --- |
| 1 and 2 | page and raised surfaces |
| 3 | a tone's tint, such as a chip's or a notice's, and the light theme's sunken surface |
| 4, 5 and 6 | a control's fill at rest, on hover and when pressed, and the accent's step 4 is the selected fill |
| 6 and 7 | hairlines and borders |
| 8 | a control's boundary |
| 9 and 10 | a solid fill and its hover, and the accent's step 9 is also the focus ring |
| 11 and 12 | secondary and primary text |

App CSS reads role names, and the component classes read a tone's steps. The role names are:

- Surfaces: `--cp-surface-page`, `--cp-surface-raised`, `--cp-surface-sunken`, `--cp-surface-overlay`.
- Fills and lines: `--cp-fill`, `--cp-fill-hover`, `--cp-fill-active`, `--cp-selected`, `--cp-selection-bg`, `--cp-line`, `--cp-border`, `--cp-border-strong`.
- Text: `--cp-ink`, `--cp-ink-muted`, `--cp-ink-disabled`.
- Accent: `--cp-accent`, `--cp-accent-hover`, `--cp-on-accent`, `--cp-accent-ink`, `--cp-accent-wash`, `--cp-focus-ring`.
- Brand and header: `--cp-brand`, `--cp-on-brand`, `--cp-shell-bg`, `--cp-shell-ink`, `--cp-shell-current`, `--cp-shell-hover`.
- Overlays: `--cp-backdrop`, `--cp-shadow-overlay`.
- Confirmation: `--cp-done-fill`, the green a button fills with as it confirms, dark enough for white words in both themes.

Ink on a solid fill is `contrast-color()` of that fill, so it is black or white, whichever has more contrast. In the light theme every solid is dark enough for white ink: step 9 sits at 54.8%, and greens and teals, the brightest hues at a given lightness, sit up to 2.4% lower. The three engines choose by the WCAG 2 ratio today, which the CSS specification leaves to the browser. A hover on a solid moves away from its ink, so the contrast rises when the pointer arrives.

## Light and dark

Each step is a `light-dark()` pair, so `color-scheme` picks the theme. The dark theme is designed, not inverted. Surfaces get lighter as they rise, text is never pure white, and the header turns into a deep tone of the brand.

A token resolves on the element that uses it, so a region with `color-scheme: dark` turns dark inside a light page.

Under `prefers-contrast: more`, text moves further from its surface, boundaries get stronger and the header darkens. Under `forced-colors: active`, the system colours apply, and every chip, notice, batch bar and selected control keeps a visible border. A [chart](data/chart.md)'s plot is the one exception. It keeps its theme's drawing on its theme surface, inside a `CanvasText` border, following the contrast theme's lightness.

## Contrast

The stylesheet owns lightness, and a test checks every hue at every chroma in the envelope below. These pairs hold in both themes for any seed inside it:

| Pair | Floor | With `prefers-contrast: more` |
| --- | --- | --- |
| primary text on steps 1 to 3 | 7:1 | 7:1 |
| primary and secondary text on steps 1 to 5 | 4.5:1 | 7:1 |
| a boundary on steps 1 to 3 | 3:1 | 4.5:1 |
| ink on a solid fill, at rest and on hover | 4.5:1 | 7:1 |
| header text on the header | 4.5:1 | 7:1 |

WCAG 2.2 is the floor. APCA scores can help compare two candidate seeds, but they never replace it.

The envelope is the highest chroma a hue can take while every step stays inside sRGB and every pair clears its floor. An accent or a tone at chroma 0.09 or less passes at every hue, and so does a neutral at 0.015 or less. Above that, each row of this table holds for every hue it names:

<!-- envelope:start -->
| Hues | Accent or tone | Neutral |
| --- | --- | --- |
| 0 to 14 | 0.155 | 0.015 |
| 15 to 29 | 0.150 | 0.015 |
| 30 to 44 | 0.155 | 0.015 |
| 45 to 59 | 0.145 | 0.020 |
| 60 to 74 | 0.130 | 0.020 |
| 75 to 89 | 0.120 | 0.030 |
| 90 to 104 | 0.120 | 0.045 |
| 105 to 119 | 0.125 | 0.060 |
| 120 to 134 | 0.140 | 0.070 |
| 135 to 149 | 0.150 | 0.060 |
| 150 to 164 | 0.115 | 0.055 |
| 165 to 179 | 0.095 | 0.045 |
| 180 to 194 | 0.090 | 0.045 |
| 195 to 209 | 0.090 | 0.030 |
| 210 to 224 | 0.095 | 0.025 |
| 225 to 239 | 0.100 | 0.020 |
| 240 to 254 | 0.125 | 0.015 |
| 255 to 269 | 0.145 | 0.015 |
| 270 to 284 | 0.145 | 0.015 |
| 285 to 299 | 0.150 | 0.015 |
| 300 to 314 | 0.170 | 0.020 |
| 315 to 329 | 0.215 | 0.025 |
| 330 to 344 | 0.195 | 0.020 |
| 345 to 359 | 0.165 | 0.020 |
<!-- envelope:end -->

## Syntax colours

[highlight](content/highlight.md) marks each token with `data-token`, and these roles colour it anywhere inside `.cp`. Each clears 4.5:1 on a code block's sunken surface in both themes, and a test holds it there.

| Role | Colours | Also |
| --- | --- | --- |
| `--cp-syntax-keyword` | the accent's step 11 | medium weight |
| `--cp-syntax-string` | a fixed green, hue 145 | |
| `--cp-syntax-number` | a fixed amber, hue 60 | |
| `--cp-syntax-key` | a fixed magenta, hue 320, for JSON and YAML keys | |
| `--cp-syntax-comment` | muted ink | italic |
| `--cp-syntax-punctuation` | muted ink | |
| `--cp-syntax-inserted` | the success tone's step 4, as a line's fill | the line keeps its `+` |
| `--cp-syntax-deleted` | the danger tone's step 4, as a line's fill | the line keeps its `-` |

The string, number and key hues are fixed rather than taken from the seeds, so a string never reads as a success and a key never as an action. Each clears 7:1 on the page, raised and sunken surfaces in both themes. In forced colours every token takes `CanvasText`.

## Tones

A tone is a colour family on one element: `data-tone="accent"`, `"neutral"`, `"danger"`, `"warning"` or `"success"`. Inside it, `--cp-tone-1` to `--cp-tone-12` and `--cp-tone-on` follow the tone's hue. Chips, notices, swatches, progress bars and primary buttons read the tone, so `data-tone="danger"` on a primary button makes it a destructive one.

An app adds its own tones with two seeds:

```css
[data-tone="best"] {
  --cp-tone-h: 162;
  --cp-tone-c: 0.11;
}
```

For categories in data rather than states, such as one colour per verdict, `data-series` puts an element on one of the nine [series colours](#series-colours) instead of a tone of the app's own.

A tone is never the only signal. Every chip and notice carries a glyph and a word, so a colour-blind reader and a screen reader get the same state. A state with a glyph of its own, such as a pin or a lock, keeps it. Any other takes its tone's: `circle-check` for success, `triangle-alert` for warning, `circle-x` for danger and `info` for neutral news. No glyph serves two tones. Two tones on one screen differ in their glyph and their word, whatever their hues.

## Harmony colours

When a screen needs a few colours that belong together, such as avatars, a loader, a celebration or the stand-in of a `.cp-cover`, take them from `--cp-harmony-1` to `--cp-harmony-4` instead of picking hues by hand. Each has its ink, such as `--cp-harmony-2-on`. Categories in data, such as verdicts or a chart's series, take the [series colours](#series-colours) instead.

- 1 is the accent's solid.
- 2 and 3 are its split complement, the accent's hue turned 150 and 210 degrees.
- 4 is a lighter accent.

The partners are tuned for the eye, after the method of [pro-color-harmonies](https://github.com/meodai/pro-color-harmonies). Each sits at the lightness step 9 had before its white-ink dip, 56% in the light theme and the accent's 64% in the dark, and takes its own ink, `--cp-harmony-N-on`, which is black for many greens and teals. Yellows and ambers need more lightness to look clean, so they rise and never come out olive. A turn into the yellow-greens moves to a golden yellow (hue 90) or a clean green (hue 142), whichever is nearer. Each partner carries a fifth more chroma than the accent, capped where a hue would leave sRGB. An orange is then vivid rather than brown, and a muted accent still gets muted partners. A test checks every hue in both themes.

A yellow partner is lighter than the accent, so a mark that must stand out from the page by colour alone, such as a thin chart line, also needs an outline or a label.

## Series colours

`--cp-series-1` to `--cp-series-9` are nine colours for categories in data, such as a verdict's chip and its filter's swatch. `data-series="1"` to `"9"` on any element that reads a tone puts it on that slot, as `data-tone` does. A chip or a notice takes the slot's hue for its tint and text, and a swatch takes the slot itself for its fill. An app writes only which category takes which slot:

```html
<span class="cp-chip" data-series="3">On an alt</span>
```

The slots come from the accent by the harmony method:

- Slot 1 is the accent's hue, and slots 2 and 3 are the harmony partners' hues.
- Slots 4 to 9 are the accent turned 30, 60, 90, 120, 240 and 270 degrees, each moved out of the yellow-greens as a partner is.
- One rule sets every slot, whatever its hue. Odd slots are bright and even slots deep, 18 points apart, so two neighbours always differ in lightness, which every colour-vision deficiency keeps.
- In the light theme a bright slot is as light as 3:1 on every surface allows at its hue: about 61% for a cyan and 64% for a red, so every slot meets the page at the same contrast and none is darker than it needs to be. A deep slot is 18 points below the bright one of its hue. In the dark theme the levels are 80% and 60%, which hold 3:1 at every hue.
- Each slot takes 1.3 times the accent's chroma, between 0.13 and 0.20, and less where its hue would leave sRGB. A muted accent still gives slots that stand apart.

Tests check every accent hue in both themes. Every slot is 3:1 or more on the page, raised, sunken and overlay surfaces, and a light bright slot no more than 3.3:1 on the default ones. Neighbouring slots stay at least three just-noticeable differences apart in OKLab under simulated protanopia, deuteranopia and tritanopia, and any two slots do in full colour vision.

Neighbouring slots are the most distinct, and the order means nothing more. Give your most common categories the low numbers, and categories that sit side by side, such as the segments of one bar, neighbouring slots. A slot is never the only signal: a chip keeps its word, and a bar its legend and its numbers.

The deep level holds less colour, so a yellow on an even slot comes out a dark gold. A slot is meant for marks and fills, and words on one take `--cp-tone-on`.

## Sequential and diverging scales

Two scales colour an amount, as a heatmap's cells do, where the series colours name categories:

- `--cp-sequential-1` to `--cp-sequential-9` run from a low amount to a high one, such as posts per hour.
- `--cp-diverging-1` to `--cp-diverging-9` run either side of a middle that means something: zero, 50%, an average, a threshold or a target. Step 5 is the middle, steps 6 to 9 rise above it in the accent's hue, and steps 4 to 1 fall below it in an opposite hue.

![The default accent's two scales. In the light theme the sequential steps run from a pale sky blue to a deep navy, and the diverging steps from a dark brown through a light orange, a grey middle and a light blue to a deep blue. In the dark theme the sequential steps run from a deep blue to a pale blue, and the diverging steps from a light orange through a deep orange, a dark grey middle and a deep blue to a pale blue.](images/colour-scales.svg)

Step 1 is the lowest amount in both themes, and the further a step is from the middle or from step 1, the further it stands from the page. More is always more contrast, so a scale reads the same way in the dark theme, where its high steps are the light ones. A chart takes 2 to 9 classes, spread evenly over the nine steps with both ends kept: five classes take steps 1, 3, 5, 7 and 9.

The scales come from the accent by rule, as the series colours do:

- Lightness runs in equal steps, from 86% to 29% in the light theme and from 40% to 92% in the dark. Step 1 stops short of the surfaces, so a low cell never vanishes into them.
- The hue turns with lightness: the lightest step leans up to 30 degrees toward a yellow, hue 95, and the darkest up to 30 degrees toward a blue, hue 265. Yellows hold their colour when light and blues when dark, so a dark step is never a dirty olive. The default accent, 255, runs from a sky blue at hue 225 to a deep blue at 265.
- Each step takes the series colours' 1.3 times the accent's chroma, between 0.13 and 0.17, so the scales are as saturated as the slots. Above 75% lightness the chroma tapers to 0.4 of that at 94%, because a vivid light cyan reads as white to a protanope. Where a hue would leave sRGB, chroma stops at a fit of sRGB's boundary, [Björn Ottosson's cusp triangle](https://bottosson.github.io/posts/gamutclipping/), which keeps the chroma smooth from step to step.
- The diverging middle is a grey of the neutral seed, 86% in the light theme and 38% in the dark. The two arms match lightness step for step, so neither side looks heavier: 75, 64, 53 and 42% outward in the light theme, and 54, 63, 72 and 81% in the dark.
- The opposite arm's hue depends on the accent's: a blue, 245, for accents from 355 to 119 degrees, an orange, 55, for accents from 170 to 307, and 475 minus the accent's hue for the greens and magentas between. Blue against orange is the pair every colour-vision deficiency keeps apart. A fixed turn of 180 degrees would put a cyan accent against a pink that a deuteranope sees as the same colour. The hue changes by pieces, so an accent moved across 120, 170, 308 or 355 degrees swings the opposite arm by 109 to 124 degrees: at 120 it moves from the blue, 245, to a pink red, 355.

Tests check every accent hue by the degree, at five chromas from 0 to 0.2, in both themes, on the page, raised, sunken and overlay surfaces of the default neutral and of twelve neutral hues at chroma 0.015. Distances are in OKLab, under simulated protanopia, deuteranopia and tritanopia as well as full colour vision, and a just-noticeable difference is 0.02:

| Check | Holds |
| --- | --- |
| every step inside sRGB | always |
| neighbouring sequential steps, every vision | 0.05 apart |
| sequential steps two apart, the five-class set, every vision | 0.10 apart |
| sequential step 1 from every surface | 0.10 apart in full colour vision, 0.04 under each simulation |
| neighbouring diverging steps, every vision | 0.05 apart |
| the two arms at each distance from the middle, every vision | 0.06 apart |
| the diverging middle from every surface, every vision | 0.06 apart |
| contrast with the page at each step away from step 1 or the middle | rises |
| each scale's far steps on every surface | 4.5:1 |

No two steps need 3:1 between them. WCAG 1.4.11 exempts colour gradients that represent a measurement, such as heatmaps ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)), and 3:1 between steps would leave a scale only half the lightness range to work with. A step is never the only signal either: a chart keeps its colour key, its readings and its table, which give each exact amount.

A scale step is meant for a fill that shows an amount. No test yet holds `--cp-ink` on any step, so a chart writes no words on a cell.
