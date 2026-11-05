# icons

`@cplieger/ui/icons`

A small set of [Lucide](https://lucide.dev) drawings, shipped as SVG files, and a factory that paints one through a CSS mask in the text colour of the element around it. The factory builds the element. Your app serves the files and owns the CSS.

## Usage

Copy the files you use from the installed package into your static tree. On npm they are under `node_modules/@cplieger/ui/icons/svg/`, and the `./icons/svg/*` export lets a build step resolve them. A JSR install has no such export, because JSR exports only modules, so read the files from the package's `icons/svg/` directory instead.

```ts
import { createIcons } from "@cplieger/ui/icons";

const { icon } = createIcons({ base: "/static/icons/" });

const refresh = document.createElement("button");
refresh.append(icon("refresh-cw"), "Refresh");
```

A bundle that content-hashes its assets passes a resolver instead of a prefix, and an app with its own drawings passes its own name union:

```ts
type AppIcon = "pin" | "unpin";

const { icon } = createIcons<AppIcon>({ url: (name) => assetURL[`${name}.svg`] });
```

Then add the rule below to your own stylesheet. The package ships no CSS for the icon.

```css
.uip-icon {
  display: inline-block;
  flex: none;
  inline-size: var(--icon-size);
  block-size: var(--icon-size);
  background-color: currentColor;
  mask: var(--uip-icon) center / contain no-repeat;
}
.uip-icon[data-uip-icon-size="inline"] { --icon-size: 1em; }
/* ui, lg and hero take your own sizes, such as 20px, 24px and 48px. */

@media (forced-colors: active) {
  .uip-icon { forced-color-adjust: none; background-color: CanvasText; }
  @supports (forced-color-adjust: preserve-parent-color) {
    .uip-icon { forced-color-adjust: preserve-parent-color; background-color: currentColor; }
  }
}
```

In forced colours the browser replaces `background-color` with a system colour, which paints the mask in the page's background colour, so the icon would vanish. `preserve-parent-color` keeps the icon in the forced text colour of its button or link. Where it is unsupported, the icon falls back to `CanvasText`. `forced-color-adjust: none` alone is not enough: the icon's own `color` then inherits the parent's unforced colour.

## API

- `createIcons(opts)` returns `{ icon(name, size?) }`. Give exactly one of `opts.url`, a function from a name to its file's URL, and `opts.base`, a URL prefix ending in `/` that `name + ".svg"` is appended to. Any other `opts` throws a `TypeError`.
- `icon(name, size = "ui")` returns a new `<span class="uip-icon" aria-hidden="true">` with `data-uip-icon` set to the name and `data-uip-icon-size` set to the size. It sets `--uip-icon: url("…")` through the CSSOM, which a `style-src` without `'unsafe-inline'` allows.
- `iconNames` lists the shipped drawings, sorted, and `IconName` is their union.
- `IconSize` is `"inline" | "ui" | "lg" | "hero"`.

## Notes

- The icon is decorative. Give the control that holds it its accessible name: visible text, or an `aria-label` on an icon-only button.
- `--icon-size` is yours to declare. The package neither reads nor sets it, so it has no `--uip-` prefix.
- A mask paints the file's alpha, so the stroke is part of each drawing (2 units on Lucide's 24-unit grid) and scales with the size.
- A file your server does not serve paints nothing. Check the copied names in your build.
- The drawings are byte-for-byte the pinned `lucide-static` release. `npm run icons:sync` copies the listed names from it, and a test fails when a shipped file differs from it. A drawing is added when an app needs it. Lucide's ISC notice, with the MIT notice for the drawings derived from Feather, ships as `icons/LICENSE-lucide`.
