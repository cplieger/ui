# file

`@cplieger/ui/file`

A file field with its limits and its list. A file of a type the field does not accept, or over its size limit, is refused with a sentence on the field, and the files taken are listed by name and size. In a `.cp-drop`, the field also takes files dropped on it.

```html
<div class="cp-field">
  <label class="cp-drop">
    <span class="cp-icon" data-cp-icon="cloud-upload" aria-hidden="true"></span>
    <strong>Drop subtitle files here</strong>
    <span>or <u>choose files</u>, .ass or .srt</span>
    <input type="file" multiple accept=".ass,.srt">
  </label>
  <ul class="cp-files"></ul>
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
- A refused file leaves the field, so a form sends only the files taken. Its sentence goes on the field as [form](form.md)'s `reportErrors` shows errors, by default "Only .ass or .srt files can be added." or "Files over 10 MB can't be added.", and clears with the next choice that takes everything. The field clears only its own error, and `reportErrors` leaves it. `words` gives other `tooBig`, `wrongType` and `chosen` words.
- Without `multiple` the field takes the first file only.
- `list`, a `<ul class="cp-files">`, gets one item per file taken: its glyph, its name and its size. `fileSize(bytes)` gives the same size words, such as "12 KB" or "4.2 MB".
- Each choice is said through [announce](../feedback/announce.md), by default "2 files chosen", and `onChange` gets the files taken.
- A field nobody filled is the form's to report on submit, since the forms pattern keeps submit enabled.
- `signal` removes the listeners.
