# turn

`@cplieger/ui/turn`

A button whose icon acts out its word, such as Refresh. Its icon turns once per press, speeding up and slowing down. While work runs, it keeps turning and finishes the turn in progress when the work ends, so the icon always comes to rest upright. Under reduced motion the icon pulses instead.

```ts
import { turn, turnWhile } from "@cplieger/ui/turn";

button.addEventListener("click", () => {
  void turnWhile(button, api.refresh());
});
```

- `turn(button)` plays one turn of the button's `.uip-icon`. A turn already playing keeps going.
- `turnWhile(button, work)` turns the icon and marks the button `aria-busy="true"` until `work` settles, then resolves or rejects as `work` does.
