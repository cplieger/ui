# ask

`@cplieger/ui/ask`

One question in a modal confirmation: a yes or no that resolves true or false, or, with `input`, a value that resolves its text or null.

```ts
import { ask } from "@cplieger/ui/ask";

if (await ask("Remove 4 files?", { variant: "destructive", confirmLabel: "Remove" })) {
  await removeFiles();
}

const name = await ask("Rename the passkey", { input: { initialValue: current, maxLength: 64 } });
if (name !== null) {
  await rename(name);
}
```

| Option | Default | What it does |
| --- | --- | --- |
| `title` | none | A heading over the message. Without it the message is the heading. |
| `confirmLabel`, `cancelLabel` | "OK", "Cancel" | The two buttons' words. |
| `variant` | `"normal"` | `"destructive"` paints the answer in the danger tone and puts focus on declining. |
| `icon` | none | A drawing from `@cplieger/ui/icons` to lead with. |
| `details` | none | Facts to see before answering, as `{ label, value }` pairs, in order. |
| `input` | none | Ask for a value: `{ type, initialValue, placeholder, maxLength, autocomplete }`, or `true`. |

- Enter in the field answers. Cancel and Escape decline.
- A question asked while another is open replaces it, and the open one answers as declined.
- `details` that is not an array of string pairs throws a `TypeError` before anything opens.
