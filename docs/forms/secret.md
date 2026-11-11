# secret

`@cplieger/ui/secret`

A saved secret, whose value never comes back to the browser, and the Show button of a password field.

```html
<div class="cp-field cp-secret" data-cp-state="saved">
  <span class="cp-label" id="key-l">OpenSubtitles API key</span>
  <div data-part="saved">
    <span class="cp-icon" data-cp-icon="lock" aria-hidden="true"></span><span>Saved</span>
    <button class="cp-button" data-size="sm" type="button" aria-describedby="key-l">Replace</button>
  </div>
  <div data-part="edit">
    <div class="cp-input-wrap">
      <input class="cp-input" name="key" type="password" aria-labelledby="key-l" autocomplete="new-password">
      <button class="cp-button" data-variant="quiet" type="button" aria-label="Show OpenSubtitles API key" data-cp-tip="Show the key">
        <span class="cp-icon" data-cp-icon="eye" aria-hidden="true"></span>
        <span class="cp-icon" data-cp-icon="eye-off" data-part="on" aria-hidden="true"></span>
      </button>
    </div>
    <div><button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-part="keep">Keep saved value</button></div>
  </div>
</div>
```

```ts
import { enhanceReveal, enhanceSecret } from "@cplieger/ui/secret";

enhanceSecret(secret, { signal: page.signal });
enhanceReveal(showButton, keyField, { signal: page.signal });
```

- `enhanceSecret` shows Saved or the field by `data-cp-state`, `"saved"` or `"edit"`. While saved, the field is disabled, so a form sends nothing for it, which the server reads as "keep".
- Replace opens the field empty with focus in it. Keep saved value empties the field, firing `input` if it held text, goes back to Saved and gives focus to Replace.
- `enhanceReveal` switches the field between `password` and `text`. The button keeps its name, such as "Show password", and `aria-pressed` says whether the text shows, while the drawing marked `data-part="on"` stands in for the other.
- A secret that comes from the environment shows only where it comes from and its state, never its value, in a `.cp-secret-source` line: `<strong>` with its name, then its source, then a `.cp-state` word.
- `signal` removes the listeners.

## Shown once

```ts
import { enhanceCopy } from "@cplieger/ui/copy";
import { shownOnce } from "@cplieger/ui/secret";

const once = shownOnce(keyElement, { dialog, signal: page.signal });
enhanceCopy(copyButton, { source: keyElement, onCopy: once.copied, signal: page.signal });
```

- A new key or link shows once, in the `.cp-code` of the panel or dialog that made it. Until `copied()` runs, Escape and a press outside shake `dialog` and keep it open, while Done or Cancel still close it. It needs [`installDialogs()`](../overlays/dialog.md).
- The text is cleared when the dialog closes and when the page is hidden, so it never comes back from the back-forward cache.
