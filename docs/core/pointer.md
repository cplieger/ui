# pointer

`@cplieger/ui/pointer`

The pointer tier that `@cplieger/ui/css/system` sizes controls from: `data-pointer` on `<html>`, `fine` for a mouse or a trackpad and `coarse` for a finger or a pen. A capability query alone guesses wrong on hybrid hardware, such as a touchscreen laptop with a mouse or an iPad on a Magic Keyboard, so the tier follows the last real pointer.

## Usage

```ts
// In the external pre-paint script, before first paint:
import { applyPointerTier } from "@cplieger/ui/pointer";
applyPointerTier({ storageKey: "app.pointer" });

// In the app, once at startup:
import { installPointerTier } from "@cplieger/ui/pointer";
installPointerTier({ storageKey: "app.pointer" });
```

## API

- `applyPointerTier(opts?)` writes the first `data-pointer` and returns it. That is the tier kept under `storageKey` when there is one. Without one, it is `fine` wherever `(any-pointer: fine)` and `(any-hover: hover)` both match, as on an iPad with a trackpad. Otherwise it is `coarse` wherever `(any-pointer: coarse)` or `navigator.maxTouchPoints` reports touch, else `fine`. It never throws and leaves no listener.
- `installPointerTier(opts?)` follows each `pointerdown`: a mouse or a trackpad sets `fine` and any other pointer sets `coarse`. A mouse or a trackpad that moves without pressing also sets `fine`, so an iPad's trackpad counts before its first click. A pointer whose type the browser cannot name, an empty `pointerType`, changes nothing. With `storageKey`, it keeps the tier there for the next load. Every call shares one set of listeners, which stays until every caller's `signal` has aborted, and the first call's `storageKey` holds.
- `PointerTierOptions` = `{ storageKey? }`. Without a key, nothing is kept and every load starts from the guess.
- `PointerTierFollowOptions` adds `signal`, an `AbortSignal`. Its abort ends that call's hold, and the last one to end removes the listeners and leaves the attribute, so the page keeps its layout. A call without one holds them for the page's life.

## Notes

- A pen counts as coarse, since a stylus on a touchscreen has no hover and wants finger-sized targets.
- The listeners are passive and run in the capture phase, so a page handler that stops a `pointerdown` does not hide the input.
- A pre-paint script that imports only `applyPointerTier` bundles only it: the listeners' code is reached from `installPointerTier` alone.
- A storage that refuses a read or a write, as in a sandboxed frame, costs the next load its head start and nothing else.
