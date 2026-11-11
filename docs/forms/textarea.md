# textarea

`@cplieger/ui/textarea`

A text area that grows with its text from three lines up to ten, then scrolls, and counts its characters, against a limit when it has one. The stylesheet sizes a `textarea.cp-input` to its content where the engine supports `field-sizing`, and the script does it elsewhere.

```html
<div class="cp-field">
  <label class="cp-label" for="note">Note for this release</label>
  <textarea class="cp-input" id="note"></textarea>
  <span class="cp-textarea-count" id="note-count"></span>
</div>
```

```ts
import { enhanceTextarea, utf8Length } from "@cplieger/ui/textarea";

enhanceTextarea(note, { max: 140, count: noteCount, signal: page.signal });

// A message body against a server's 64 KiB limit, its count shown only near it.
enhanceTextarea(body, {
  max: 65536,
  measure: utf8Length,
  count: bodyCount,
  words: (n, m = 0) => (n > m * 0.9 ? `${(n / 1024).toFixed(1)} of ${(m / 1024).toFixed(0)} KiB` : ""),
  submitOnModEnter: true,
  signal: page.signal,
});
```

- `count` shows the count, by default "52 / 140" with `max` and "52" without, and describes the area through `aria-describedby`. `words(length, max)` gives other words, with `max` undefined when there is no limit.
- `measure(text)` gives what the count and the limit count, by default the text's length as `maxlength` counts it. `utf8Length`, from the same module, counts the UTF-8 bytes a server's body limit sees, without encoding the text.
- `submitOnModEnter` sends the area's form on Ctrl+Enter, or ⌘+Enter on a Mac, through its first submit button, as Enter does in a field, so a composer sends without leaving the keyboard. Enter alone still breaks the line. A disabled first submit button sends nothing.
- Past `max`, the area carries `aria-invalid="true"` and the count turns red with `data-cp-over`. Both clear once the text is back within the limit, and nothing the person typed is cut. An `aria-invalid` the form's own checks set stays until those checks clear it.
- `signal` removes the listener.
