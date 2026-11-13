# ask

`@cplieger/ui/ask`

One question in a modal confirmation: a yes or no that resolves true or false; with `input`, a value that resolves its text or null; with `choices`, the groups the action takes, which resolve their values or null.

```ts
import { ask } from "@cplieger/ui/ask";

if (await ask("Remove 4 files?", { tone: "danger", confirmLabel: "Remove" })) {
  await removeFiles();
}

const name = await ask("Rename the passkey", { input: { initialValue: current, maxLength: 64 } });
if (name !== null) {
  await rename(name);
}

const groups = await ask("Choose which to delete. The files are removed from the disk.", {
  title: "Delete subtitles for 4 episodes?",
  tone: "danger",
  choices: [
    { value: "managed", label: "3 managed files", note: "Fetched by this app", count: 3 },
    { value: "found", label: "1 found on disk", note: "Not fetched by this app", count: 1 },
  ],
  confirmLabel: (n) => (n === 0 ? "Choose what to delete" : `Delete ${String(n)} ${n === 1 ? "file" : "files"}`),
  cancelLabel: "Keep them",
});
if (groups !== null) {
  await deleteSubtitles(groups);
}
```

| Option | Default | What it does |
| --- | --- | --- |
| `title` | none | A heading over the message. Without it the message is the heading. |
| `confirmLabel`, `cancelLabel` | "OK", "Cancel" | The two buttons' words. With `choices`, `confirmLabel` may be a function of the chosen groups' count, called with 0 while none is chosen. |
| `tone` | none | `"danger"` paints the answer in the danger tone, for an action that removes or cannot be undone. |
| `focus` | `"decline"` with `tone: "danger"`, else `"answer"` | What takes focus as the question opens: the answer, or the first group when there are `choices`, or the declining button. A change nobody checked, such as an unverified proposal, is neither danger nor safe: give it `focus: "decline"` and no tone. |
| `icon` | none | A drawing from `@cplieger/ui/icons` to lead with. |
| `details` | none | Facts to see before answering, as `{ label, value }` pairs, in order, in a `.cp-facts`. |
| `input` | none | Ask for a value: `{ type, initialValue, placeholder, maxLength, autocomplete }`, or `true`. |
| `choices` | none | Ask which groups the action takes: `{ value, label, note, count }` each, listed as checkboxes in a `.cp-choices`. |

- Enter in the field answers. Cancel and Escape decline.
- A yes or no and a question with choices are an `alertdialog`, described by the message when there is a title. A value question is a dialog named by its heading.
- No group is chosen to start, and the answer stays disabled until one is. `count` defaults to 1, so without counts the function gets the number of groups chosen. The answer resolves the chosen groups' values in their order.
- A question asked while another is open replaces it, and the open one answers as declined.
- Options it cannot draw throw a `TypeError` before anything opens: `details` or `choices` that are not arrays of string pairs, an empty `choices`, two choices with one value, a `count` that is not a whole number of 0 or more, `input` with `choices`, a `confirmLabel` function without `choices`, and a `tone` or `focus` outside its values.

## Which question to ask

- `ask()` is the question a script puts before an action: a yes or no, a value, or which groups. Its words come from your code, such as a count.
- A `.cp-dialog[data-variant="confirm"]` written in the page is the same confirmation, for one that a button opens by `commandfor` with no script, as [dialog](dialog.md) describes.
- [popconfirm](popconfirm.md) asks next to its button, for a short removal with no list and no input.
- [confirm](../buttons/confirm.md) asks nothing: it is the button's own busy and done cycle once the action runs.
