# Third-party notices

The drawings under `icons/svg/` named in `iconNames` are derived from [Lucide](https://github.com/lucide-icons/lucide)'s `lucide-static` release (ISC): the same lines, with a 2.25-unit stroke instead of 2 and one rewritten root element. Some of them derive from [Feather](https://github.com/feathericons/feather) (MIT). Both notices are reproduced in `icons/LICENSE-lucide`, which ships with the package. Of the five drawings in `ownIconNames`, `pin-filled`, `heart-filled`, `funnel-filled` and `tag-filled` are Lucide's `pin`, `heart`, `funnel` and `tag` filled, under the same notice, and `spinner-arc` is this package's own.

The fonts under `fonts/` are [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) and [Atkinson Hyperlegible Mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono), copied unchanged from the [Fontsource](https://fontsource.org) `@fontsource-variable` 5.3.0 releases (SIL Open Font License 1.1). Each license text ships beside the files as `fonts/LICENSE-atkinson-hyperlegible-next` and `fonts/LICENSE-atkinson-hyperlegible-mono`.

The check and dash marks under `icons/marks/` are this package's own drawings. No other third-party source is included in this repository.

One design is followed:

- The harmony colours in `css/system.css`, written into `src/foundations/colour/ladders.css` by `src/system/system-css.node.test.ts`, follow the method of [pro-color-harmonies](https://github.com/meodai/pro-color-harmonies) (MIT), itself after [color-palette-generator](https://github.com/royalfig/color-palette-generator): hue turns in OKLCH from a lead colour, a lightness each hue needs, and moves away from muddy hues. The numbers are this package's own, and no code is copied.
