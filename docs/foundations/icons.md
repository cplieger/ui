# icons

`@cplieger/ui/icons`

A small set of [Lucide](https://lucide.dev)'s drawings in the package's own stroke, and a few drawings of its own, shipped as SVG files, and a factory that paints one through a CSS mask in the text colour of the element around it. The factory builds the element. Your app serves the files and owns the CSS.

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
type AppIcon = "star" | "star-off";

const { icon } = createIcons<AppIcon>({ url: (name) => assetURL[`${name}.svg`] });
```

Without `@cplieger/ui/css/system`, which carries this rule, add the rule below to your own stylesheet.

```css
.cp-icon {
  display: inline-block;
  flex: none;
  inline-size: var(--icon-size);
  block-size: var(--icon-size);
  background-color: currentColor;
  mask: var(--cp-icon-image) center / contain no-repeat;
}
.cp-icon[data-cp-icon-size="inline"] { --icon-size: 1em; }
/* ui, lg and hero take your own sizes, such as 20px, 24px and 48px. */

@media (forced-colors: active) {
  .cp-icon { forced-color-adjust: none; }
  @supports (forced-color-adjust: preserve-parent-color) {
    .cp-icon { forced-color-adjust: preserve-parent-color; }
  }
}
```

In forced colours Chromium replaces `background-color` with a system colour, which paints the mask in the page's background colour, so the icon would vanish. The rule opts the icon out, so it keeps `currentColor`, and the two engines then differ. Firefox forces colours during the cascade, so with `none` the icon's own `color` is already the forced colour of its button, link or selected row. Chromium forces them afterwards, so with `none` the icon would inherit the author's colour, and `preserve-parent-color` is what makes it inherit the forced one. Firefox does not support that value, so the `@supports` block applies only where it is needed.

## With no script

`@cplieger/ui/css/system` paints every glyph the library's own markup and stylesheet use by its `data-cp-icon` alone, so a page that runs no script, such as a sign-in page under a strict content policy, writes the span and nothing else:

```html
<span class="cp-icon" data-cp-icon="circle-check" aria-hidden="true"></span>
```

The glyphs it paints with no script: `arrow-down`, `arrow-right`, `arrow-up`, `bell`, `bell-ring`, `check`, `chevron-down`, `chevron-right`, `circle-alert`, `circle-check`, `circle-dashed`, `circle-x`, `clock`, `cloud-upload`, `copy`, `download`, `ellipsis`, `external-link`, `eye`, `eye-off`, `file-text`, `funnel`, `funnel-x`, `grip-vertical`, `heart`, `heart-filled`, `history`, `info`, `key-round`, `layout-dashboard`, `layout-grid`, `library`, `list`, `lock`, `log-in`, `log-out`, `moon`, `octagon-alert`, `pin`, `pin-filled`, `plus`, `radio-tower`, `refresh-cw`, `save`, `search`, `settings`, `shield-check`, `spinner-arc`, `sun`, `tag`, `telescope`, `timer`, `trash-2`, `triangle-alert`, `tv`, `user`, `users`, `wifi-off`, `x`.

The URL `createIcons` sets on its span wins over these rules, and since they weigh one class, so does a rule for the same name in a stylesheet loaded after the system's. Any other glyph takes `createIcons`, or a rule in your own stylesheet that sets `--cp-icon-image` for its name, since a strict `style-src` blocks a `style` attribute.

A test fails when the library's markup or stylesheet uses a glyph this list does not draw.

## API

- `createIcons(opts)` returns `{ icon(name, size?) }`. Give exactly one of `opts.url`, a function from a name to its file's URL, and `opts.base`, a URL prefix ending in `/` that `name + ".svg"` is appended to. Any other `opts` throws a `TypeError`.
- `icon(name, size = "ui")` returns a new `<span class="cp-icon" aria-hidden="true">` with `data-cp-icon` set to the name and `data-cp-icon-size` set to the size. It sets `--cp-icon-image: url("…")` through the CSSOM, which a `style-src` without `'unsafe-inline'` allows. A page that runs no script writes the same span, which the system stylesheet paints for the glyphs [With no script](#with-no-script) lists and a rule of your own paints for any other.
- `iconNames` lists the Lucide drawings, typed `LucideIconName`, and `ownIconNames` the package's own, typed `OwnIconName`. Each list is sorted. Together they name every shipped file, and `IconName` is their union.
- `IconSize` is `"inline" | "ui" | "lg" | "hero"`.

## Notes

- The icon is decorative. Give the control that holds it its accessible name: visible text, or an `aria-label` on an icon-only button.
- `--icon-size` is yours to declare. The package neither reads nor sets it, so it has no `--cp-` prefix.
- A mask paints the file's alpha, so the stroke is part of each drawing, 2.25 units on the 24-unit grid, and scales with the size.
- A file your server does not serve paints nothing. Check the copied names in your build.
- The Lucide drawings keep the pinned `lucide-static` release's lines and take the package's own style: a 2.25-unit stroke, round caps and joins, and one root element. `npm run icons:sync` writes the names in `iconNames` from that release in this style, and a test fails when a shipped file differs from what it would write. A drawing is added when an app needs it. Lucide's ISC notice, with the MIT notice for the drawings derived from Feather, ships as `icons/LICENSE-lucide`, and each file keeps Lucide's licence line.
- The set covers the generic actions, states and objects the cplieger apps share.
- Five drawings are the package's own, for states and motions Lucide lacks. `pin-filled`, `heart-filled`, `funnel-filled` and `tag-filled` are Lucide's `pin`, `heart`, `funnel` and `tag` filled, for an on state that reads as the same mark. `spinner-arc` is a quarter arc for a button's busy state. All use the same grid and stroke, and a test fails if a Lucide release ever ships one of their names.
- `@cplieger/ui/css/system` carries the `.cp-icon` rule inside `class="cp"`, with sizes of 1em, 18px, 24px and 48px, and the rules that draw the glyphs [With no script](#with-no-script) lists.
