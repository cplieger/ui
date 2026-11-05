# Third-party notices

The drawings under `icons/svg/` are copied unchanged from [Lucide](https://github.com/lucide-icons/lucide)'s `lucide-static` release (ISC). Some of them derive from [Feather](https://github.com/feathericons/feather) (MIT). Both notices are reproduced in `icons/LICENSE-lucide`, which ships with the package.

No other third-party source is included in this repository. The signal engine is a re-derivation of an upstream design, not a copy of its source, so no license text is reproduced for it.

Two designs are followed:

- The dependency graph and the scheduler in `src/signal/signal.ts` follow [@preact/signals-core](https://github.com/preactjs/signals) (MIT): the doubly-linked source and target edge nodes (`DepNode`, `SourceNode` and `TargetNode`), the pull-based glitch-free `refreshComputed`, the eager drain in `endBatch`, and the untracked `subscribe` callback (upstream `preactjs/signals#188`). The baseline is `@preact/signals-core@1.14.4`. `CONTRIBUTING.md` lists every deliberate delta from it and the upstream machinery this engine does not carry.
- The explicit dependency helper `on()` in `src/signal/signal.ts` follows [solid-js](https://github.com/solidjs/solid) (MIT), whose `on()` has the same deps-plus-body shape. `untracked()` is Solid's `untrack()` under the name Preact gives it.
