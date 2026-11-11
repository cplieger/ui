# Third-party notices

The drawings under `icons/svg/` named in `iconNames` are derived from [Lucide](https://github.com/lucide-icons/lucide)'s `lucide-static` release (ISC): the same lines, with a 2.25-unit stroke instead of 2 and one rewritten root element. Some of them derive from [Feather](https://github.com/feathericons/feather) (MIT). Both notices are reproduced in `icons/LICENSE-lucide`, which ships with the package. Of the five drawings in `ownIconNames`, `pin-filled`, `heart-filled`, `funnel-filled` and `tag-filled` are Lucide's `pin`, `heart`, `funnel` and `tag` filled, under the same notice, and `spinner-arc` is this package's own.

The fonts under `fonts/` are [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) and [Atkinson Hyperlegible Mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono), copied unchanged from the [Fontsource](https://fontsource.org) `@fontsource-variable` 5.3.0 releases (SIL Open Font License 1.1). Each license text ships beside the files as `fonts/LICENSE-atkinson-hyperlegible-next` and `fonts/LICENSE-atkinson-hyperlegible-mono`.

The check and dash marks under `icons/marks/` are this package's own drawings.

## Code included

### streaming-markdown

<https://github.com/thetarnav/streaming-markdown>, MIT. The markdown parser under `src/content/markdown/` (`parser.ts`, `parser-handlers.ts`, `parser-state.ts`, `entities.ts`) is a fork of its 0.2.15 release, changed to emit to this package's sink and to parse in linear time.

```text
MIT License

Copyright (c) 2024 Damian Tarnawski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Design followed, no code included

- The harmony colours in `css/system.css`, written into `src/foundations/colour/ladders.css` by `src/system/system-css.node.test.ts`, follow the method of [pro-color-harmonies](https://github.com/meodai/pro-color-harmonies) (MIT), itself after [color-palette-generator](https://github.com/royalfig/color-palette-generator): hue turns in OKLCH from a lead colour, a lightness each hue needs, and moves away from muddy hues. The numbers are this package's own, and no code is copied.
