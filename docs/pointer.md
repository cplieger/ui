# pointer

`@cplieger/ui/pointer`

The pointer tier that `@cplieger/ui/css/system` sizes controls from: `data-pointer` on `<html>`, `fine` for a mouse and `coarse` for a finger or a pen. A capability query alone guesses wrong on hybrid hardware, such as a touchscreen laptop with a mouse, so the tier follows the last real pointer.

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

- `applyPointerTier(opts?)` writes the first `data-pointer` and returns it. That is the tier kept under `storageKey` when there is one, else `coarse` wherever `(any-pointer: coarse)` or `navigator.maxTouchPoints` reports touch, else `fine`. It never throws and leaves no listener.
- `installPointerTier(opts?)` follows each `pointerdown`. A mouse sets `fine` and any other pointer sets `coarse`. A pointer whose type the browser cannot name, an empty `pointerType`, changes nothing. With `storageKey`, it keeps the tier there for the next load. A second call adds a listener that writes the same values.
- `PointerTierOptions` = `{ storageKey? }`. Without a key, nothing is kept and every load starts from the guess.
- `PointerTierFollowOptions` adds `signal`, an `AbortSignal`. Its abort removes the listener and leaves the attribute, so the page keeps its layout. Without one, the listener stays for the page's life.

## Notes

- A pen counts as coarse, since a stylus on a touchscreen has no hover and wants finger-sized targets.
- The listener is passive and runs in the capture phase, so a page handler that stops a `pointerdown` does not hide the input.
- The module imports nothing, so a pre-paint script that imports `applyPointerTier` loads only this file.
- A storage that refuses a read or a write, as in a sandboxed frame, costs the next load its head start and nothing else.
