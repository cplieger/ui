# form

`@cplieger/ui/form`

A form's errors and its unsaved changes, as the [forms pattern](../design-patterns.md#forms) asks. Each field with an error is marked invalid and gets its sentence under it. One error moves focus to its field. Two or more fill the form's summary with a link to each field and move focus to it. What the person typed stays, and [the guard](#unsaved-changes) asks before a navigation or a close drops it.

```html
<form class="cp-form" novalidate>
  <div class="cp-notice" data-tone="danger" hidden id="summary">
    <span class="cp-icon" data-cp-icon="circle-x" aria-hidden="true"></span>
    <div data-part="body"></div>
  </div>
  <div class="cp-field"><label class="cp-label" for="url">Address</label><input class="cp-input" id="url" type="url"></div>
  <div class="cp-field"><label class="cp-label" for="key">API key</label><input class="cp-input" id="key"></div>
</form>
```

```ts
import { clearError, reportErrors, showError } from "@cplieger/ui/form";

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const errors = check(form); // the app's own checks: [{ field, message }]
  reportErrors(form, errors, { summary, heading: (n) => `${n} fields need a fix before this saves` });
});
url.addEventListener("blur", () => (isValidUrl(url.value) ? clearError(url) : showError(url, "Enter an address such as http://sonarr.lan:8989")));
```

- `reportErrors(form, errors, { summary, heading })` sets `aria-invalid="true"` on each field and writes its `message` into its error. That is a `.cp-field-error` the field's `aria-describedby` already names, else the element whose `id` is the field's `id` followed by `-error`, such as `url-error`. With neither, it makes a `.cp-field-error` at the end of the field's `.cp-field`, or right after a field outside one, and a field with no `id` gets one. The error joins the field's `aria-describedby`. An error the markup wrote keeps its icon, and one the call makes draws the danger glyph from the stylesheet.
- Each call clears the errors that an earlier call or `showError` showed and that it no longer names, and an empty list hides the summary. An error a [connection test](connection-test.md), a [date range](date-range.md) or a [file field](file.md) showed stays until that module clears it or a call names its field.
- With two or more errors, the summary's `[data-part="body"]`, or the summary itself, takes `heading(count)` and a list of links, each named by its field's label. A link moves focus to its field. The summary shows, takes `tabindex="-1"` and gets focus, so leave it without `role="alert"`, which would be read twice.
- `showError(field, message)` shows one field's error as `reportErrors` does, without the summary or a move of focus, for a field checked as the person leaves it.
- `clearError(field)` marks one field valid. Its error hides and no longer describes it. Call it as soon as the value is valid.
- The checks are the app's, such as when to validate, what a valid value is and the sentence for each fix.

## Unsaved changes

`guardChanges(form, options)` keeps track of what the person changed and asks before a navigation or a close drops it, as step 7 of the [forms pattern](../design-patterns.md#forms) asks. The same guard serves a page of settings and a dialog.

```html
<form class="cp-form" id="checks">
  <div class="cp-notice" data-tone="warning" hidden id="checks-elsewhere">
    <span class="cp-icon" data-cp-icon="triangle-alert" aria-hidden="true"></span>
    <span>These settings were saved in another tab at 14:05.</span>
    <button class="cp-button" type="button">Load the latest and keep my changes</button>
  </div>
  <div class="cp-field"><label class="cp-label" for="every">Check every</label><input class="cp-input" id="every" name="every" value="30"></div>
  <div class="cp-savebar" aria-label="Unsaved changes" hidden>
    <span data-part="count"></span>
    <button class="cp-button" type="reset">Discard</button>
    <button class="cp-button" data-variant="primary" type="submit">Save changes</button>
  </div>
</form>
```

```ts
import { guardChanges } from "@cplieger/ui/form";

const bar = form.querySelector(".cp-savebar");
const count = bar.querySelector("[data-part='count']");
const guard = guardChanges(form, {
  words: { question: "Leave without saving?" },
  onChange: (changes) => {
    bar.hidden = changes.length === 0;
    count.textContent = `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}`;
  },
  signal: page.signal,
});
// After a save: the saved values become the start.
guard.saved();
// Another tab saved first: the notice's button takes its values, keeping the person's.
notice.querySelector("button").addEventListener("click", async () => {
  guard.rebase(await api.readChecks());
  notice.hidden = true;
});
```

- A change is a field whose value differs from what the form's reset puts back. So the form's saved values are its defaults, written as `value`, `checked` and `selected` in the markup, or made so by `saved()` once the fields hold them. A radio group counts once, a file field counts while it holds files, a field joined by `form="…"` counts, and a disabled field, a hidden input and a button never do. A [tokens](tokens.md) field and a [pairs](pairs.md) list count as one field each, against the chips or rows they started with.
- `onChange(changes)` runs each time what waits changes, with the changed fields in page order, not on every key. `count` and `changes()` read it at any time, and `update()` counts again after a value set from script.
- A `type="reset"` button is Discard. The platform puts each default back, and the guard counts again once the reset has run. `discard()` does the same from script.
- `saved()` makes each value its field's default, so Discard and the count start from it. A file field empties, since its files were sent.
- While a change waits, a press on a link that leaves the page is stopped before the page's router sees it and asks first. The answer that drops the changes discards them and presses the link again. A jump to a fragment on the page, a link to another tab, a download and a press with a modifier key ask nothing. A reload or a closed tab gets the browser's own prompt, listened for only while a change waits, so the page stays in the back and forward cache otherwise.
- The browser's Back cannot be stopped by a page, so an app's router calls `leave()` before it acts on `popstate`, and puts its entry back when the promise resolves false. True means the person chose to go, and the changes are discarded.
- In a `.cp-dialog`, Escape, a `command="close"` button and a close request ask first too, and the dialog closes and discards on the answer. The submit that does the dialog's work, such as Send, never asks. A press outside a `data-keep-typed` dialog still shakes, as [dialog](../overlays/dialog.md) says, since a stray press should not open a question.
- The question is [ask](../overlays/ask.md)'s, with the answer in the danger tone and focus on keeping. `words` gives its `question`, a `detail` sentence under it, `discard` and `keep`. `discard` may be a function of the count. The defaults are "Discard your changes?", "Discard 1 change" or "Discard 3 changes", and "Keep editing". A message dialog might give "Discard this message?", "Discard" and "Keep writing".
- `rebase(fresh)` takes newer saved values by field name, such as after another tab saved. A text field, a single select and a radio group take a string, and a lone checkbox a boolean. A multiple select, a group of checkboxes, several fields of one name and a tokens field take a list, and a pairs list takes a list for each name its rows' fields carry.
- Each field the person changed keeps their value. Every other field takes the fresh value as its value and its default, so Discard and the count start from it. `rebase()` returns the count of changes kept. A name the form lacks is left alone, and a value that does not fit its field throws a `TypeError` before anything changes.
- A field changed both here and in `fresh` keeps the person's value and gets a `.cp-help` note under it, so Save knowingly replaces it. The note reads "Saved elsewhere as 45", "Cleared elsewhere", or "Changed elsewhere" for a password, and `words.elsewhere(value)` gives other words. It goes at `saved()` and at a discard.
- The notice that offers the rebase is the app's markup, a `.cp-notice` with one button, "Load the latest and keep my changes", which hides it and calls `rebase()`.
- `signal` ends the guard. A form takes one guard at a time, and a second call throws a `TypeError` until the first one's signal aborts.
