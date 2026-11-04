# Moving from the earlier packages

`@cplieger/ui` holds what four packages held: `@cplieger/reactive`, `@cplieger/ui-primitives`, `@cplieger/actions` and `@cplieger/fetch`. This page is for code that imports one of them.

## Imports

| Earlier import | Import from |
| --- | --- |
| `@cplieger/reactive` | `@cplieger/ui`, or `@cplieger/ui/signal` and `@cplieger/ui/dom` |
| `@cplieger/fetch` | `@cplieger/ui/fetch` |
| `@cplieger/actions` | `@cplieger/ui/actions` |
| `@cplieger/actions/testing` | `@cplieger/ui/actions/testing` |
| `@cplieger/ui-primitives/<widget>` | `@cplieger/ui/<widget>` |
| `@cplieger/ui-primitives` | the widget subpath of the same topic, such as `@cplieger/ui/dialog` for `createDialog` |
| `@cplieger/ui-primitives/css` | `@cplieger/ui/css`, on npm only |

The exported names are the same.

## What behaves differently

These differences are against the last stable release of each earlier package.

- The errors the package throws, and the message it logs when an `onError` callback throws, begin with `@cplieger/ui:` instead of `reactive:`, `ui-primitives:` or `@cplieger/fetch:`.
- `@cplieger/ui/dialog`, `/modal`, `/ask`, `/announce`, `/toast`, `/popup`, `/popover` and `/tooltip` watch the `open` attribute of dialogs from import, so they need a DOM at import and throw in Node or during server rendering. The package root and every other subpath touch no DOM at import.
- The supported browsers are Chrome or Edge 132, Firefox 133 and Safari 26 or later.
- A dialog, modal, disclosure, focus trap, popover, popup, roving focus or backdrop binding made under an owner, such as `createRoot`, a `bindList` row or an effect created under one, ends when that owner is disposed, even in the middle of an open, a close or a fade. Its own `dispose()`, `release()` or cleanup still works, and a second call does nothing.
- `createDialog` on a dialog that already has a live controller, or on a modal's `el`, throws an `InvalidStateError`. So does `open()` on a disposed dialog controller, and `openDialog(modal.el)` on a disposed modal.
- `isOpen` reports the state the controller last saw. After a change the browser makes, it updates at the next microtask or at your next call on the controller.
- A popup's or popover's `dispose()` no longer calls `onClose`.
- After `dispose()`, a disclosure's `open()`, `close()` and `toggle()`, and roving focus's `focusFirst()` and `refresh()`, do nothing.
- A dialog's live-region pair stays after the dialog closes and after `dispose()`, and announcements reach every open modal the helpers drive as well as the root.
