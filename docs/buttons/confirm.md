# confirm

`@cplieger/ui/confirm`

A button that confirms its own action in place. While the work runs it turns busy, with the spinner and its busy words. Then it turns green, a check draws and its words roll to the done words. After a moment it returns to rest by itself. Save, Grab and a confirmed Delete all use this cycle, and a danger button stays red as it confirms.

## Markup

```html
<button class="cp-button" data-variant="primary" type="button" id="save">
  <span class="cp-icon" data-cp-icon="save" aria-hidden="true"></span>
  <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span>
  <span class="cp-icon" data-cp-icon="check" data-part="done" aria-hidden="true"></span>
  <span class="cp-roll">Save changes</span>
</button>
```

Build the three icons with `createIcons` from `@cplieger/ui/icons`. The stylesheet shows the one that matches the button's state.

## Script

```ts
import { enhanceConfirm } from "@cplieger/ui/confirm";

const save = enhanceConfirm(button, { busy: "Saving…", done: "Saved", signal: page.signal });
button.addEventListener("click", async () => {
  try {
    if (await save.run(() => api.saveSettings(form))) {
      announce("Settings saved");
    }
  } catch (err) {
    showError(err);
  }
});
```

- `run(work)` resolves `true` once the button shows its done state. It resolves `false`, without calling `work`, while work is running or after `signal` aborts, so one request goes at a time. It also resolves `false` when `signal` aborts before `work` ends.
- A run during the done state ends it and starts at once, so a press while "Saved" shows saves the change made since.
- When `work` rejects, the button returns to rest at once and the rejection passes through. Show the error with a notice or a toast.
- Work that ends within 150ms skips the busy state. A busy state that shows lasts at least 400ms, so it never flashes.
- The button returns to the words it had when it was pressed, so a label such as "Grab 3" that follows a selection comes back right.
- The words change in sight but are not announced. Announce the outcome yourself.

| Option | Default | What it does |
| --- | --- | --- |
| `busy`, `done` | | The words while the work runs and once it is done. `done: false` is for a button whose success replaces it, such as Create in a dialog that then shows what it made: busy, then straight back to rest. |
| `width` | see below | `"glide"` follows each word's width. `"footprint"` keeps the widest word's footprint, so the buttons after it never move. `"fixed"` holds the widest word's width. |
| `hold` | `1600` | How long the done state shows, in ms. |
| `busyDelay`, `busyMin` | `150`, `400` | When the busy state starts, and how long it lasts once it shows, in ms. |
| `onRest` | none | Runs each time the button is back at rest after a run, done, failed or ended, such as for a save bar that leaves then. |
| `signal` | none | Aborting it puts the button back at rest and ends the cycle. |

The width defaults to `"fixed"` inside a `.cp-split`, so the caret never moves, to `"footprint"` in a table's `data-col="actions"` cell, and to `"glide"` elsewhere.

In a split button, the action grows over its caret while it works, and the split turns green as one shape. See [Components](../design-components.md).
