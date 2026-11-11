# Colour

This page covers how `@cplieger/ui/css/system` builds its colours, from the seeds an app sets and the steps computed from them to light and dark, contrast, tones and harmony colours. [Design language](design.md) covers the rest of the foundations.

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

The accent never paints a status. A chip, a notice or a badge takes a tone instead, so the colour of an action never reads as a state, and every state carries a glyph and a word as well. Two starting points help the accent read as an action:

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

Ink on a solid fill is `contrast-color()` of that fill, so it is black or white, whichever has more contrast. In the light theme every solid is dark enough for white ink: step 9 sits at 54.8%, and greens and teals, the brightest hues at a given lightness, sit up to 2.4% lower. The three engines choose by the WCAG 2 ratio today, which the CSS specification leaves to the browser. A hover on a solid moves away from its ink, so the contrast rises when the pointer arrives.

## Light and dark

Each step is a `light-dark()` pair, so `color-scheme` picks the theme. The dark theme is designed, not inverted. Surfaces get lighter as they rise, text is never pure white, and the header turns into a deep tone of the brand.

A token resolves on the element that uses it, so a region with `color-scheme: dark` turns dark inside a light page.

Under `prefers-contrast: more`, text moves further from its surface, boundaries get stronger and the header darkens. Under `forced-colors: active`, the system colours apply, and every chip, notice, batch bar and selected control keeps a visible border.

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

## Tones

A tone is a colour family on one element: `data-tone="accent"`, `"neutral"`, `"danger"`, `"warning"` or `"success"`. Inside it, `--cp-tone-1` to `--cp-tone-12` and `--cp-tone-on` follow the tone's hue. Chips, notices, swatches, progress bars and primary buttons read the tone, so `data-tone="danger"` on a primary button makes it a destructive one.

An app adds its own tones with two seeds:

```css
[data-tone="best"] {
  --cp-tone-h: 162;
  --cp-tone-c: 0.11;
}
```

A tone is never the only signal. Every chip and notice carries a glyph and a word, so a colour-blind reader and a screen reader get the same state. A state with a glyph of its own, such as a pin or a lock, keeps it. Any other takes its tone's: `circle-check` for success, `triangle-alert` for warning, `circle-x` for danger and `info` for neutral news. No glyph serves two tones. Two tones on one screen differ in their glyph and their word, whatever their hues.

## Harmony colours

When a screen needs a few colours that belong together, such as chart series, tags, avatars, a loader or a celebration, take them from `--cp-harmony-1` to `--cp-harmony-4` instead of picking hues by hand. Each has its ink, such as `--cp-harmony-2-on`.

- 1 is the accent's solid.
- 2 and 3 are its split complement, the accent's hue turned 150 and 210 degrees.
- 4 is a lighter accent.

The partners are tuned for the eye, after the method of [pro-color-harmonies](https://github.com/meodai/pro-color-harmonies). Each sits at the lightness step 9 had before its white-ink dip, 56% in the light theme and the accent's 64% in the dark, and takes its own ink, `--cp-harmony-N-on`, which is black for many greens and teals. Yellows and ambers need more lightness to look clean, so they rise and never come out olive. A turn into the yellow-greens moves to the nearest clean yellow or green. Each partner carries a fifth more chroma than the accent, capped where a hue would leave sRGB. An orange is then vivid rather than brown, and a muted accent still gets muted partners. A test checks every hue in both themes.

A yellow partner is lighter than the accent, so a mark that must stand out from the page by colour alone, such as a thin chart line, also needs an outline or a label.
