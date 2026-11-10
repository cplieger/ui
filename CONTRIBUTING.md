# Contributing to ui

The [shared rules](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md) for commits, releases, synced files and checks apply here.

## Scope

Signals, DOM rendering, requests and server actions are in [`@cplieger/reactive`](https://github.com/cplieger/reactive), so a change that adds a reactive layer or a request client here is out of scope.

## Rules

- A subpath added, renamed or removed changes `exports` in both `package.json` and `jsr.json`, its `docs/` page, the README module list, and `PURE` in `src/side-effects.node.test.ts`. `./css/system`, `./fonts/*` and the icon file subpaths stay npm only.
- A listener or an element a module adds goes in an `install…` or `enhance…` call, never at load: `src/side-effects.node.test.ts` fails a subpath whose effect-only import leaves code.
- An install the page shares counts its callers and keeps its listeners until every caller's `signal` has aborted, so one part's teardown never removes another part's listeners.
- Relative imports end in `.js`. Consumers type-check this source under `nodenext`, which rejects an extensionless import that the local `bundler` setting accepts.
- Build nodes with DOM calls and `textContent`, never with `innerHTML` or another HTML string, so caller text stays text and a page that enforces Trusted Types does not throw.
- A modal `<dialog>` makes the rest of the page inert, popovers shown after it included. Anything that must stay readable or pressable while one is open lives inside it, as the toast stack does, and `announce` writes into it.
- Nothing a person does waits on a timer: a busy page starves timers for seconds. A dismissal is armed in the task that opens what it dismisses. Only a deliberate length of time, such as a hold or a tooltip's rest, is timed.
- The design language's elements live by purpose, one folder each: `src/<category>/<element>/` holds its CSS, its script only where the platform has no behaviour for it, and its tests. A new category also goes into `CATEGORIES` in `vitest.config.ts`, or no test project runs its browser tests.
- `css/system.css` is built, never edited: `npm run system:sync` writes the colour block into `src/foundations/colour/ladders.css`, then concatenates `src/system/header.css` and every file `src/system/manifest.txt` lists, in its order. An element file goes into the manifest at its place in the cascade, and a test fails while the built file is stale or a file is missing from the list.
- The browser tests of the category folders and of `src/system/` run in Chromium by default, as CI does. `UI_ENGINES=chromium,firefox,webkit npm test` runs them in all three, which is how a change to an element is checked before it lands. A test that emulates a media feature needs Chromium's DevTools protocol, so it skips the other two.
