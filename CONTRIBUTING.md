# Contributing to ui

The [shared rules](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md) for commits, releases, synced files and checks apply here.

## Scope

Signals, DOM rendering, requests and server actions are in [`@cplieger/reactive`](https://github.com/cplieger/reactive), so a change that adds a reactive layer or a request client here is out of scope.

## Rules

- A subpath added, renamed or removed changes `exports` in both `package.json` and `jsr.json`, its `docs/` page, the README module list, and `PURE` in `src/side-effects.node.test.ts`. `./css/system`, `./fonts/*` and the icon file subpaths stay npm only.
- A change keeps to the [principles](docs/principles.md). Nothing runs at load: `src/side-effects.node.test.ts` fails a subpath whose effect-only import leaves code. A page-wide install uses `shared()` from `src/core/lifetime/lifetime.ts`.
- Relative imports end in `.js`. Consumers type-check this source under `nodenext`, which rejects an extensionless import that the local `bundler` setting accepts.
- A module writes and looks up only classes `css/system.css` draws, since an app may allow no other class; an element a script finds by a hook carries a `data-cp-*` attribute. `src/system/system-css.node.test.ts` fails a `cp-` class named in a module that the stylesheet lacks.
- Build nodes with DOM calls and `textContent`, never with `innerHTML` or another HTML string, so caller text stays text and a page that enforces Trusted Types does not throw.
- A modal `<dialog>` makes the rest of the page inert, later popovers included, so anything that must stay usable while one is open lives inside it, as the toast stack does.
- An element lives in `src/<category>/<element>/` with its CSS, its tests and, only where the platform has no behaviour for it, its script. A new category also goes into `CATEGORIES` in `vitest.config.ts`, or its browser tests never run.
- `css/system.css` is built, never edited: `npm run system:sync` writes the colour block in `src/foundations/colour/ladders.css`, then concatenates `src/system/header.css` and the files `src/system/manifest.txt` lists, in the cascade's order, and a test fails while it is stale or a file is missing from the list.
- CI runs the browser tests in Chromium, Firefox and WebKit, as `cplieger.browsers` in `package.json` names. Locally they run in Chromium unless `CPLIEGER_BROWSERS=chromium,firefox,webkit` names more. A test that emulates a media feature needs Chromium's DevTools protocol and skips the other two.
- `npm run gallery` builds the cards in `gallery/` into `gallery/dist/`. A card runs the gallery's own version from `gallery/legacy/` until its element moves onto `src/`, as the menus and dialogs still do, so a `src/` change shows only on cards that use the library's class or module. The move keeps the card's look and behaviour and deletes the legacy version.
