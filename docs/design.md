# Design language

This page covers the foundations of the design language that `@cplieger/ui/css/system` implements, for colour, type, layout, touch, shape and motion. [Components](design-components.md) lists its classes. [Design patterns](design-patterns.md) covers loading, forms, tables, tabs, dialogs, notifications, first run, navigation and language. Read this page and the patterns before you build a screen with the stylesheet.

The language is for screens someone works in, such as libraries, queues, settings and logs, so the layout, the navigation and the controls stay the ones people already know.

![A library screen in the dark theme: a brand-coloured header, a filter sidebar with counts, a bar of actions for two selected rows, a notice and a table of entries with coloured verdict chips](images/system-library-dark.png)

## What an app chooses

The stylesheet fixes the controls, the navigation, the type, the spacing, the radii, the control sizes and the motion. An app chooses the rest:

1. Its colour seeds, a hue and a chroma each for its accent, its neutrals and, if it differs, its brand.
2. Its own tones, for states the built-in ones do not name, such as one hue per verdict.
3. The shapes of its own information, built from the language's tokens, such as the verdict bar of a release tracker or the timing track of a subtitle editor. These carry most of an app's identity, so give each one a job in the task.
4. Its words, so labels, buttons and messages use the app's own vocabulary.

## Set up

1. Import `@cplieger/ui/css` and `@cplieger/ui/css/system`, in either order. The `@font-face` rules point at `../fonts/`, so a bundler that follows `url()`, such as esbuild or Vite, copies the font files with the CSS.
2. Put `class="cp"` on `<html>`. Without it the file defines custom properties and fonts and styles only the `.cp-*` classes your markup uses, so an app can adopt it one subtree at a time.
3. Set your seeds in your own unlayered `:root`, after the import. The steps are computed on `:root`, so a seed set on another element changes nothing there. To colour one region differently, give it a tone.
4. Set `data-theme="light"` or `data-theme="dark"` on `<html>` before first paint from an external blocking script. `@cplieger/ui/theme` writes this attribute. With no attribute, the page follows the operating system.
5. Set `data-pointer` with [`@cplieger/ui/pointer`](pointer.md), as [Touch and mouse](#touch-and-mouse) shows.
6. Call `installPress()` from [`@cplieger/ui/press`](press.md) at startup, so a press shows under a finger too.
7. Set `lang` on `<html>`, and `dir` when the interface language reads right to left.

```css
:root {
  --cp-accent-h: 255;
  --cp-accent-c: 0.137;
  --cp-neutral-h: 255;
}
```

A JSR install reads the stylesheets, fonts and icons from the package files `css/`, `fonts/` and `icons/svg/`.

The stylesheet needs `contrast-color()`, `light-dark()`, relative `oklch()`, `color-mix()`, `@scope` and container queries, which ship in Chrome 147, Firefox 146 and Safari 26.4 and later.

## Colour

### Seeds

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

### Steps and roles

Each family has 12 steps. The stylesheet fixes each step's lightness in each theme and takes the hue and chroma from the seed:

| Steps | Role |
| --- | --- |
| 1 and 2 | page and raised surfaces |
| 3, 4 and 5 | a control's fill at rest, on hover and when pressed, and the accent's step 4 is the selected fill |
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

Ink on a solid fill is `contrast-color()` of that fill, so it is black or white, whichever has more contrast. The three engines choose by the WCAG 2 ratio today, which the CSS specification leaves to the browser. A hover on a solid moves away from its ink, so the contrast rises when the pointer arrives.

### Light and dark

Each step is a `light-dark()` pair, so `color-scheme` picks the theme. The dark theme is designed, not inverted. Surfaces get lighter as they rise, text is never pure white, and the header turns into a deep tone of the brand.

A token resolves on the element that uses it, so a region with `color-scheme: dark` turns dark inside a light page.

Under `prefers-contrast: more`, text moves further from its surface, boundaries get stronger and the header darkens. Under `forced-colors: active`, the system colours apply, and every chip, notice, batch bar and selected control keeps a visible border.

### Contrast

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

### Tones

A tone is a colour family on one element: `data-tone="accent"`, `"neutral"`, `"danger"`, `"warning"` or `"success"`. Inside it, `--cp-tone-1` to `--cp-tone-12` and `--cp-tone-on` follow the tone's hue. Chips, notices, swatches, progress bars and primary buttons read the tone, so `data-tone="danger"` on a primary button makes it a destructive one.

An app adds its own tones with two seeds:

```css
[data-tone="best"] {
  --cp-tone-h: 162;
  --cp-tone-c: 0.11;
}
```

A tone is never the only signal. Every chip and notice carries a glyph and a word, so a colour-blind reader and a screen reader get the same state. Two tones on one screen differ in their glyph and their word, whatever their hues.

## Type

- Text is Atkinson Hyperlegible Next, a face drawn so that similar letters such as I, l and 1 stay distinct. Machine text, such as file names, release names, hashes and offsets, is Atkinson Hyperlegible Mono, through `.cp-mono` or `<code>`.
- The fonts cover Latin scripts. Other scripts, such as a Japanese title, use the system's fonts.
- Mono is for machine text only. Labels, numbers and headings stay in the text face.
- The scale steps by about 1.2: 13, 14, 16, 19, 23, 28 and 34px, from `--cp-text-xs` to `--cp-text-3xl`. Interface text is 14px and metadata 13px, and no sans text is smaller. Machine text in `.cp-mono` is set at 0.92em of the text around it, because its letters run about 30% wider than the sans at the same x-height.
- Headings are `h1` 23px, `h2` 19px, `h3` 16px and `h4` 14px, at one weight (700) and one colour, balanced over their lines. The 28px and 34px steps are for an app's own large figures.
- Prose lines stop at 68 characters.
- Numbers that line up in a column use tabular figures: `data-col="num"` in a table, `.cp-count`, `<time>`, `<data>` and `<output>`.
- Labels, table heads and captions are sentence case at normal letter spacing, never tracked capitals.

## Space and layout

Spacing steps on a 4px grid, from `--cp-space-1` (4px) to `--cp-space-16` (64px). Space is tight inside a group, wide between groups, and larger above a heading than below it.

`.cp-app` lays out a screen: `.cp-header` for the mark, the destinations and the global controls, `.cp-rail` for filters, `.cp-main` for the work and `.cp-status` for one line of facts about the whole screen.

The width tiers follow the space in the window, not the device:

| Tier | Window width | Layout | Usually |
| --- | --- | --- | --- |
| Compact | under 40rem | one column, the header's toolbar on a second row, the full-width page toolbar, and only the mark of the wordmark | a phone, or a narrow split window |
| Medium | 40rem to 60rem | no rail, and destinations show their icons without their words | a tablet held upright |
| Expanded | 60rem and up | header, rail, work area and status line | a tablet held sideways, a laptop or a desktop |

Below 60rem, the rail's filters move into a sheet behind a Filters button, as [Design patterns](design-patterns.md#dialogs-and-sheets) describes.

A table column carries its priority. In a container under 64rem, `data-priority="low"` columns leave. Under 44rem, `data-priority="mid"` columns leave too. The selection box, the title, the state and the row's action never leave. A table wider than its panel scrolls inside `.cp-panel[data-flush]`. Nothing else is wider than the window at 320px, and nothing is clipped.

## Touch and mouse

Width and input are separate, since a tablet can have a trackpad and a laptop a touchscreen. The stylesheet sizes controls from `data-pointer` on `<html>`:

| `data-pointer` | Controls | Table rows | Hit area |
| --- | --- | --- | --- |
| `fine` | 32px, 26px small | 36px | 24px at least |
| `coarse` | 44px, small too | 48px | 44px at least |

[`@cplieger/ui/pointer`](pointer.md) sets it. `applyPointerTier` writes a first value from the pre-paint script, and `installPointerTier` follows each real pointer, a mouse as `fine` and a finger or a pen as `coarse`:

```ts
applyPointerTier({ storageKey: "app.pointer" }); // pre-paint
installPointerTier({ storageKey: "app.pointer" }); // at startup
```

Hover styles apply under `@media (any-hover: hover)` while `data-pointer` is not `coarse`, so a tapped control keeps no hover fill. Pressed and focus styles apply on every tier. A press scales the control to 97%, and on touch an input stays at 16px so iOS does not zoom.

A press is drawn from `:active` and from the `data-uip-pressed` that [press](press.md) sets, since iOS Safari gives a tapped control no `:active`. Controls take `touch-action: manipulation`, so a fast second tap never zooms the page.

## Shape and depth

- Radii are 4px for controls and chips, 6px for surfaces and 8px for overlays. A child inside a padded parent takes the parent's radius minus the padding, so nested corners stay concentric.
- An in-flow surface separates from its neighbour by a fill step or one line, never both. Panels are outlined, and nested cards do not exist.
- A shadow, tinted by the neutral hue, marks an overlay a gesture opened, such as a menu, a dialog or a toast, and nothing else.
- No surface, row or notice carries a coloured leading edge. A state is a tinted fill, a glyph and a word.

## Motion

Motion shows what changed.

| Token | Value | Use |
| --- | --- | --- |
| `--cp-dur-micro` | 90ms | colour and fill changes |
| `--cp-dur-short` | 160ms | small movements, a popover opening |
| `--cp-dur-medium` | 240ms | a toast entering |
| `--cp-dur-long` | 360ms | a view transition between screens |
| `--cp-dur-exit` | 120ms | anything leaving |

- Entrances ease out (`--cp-ease-out`), exits ease in (`--cp-ease-in`) and are shorter, and moves between two places use `--cp-ease-move`.
- Movement animates `transform` and `opacity`. Colour, fill and border changes take `--cp-dur-micro`. List the properties, never `transition: all`.
- Nothing animates on load, on scroll, or on an action repeated all day, such as typing or switching tabs.
- A dialog or a sheet appears at once and fades out at `--cp-dur-exit`. A popover opens at `--cp-dur-short`.
- A route change cross-fades through `@cplieger/ui/view-transition`. Inside `.cp`, the stylesheet gives it `--cp-dur-long`.
- Under `prefers-reduced-motion: reduce`, presses do not scale, the skeleton and `spinner-arc` stand still, and medium and long durations drop to `--cp-dur-short`. A loop that runs longer than 5 seconds has a pause control.
- A pulsing or beating mark is for something that is live right now, such as a running check. A static state stays still.

## Components

[Components](design-components.md) lists every class the stylesheet ships and what it is for, with the parts page that shows each one in its states.

## Icons

Icons come from `@cplieger/ui/icons`, which holds Lucide's drawings plus `pin-filled` and `spinner-arc`, all drawn with a 2-unit stroke on a 24-unit grid and painted in the text colour. Sizes are `inline` (1em), `ui` (18px), `lg` (24px) and `hero` (48px). An icon is decorative. The control that holds it carries the name, and every icon-only control, links and tabs included, has an accessible name and a tooltip with the same words. A drawing whose name ends in `-left` or `-right` faces the other way in a right-to-left context.

## Reference screens

The pages in `docs/system/` render the screens on these pages from the shipped stylesheet, with no script. After a change to either stylesheet, the pages, the fonts or the icons, run `npm run system:screens` to capture them again into `docs/images/`, and a test fails until you do.

![A subtitle item page in the light theme: a terracotta header, breadcrumbs, tabs, a neutral notice and a table of episodes with subtitle states and skeleton rows](images/system-item-light.png)

![The library screen on a phone in the dark theme: the mark and icon destinations, the header's controls on a second row, a full-width toolbar and a table of title, verdict and action](images/system-library-phone.png)

![The item page on a tablet held upright, with touch-sized controls and no sidebar](images/system-item-tablet.png)

![Every component in the dark theme](images/system-parts-dark.png)
