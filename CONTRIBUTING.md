# Contributing to ui

The [shared rules](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md) for commits, releases, synced files and checks apply here.

## Scope

Signals, DOM rendering, requests and server actions are in [`@cplieger/reactive`](https://github.com/cplieger/reactive), so a change that adds a reactive layer or a request client here is out of scope.

## Rules

- A subpath added, renamed or removed changes `exports` in both `package.json` and `jsr.json`, its `docs/` page, the README module list, and `PURE` in `src/side-effects.node.test.ts`. `./css/system`, `./fonts/*` and the icon file subpaths stay npm only.
- A listener or an element a module adds goes in an `install…` or `enhance…` call, never at load: `src/side-effects.node.test.ts` fails a subpath whose effect-only import leaves code. A page-wide install uses `shared()` from `src/core/lifetime/lifetime.ts`, so one caller's teardown never removes another's listeners.
- One prefix, `cp`: `.cp-*` classes, `--cp-*` properties, and `data-cp-*` for state a script writes or a hook a script reads on any element, such as `data-cp-pressed` or `data-cp-tip`. An author's option on a library element is a plain attribute, such as `data-variant` or `data-part`, as are `data-theme` and `data-pointer` on `<html>`.
- Relative imports end in `.js`. Consumers type-check this source under `nodenext`, which rejects an extensionless import that the local `bundler` setting accepts.
- Build nodes with DOM calls and `textContent`, never with `innerHTML` or another HTML string, so caller text stays text and a page that enforces Trusted Types does not throw.
- A modal `<dialog>` makes the rest of the page inert, later popovers included, so anything that must stay usable while one is open lives inside it, as the toast stack does.
- No timer stands between a person's input and its effect ([principles](docs/principles.md)): a dismissal is armed in the task that opens what it dismisses, and only a deliberate length of time, such as a hold, is timed.
- An element lives in `src/<category>/<element>/` with its CSS, its tests and, only where the platform has no behaviour for it, its script. A new category also goes into `CATEGORIES` in `vitest.config.ts`, or its browser tests never run.
- `css/system.css` is built, never edited: `npm run system:sync` writes the colour block in `src/foundations/colour/ladders.css`, then concatenates `src/system/header.css` and the files `src/system/manifest.txt` lists, in the cascade's order, and a test fails while it is stale or a file is missing from the list.
- Browser tests run in Chromium by default, as CI does. Run `CPLIEGER_BROWSERS=chromium,firefox,webkit npm test` before an element's change lands. A test that emulates a media feature needs Chromium's DevTools protocol and skips the other two.
- `gallery/` holds every approved element on a card, and `npm run gallery` builds it into `gallery/dist/`. `gallery/legacy/` holds the gallery's own versions of the elements not yet in `src/`: an element moves in when its card looks and behaves as before from the library's code, and that change deletes its legacy version.
