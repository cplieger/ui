# Contributing to ui

The [shared rules](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md) for commits, releases, synced files and checks apply here.

## Scope

The actions module ships no notification display and no streaming transport. An app connects its own through `configure` and `configureTransport`, so a change that builds a toast or a default transport into `src/actions/` is out of scope.

## Rules

- A subpath added, renamed or removed changes `exports` in both `package.json` and `jsr.json`, its `docs/` page, the README `## Subpaths` and `## API` lists, and its list in `src/side-effects.node.test.ts`. `./css`, `./css/system`, `./fonts/*` and `./icons/svg/*` stay npm only.
- An export, a `FetchConfig` setting, a `RequestOptions` field or a `/fetch` error code that changes also changes the README `## API` list and its `docs/` page table. No check compares them.
- A subpath whose import reaches `modal-host.ts` lists every published module on that path in `package.json` `sideEffects`, and goes into `OBSERVES`, plus `LISTENS` when it reaches `dialog-engine.ts`. Listed in `PURE`, a dropped watcher still passes.
- Relative imports end in `.js`. Consumers type-check this source under `nodenext`, which rejects an extensionless import that the local `bundler` setting accepts.
- Module-level state under `src/actions/` needs a test-only reset that `resetActionFramework` in `src/actions/testing.ts` calls, and `src/actions/index.ts` never exports one. A missed reset leaks one test's setup into the next.
- Build new reactive state on the engine in `src/signal/signal.ts`, as `createStore`, `SignalMap` and `createCollection` are. A second subscriber list skips its glitch-free updates, cycle detection and `batch` coalescing.
- The engine ports [@preact/signals-core](https://github.com/preactjs/signals/tree/main/packages/core). Port an upstream fix with a regression test. The behaviour `docs/signals.md` states, the cycle guard in `endBatch`'s drain and the re-entrant drain depart from upstream on purpose.
- Upstream's batch snapshot for an A to B to A revert, its `globalVersion` skip and its `endBatch` rethrow stay out. No computed here unsubscribes from its sources, so `DIRTY` is complete, and `runEffect` isolates effect errors.
- In `src/primitives`, build every widget DOM node with `el`, never with `innerHTML` or another HTML string, so caller text stays text and a page that enforces Trusted Types does not throw. An element folder imports nothing outside itself and `src/core`, so it builds its nodes with DOM calls and `textContent`, under the same ban on HTML strings.
- In `src/primitives`, animate a transition with `runTransition` from `src/primitives/transition.ts`, because a hand-written style flush lets the browser merge the start and end states into one frame. The dialog, disclosure and popup controllers arm their own `watchSettle`, so `cancelTransition` cannot strand them.
- While a modal `<dialog>` is open, chrome that must stay usable lives inside it, because `showModal()` makes the rest inert. Toasts and tooltips move in, and a popup panel only when it is not yet in the page.
- Announce regions never move. `announce` writes to the pair of every open modal and the root's, and `whenUncovered` in `src/primitives/modal-host.ts` empties them before a close uncovers one.
- A shared `--uip-*` token that changes also changes `docs/css.md`.
- The design language's elements live by purpose, one folder each: `src/<category>/<element>/` holds its CSS, its script only where the platform has no behaviour for it, and its tests. A new category also goes into `CATEGORIES` in `vitest.config.ts`, or no test project runs its browser tests.
- `css/system.css` is built, never edited: `npm run system:sync` writes the colour block into `src/foundations/colour/ladders.css`, then concatenates `src/system/header.css` and every file `src/system/manifest.txt` lists, in its order. An element file goes into the manifest at its place in the cascade, and a test fails while the built file is stale or a file is missing from the list.
- The browser tests of the category folders and of `src/system/` run in Chromium by default, as CI does. `UI_ENGINES=chromium,firefox,webkit npm test` runs them in all three, which is how a change to an element is checked before it lands. A test that emulates a media feature needs Chromium's DevTools protocol, so it skips the other two.
