# press

`@cplieger/ui/press`

One pressed state for a mouse, a finger, a pen and the keyboard. It puts `data-uip-pressed` on the control being pressed, so a stylesheet can draw a press that also shows under a finger. `:active` alone cannot, because iOS Safari applies it only where a page listens for `touchstart`, and a quick tap in any browser holds it for a frame or two.

## Usage

```ts
import { installPress } from "@cplieger/ui/press";

const page = new AbortController();
installPress({ signal: page.signal }); // at startup
page.abort(); // removes the listeners and every data-uip-pressed they set
```

```css
.my-button:is(:active, [data-uip-pressed]) {
  transform: scale(0.97);
}
```

`@cplieger/ui/css/system` already draws its press from both, so an app on the design language only calls `installPress()`.

## API

- `installPress(opts?)` starts listening on `document`. Every call shares one set of listeners.
- `PressOptions` = `{ signal? }`, an `AbortSignal` that ends the call's hold on the listeners. Once no call holds them, they go, with every `data-uip-pressed` they set. A call without a signal holds them for the page's life. A call whose signal has already aborted installs nothing.
- An app on `@cplieger/ui/signal` passes its owner's `signal` (`createRoot((dispose, owner) => …)`), so the press ends with that owner.

## What it presses

- An enabled `button`, a `[role="button"]`, a `summary` and an `a[href]`, and a checkbox or radio through the `label` that wraps it, from the box or from the words. `disabled` or a disabled `fieldset` takes a button or a checkbox out, and `aria-disabled="true"` takes out any of them.
- The nearest of those from the event's target, inside an open shadow root too.

## When the press shows

| Input | The press shows | It ends |
| --- | --- | --- |
| Mouse | at once | when the button comes up, but not before it has shown for 150ms |
| Finger or pen | after 100ms, or at release for a quicker tap | as for a mouse |
| Space | at once, on a button, `[role="button"]`, `summary` or a checkbox or radio | when the key comes up, but not before it has shown for 150ms |
| Enter | for 150ms, on a button, `[role="button"]`, `summary` or link | on its own |

The numbers follow the platforms. Android shows a touch press after its 100ms tap timeout, and Blink holds `:active` for 150ms after a tap.

The press ends early, and shows nothing more, in three cases:

- The browser cancels the pointer, as it does when a scroll starts.
- A finger or pen travels more than 8px, Android's touch slop.
- A Space press loses focus, or the window loses focus.

A mouse dragged off its control hides the press and brings it back on return, as a native button does.

## Notes

- A component can call it for itself without stacking listeners, since a second call joins the first.
- The listeners are passive and run in the capture phase, so a handler that stops a `pointerup` does not leave a press showing, and none of them blocks scrolling.
- One press shows at a time, plus the last one finishing its 150ms.
- A key held down repeats no press, and a key with Ctrl, Alt or Meta, or one composing text, presses nothing.
- The module installs nothing when it is imported.
