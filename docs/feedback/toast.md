# toast

`@cplieger/ui/toast`

Short notices in a stack at the window's inline-end corner. A passing toast leaves after 7 seconds, and a pointer or focus on the stack pauses its time. An error, a toast with an action and a working toast stay until dismissed or updated.

```ts
import { toast } from "@cplieger/ui/toast";

toast({ kind: "success", title: "Saved", body: "The next check uses the new interval." });
toast({ title: "3 entries removed", actions: [{ label: "Undo", run: restore }] });

const check = toast({ title: "Checking 412 entries…", busy: true });
check.update({ kind: "success", title: "Check finished" });
```

| Option | Default | What it does |
| --- | --- | --- |
| `kind` | `"info"` | `"success"`, `"warning"` or `"error"`, which picks the glyph and the tone. An error is an alert. |
| `title`, `body` | | The words, the title in medium weight. |
| `actions` | none | Buttons, each `{ label, run, keep }`. An action closes the toast unless `keep`. |
| `sticky` | true for an error or with an action | Stays until dismissed. |
| `life` | `7000` | How long a passing toast stays, in ms. |
| `busy` | false | Work in progress: a loader instead of the glyph, kept until `update`. |

- `toast()` returns `{ dismiss, update }`. `update` takes the same options and changes the toast in place: a working toast that counts keeps its loader turning, and buttons with the same labels stay where they are, so focus on one survives, while their `run` and `keep` take the new values.
- A press anywhere on a toast but its buttons dismisses it, and a finger can swipe it away. It leaves by sliding out and fading, then its row closes so the toasts above settle.
- Four show at once. The oldest passing one makes room, or the oldest of all when every one stays.
- The stack is a popover, kept inside the topmost modal dialog while one is open, since the dialog makes the rest of the page inert.
- Each toast is a live region, so it is said as it appears.
