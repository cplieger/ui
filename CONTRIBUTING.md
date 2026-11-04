# Contributing to ui

The [shared rules](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md) for commits, releases, synced files and checks apply here.

## Scope

The actions module ships no notification display and no streaming transport. An app connects its own through `configure` and `configureTransport`, so a change that builds a toast or a default transport into `src/actions/` is out of scope.

## Rules

- A subpath added, renamed or removed changes `exports` in both `package.json` and `jsr.json`, its `docs/` page, and the README `## Subpaths` and `## API` lists. `./css` stays npm only.
- An export, a `FetchConfig` setting, a `RequestOptions` field or a `/fetch` error code that changes also changes the README `## API` list and its `docs/` page table. No check compares them, so they drift unnoticed.
- Two modules start work when they load: `modal-host.ts` starts the dialog `open` observer and `dialog-engine.ts` installs the window `beforetoggle` listener. A public subpath whose evaluation reaches either one is listed in `sideEffects` in `package.json`, with every published module on its import path to that module, tests excluded. Its subpath name goes into `OBSERVES` in `src/side-effects.node.test.ts`, and also into `LISTENS` when it reaches the `beforetoggle` listener. Otherwise a bundler drops an effect-only import and the watcher never starts.
- Relative imports end in `.js`, as in `../signal/signal.js`. Consumers type-check this source under their own settings, where `nodenext` rejects an extensionless import, while the local `bundler` setting accepts one.
- Module-level state under `src/actions/` needs a test-only reset that `resetActionFramework` in `src/actions/testing.ts` calls. `src/actions/index.ts` never exports one. A missed reset leaks one test's setup into the next.
- Build new reactive state on the engine in `src/signal/signal.ts`, as `createStore`, `SignalMap` and `createCollection` are. A second subscriber list skips its glitch-free updates, cycle detection and `batch` coalescing.
- The engine ports [@preact/signals-core](https://github.com/preactjs/signals/tree/main/packages/core), last compared with version 1.14.4. Port an upstream fix with a regression test, and raise that version only after checking all of a newer release.
- Keep these deliberate deltas from upstream, each pinned by a test:
  - Equality is `Object.is`, so `NaN` equals `NaN`. Upstream compares with `!==`.
  - `signal` and `computed` take an `equals` option, or `equals: false`.
  - An effect that throws is isolated. Its error goes to `setEffectErrorHandler`'s handler and the other effects keep running. Upstream disposes the effect and rethrows.
  - The cycle guard lives in `endBatch`'s drain and un-notifies the chain it drops. Upstream guards only in the signal setter.
  - The drain is re-entrant, so a write from inside an effect starts a nested drain. A running effect that a nested drain reaches re-runs once its run returns.
  - `createRoot`, `runWithOwner` and `resource` have no upstream counterpart.
- Leave out this upstream machinery, which the port does not need:
  - The `watched` and `unwatched` hooks, `createModel` and `action`.
  - The batch snapshot that skips an A to B to A revert.
  - The `globalVersion` fast skip in `refreshComputed`. This port never unsubscribes a computed from its sources, so `DIRTY` is a complete staleness signal.
  - The error capture and rethrow in `endBatch`, because `runEffect` isolates effect errors.
- Build every widget DOM node with `el`, never with `innerHTML` or another HTML string, so caller text stays text and a page that enforces Trusted Types does not throw.
- Animate a public transition with `runTransition` from `src/primitives/transition.ts`. A hand-written style flush lets the browser merge the start and end states into one frame. A controller's own fade flushes once and arms its own `watchSettle`, so `cancelTransition` cannot strand it.
- While a modal `<dialog>` is open, chrome that must stay usable lives inside it, because `showModal()` makes everything outside it inert. Toasts and tooltips move in. A popup panel moves in only when it is not yet in the page.
- Announce regions never move. `announce` writes to the pair of every open modal and the root's, and `whenUncovered` in `src/primitives/modal-host.ts` empties them before a close uncovers one.
- A shared `--uip-*` token that changes also changes `docs/css.md`.
