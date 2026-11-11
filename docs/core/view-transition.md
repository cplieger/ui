# view-transition

`@cplieger/ui/view-transition`

A queued, feature-detected wrapper over `document.startViewTransition`.

## Usage

```ts
import { viewTransition } from "@cplieger/ui/view-transition";

await viewTransition(() => {
  swapTheDom();
});
```

## API

- `viewTransition(fn, { from })` returns a promise that resolves when the transition, or the direct run, finishes.
- `from` reveals the new look in a circle growing from that element's centre instead of the cross-fade, as a theme toggle does. Under reduced motion the cross-fade plays.

## Notes

- Overlapping calls serialize so transitions never visually overlap.
- When the API is unavailable, the callback runs directly. The callback also runs directly while the page is hidden.
- A transition that has not finished after 1s is skipped, so later calls do not wait behind it.
- A skipped or cancelled transition resolves the promise and never rejects it.
