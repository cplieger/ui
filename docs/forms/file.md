# file

`@cplieger/ui/file`

A file field with its limits and its list. A file of a type the field does not accept, or over its size limit, is refused with a sentence on the field, and the files taken are listed by name and size. In a `.cp-drop`, the field also takes files dropped on it. Each file sent lists its upload's state, with Retry when it fails.

```html
<div class="cp-field">
  <label class="cp-drop">
    <span class="cp-icon" data-cp-icon="cloud-upload" aria-hidden="true"></span>
    <strong>Drop subtitle files here</strong>
    <span>or <u>choose files</u>, .ass or .srt</span>
    <input type="file" multiple accept=".ass,.srt">
  </label>
  <ul class="cp-list" data-density="compact" aria-label="Files chosen"></ul>
</div>
```

```ts
import { enhanceFiles } from "@cplieger/ui/file";

const subs = enhanceFiles(input, { maxSize: 10 * 1024 * 1024, list, onChange: queue, signal: page.signal });
subs.files; // the files the field holds
```

- A `.cp-drop` is the field's label as a dashed area, so a press anywhere in it opens the picker, and the field inside it keeps focus, which rings the whole area. A drag of files over it fills it and lifts its icon, and a drop takes them as a choice would, then fires `input` and `change` on the field.
- `accept` on the field lists the types taken, as extensions such as `.srt` or MIME types such as `image/*`. A file the picker or a drop offers outside them is refused, since a drop and a picker's "All files" both pass any type.
- `maxSize` is the largest file taken, in bytes.
- A refused file leaves the field, so a form sends only the files taken. Its sentence goes on the field as [form](form.md)'s `reportErrors` shows errors, and clears with the next choice that takes everything. The field clears only its own error, and `reportErrors` leaves it.
- The sentence is by default "Only .ass or .srt files can be added." or "Files over 10 MB cannot be added.", and `words` gives other `tooBig`, `wrongType` and `chosen` words.
- Without `multiple` the field takes the first file only.
- `list`, a [list](../data/list-row.md) such as a `ul.cp-list[data-density="compact"]`, gets one row per file taken: a `div.cp-list-row` of the `file-text` glyph, the name in a `.cp-cell-stack` and the size in its `data-part="end"`. The stylesheet draws the glyph, so it paints with no icon script, and a name with no break point wraps inside its row. The list draws nothing until the first file is taken. `fileSize(bytes)` gives the same size words, such as "12 KB" or "4.2 MB".
- Each choice is said through [announce](../feedback/announce.md), by default "2 files chosen", with a refused file's sentence after it, and `onChange` gets the files taken.
- A field nobody filled is the form's to report on submit, since the forms pattern keeps submit enabled. That error clears with the next choice the field takes whole.
- A reset of the field's form empties the list and clears the refusal.
- `signal` removes the listeners.

## Uploads

```ts
import { uploadFile } from "@cplieger/ui/file";

dialog.addEventListener("close", () => {
  for (const file of picked) {
    uploadFile(uploads, file, (f, signal) => api.upload(f, { signal }), { signal: page.signal });
  }
});
```

`uploadFile(list, file, send, options?)` appends the file's row to `list`, a `ul.cp-list[data-density="compact"]`, and uploads it through `send`, then returns the row's `li`. The row is the one `enhanceFiles` lists with the size moved under the name, so its end holds the work's state alone and a failed row's Retry leaves the name room at a phone's width, as [An item's own work](../design-patterns.md#loading) says:

- While `send` runs, the state reads "Uploading…" beside the spinner.
- `send` resolves `{ ok: true }`, and the state reads "Uploaded", said politely ("Frieren.S01E05.en.ass uploaded").
- `send` resolves `{ ok: false, message }`, and the state reads "Not uploaded", the message takes the size's place as the row's second line, and a small Retry, named "Retry Frieren.S01E05.en.ass", follows the end. The failure is said assertively, with its reason. A `send` that rejects is the same failure with "The upload did not finish." as its reason.
- `final: true` on a failure, such as a format the server refuses, would fail the same way again, so the row shows its reason and no Retry.
- Retry runs `send` again through [confirm](../buttons/confirm.md) with `done: false`: Retry turns busy, and the state and its reason stay until the answer comes. Once the file is uploaded, Retry leaves, and if it had focus the row takes it, since the row carries `tabindex="-1"`.
- `signal` aborts the `send` in flight, which gets it as its second argument, and ends Retry. An aborted upload's row stays as it was. With a `signal` already aborted, nothing is listed or sent.
- `words` gives other `uploading`, `uploaded`, `failed`, `failedWhy`, `retry` and `retrying` words, and `retryFor(name)`, `saidUploaded(name)` and `saidFailed(name, why)`.
