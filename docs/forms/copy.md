# copy

`@cplieger/ui/copy`

A Copy button that says Copied only for a write that happened. The clipboard exists only in a secure context and can still refuse, as on an app served over plain http on a LAN address. Then the text is selected and a hint names the platform's own copy keys.

```html
<div class="cp-field">
  <span class="cp-label" id="key-l">API key, shown once</span>
  <div class="cp-code" aria-labelledby="key-l">
    <code id="key">cpk_9a1f43b2e07d4c55a8</code>
    <button class="cp-button cp-copy" type="button">
      <span class="cp-icon" data-cp-icon="copy" aria-hidden="true"></span>
      <span class="cp-icon" data-cp-icon="check" data-part="done" aria-hidden="true"></span>Copy
    </button>
  </div>
</div>
```

```ts
import { enhanceCopy } from "@cplieger/ui/copy";

enhanceCopy(button, { source: keyElement, signal: page.signal });
enhanceCopy(feedButton, { text: () => feed.url, copied: "Feed address copied", signal: page.signal });
```

- Give `source`, the element whose text is copied and selected when the write is refused, `text`, or both. With neither, `enhanceCopy` throws a `TypeError`.
- A written copy sets `data-cp-state="done"` for 1.6 seconds. The button turns green, the check draws in place of the copy drawing, and its word stays Copy. `copied`, by default "Copied", is said through [announce](../feedback/announce.md).
- A refused write selects `source` and shows the hint for 6 seconds, by default "Selected. Press Ctrl+C to copy.", naming the Command key on a Mac. `selected(keys)` gives other words. The hint is `hint`, or a `.cp-help` made after the button's `.cp-code`.
- `signal` removes the listener and a hint `enhanceCopy` made.
