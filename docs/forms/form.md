# form

`@cplieger/ui/form`

A form's errors and its unsaved changes, as the [forms pattern](../design-patterns.md#forms) asks. Each field with an error is marked invalid and gets its sentence under it. One field's error alone opens what hides its field, as a summary link does, and moves focus to it. Any other mix fills the form's summary with a link to each field and each section with an error, across the form's sections, and moves focus to it. An error of the whole document shows in its notice. What the person typed stays, and [the guard](#unsaved-changes) asks before a navigation or a close drops it.

```html
<form class="cp-form" novalidate>
  <div class="cp-notice" data-tone="danger" hidden id="summary">
    <span class="cp-icon" data-cp-icon="circle-x" aria-hidden="true"></span>
    <div data-part="body"></div>
  </div>
  <div class="cp-field"><label class="cp-label" for="url">Address</label><input class="cp-input" id="url" type="url" aria-required="true" aria-describedby="url-help"><span class="cp-help" id="url-help">Required. It starts with http:// or https://.</span></div>
  <div class="cp-field"><label class="cp-label" for="key">API key</label><input class="cp-input" id="key" aria-required="true" aria-describedby="key-help"><span class="cp-help" id="key-help">Required.</span></div>
</form>
```

```ts
import { clearError, reportErrors, showError } from "@cplieger/ui/form";

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const errors = check(form); // the app's own checks: [{ field, message }], [{ section, message }] or [{ message }]
  reportErrors(form, errors, { summary, heading: (n) => `${n} fields need a fix before this saves` });
});
url.addEventListener("blur", () => (isValidUrl(url.value) ? clearError(url) : showError(url, "Enter an address such as http://sonarr.lan:8989")));
```

- `reportErrors(form, errors, { summary, heading, notice? })` takes a field's error as `{ field, message }`. It sets `aria-invalid="true"` on each field and writes its `message` into its error. That is a `.cp-field-error` the field's `aria-describedby` already names, else the element whose `id` is the field's `id` followed by `-error`, such as `url-error`. With neither, it makes a `.cp-field-error` at the end of the field's `.cp-field`, or right after a field outside one, and a field with no `id` gets one. The error joins the field's `aria-describedby`, and `clearError` takes it out again. Leave a hidden error out of the markup's `aria-describedby`: a screen reader reads a description from hidden text too, so the field would say its error while it has none. An error the markup wrote keeps its icon, and one the call makes draws the danger glyph from the stylesheet.
- Each call clears the errors that an earlier call or `showError` showed and that it no longer names, and an empty list hides the summary. An error a [connection test](connection-test.md), a [date range](date-range.md) or a [file field](file.md) showed stays until that module clears it or a call names its field.
- With two or more errors, or any error that is not one field's, the summary's `[data-part="body"]`, or the summary itself, takes `heading(count)` and a list, `count` being its items. A field's link is named by its label, after the name of the outermost `<section>` of the form that holds it, such as "Account and security: Display name". A section's name is the text its `aria-labelledby` names, else its `aria-label`, else its first heading. A link moves focus to its field. The summary shows, takes `tabindex="-1"` and gets focus, so leave it without `role="alert"`, which would be read twice. It becomes a group named by its heading and described by its list, keeping a role you gave it, so every screen reader says the count and the fields where focus lands: Firefox and WebKit name an element with no role by nothing.
- An error with no one control to fix is `{ section, message }`. Its item is a link named by the section, then ": " and the message, such as "Sources: Two sources use one address". The link focuses the section's heading, the element its `aria-labelledby` names or its first heading, which takes `tabindex="-1"` while it holds focus. A section with no `id` gets one.
- A link first opens whatever hides its field or section, outermost first. A closed `<details>` opens. A hidden element with an `id`, such as a settings category the page shows one at a time, is shown by pressing the page's link to it, `a[href="#<id>"]`, outside the summary and the notice. That link's own press must show it before the press returns, as a category link does. So an error in another category is one press from its field.
- An error of the whole document is `{ message }`, such as "These settings changed on another device." It goes into `notice` when given, such as a hidden `.cp-notice` with `data-variant="banner"` at the form's top. The notice's `[data-part="body"]`, or the notice itself, takes the sentence, or a list for several, and the notice shows. The notice hides when a call has none. With form errors alone, focus moves to the notice, a group named by its sentences. Without `notice`, a form error is a plain item of the summary.
- Mark a required field `aria-required="true"` and say so in its `.cp-help`, never with `required`. Firefox and WebKit read an empty `required` field as an invalid entry before anything is typed, and Firefox keeps it under `aria-invalid="false"`, so the field would say an error it does not have. The gallery's accessibility check fails a page that holds one.
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
  <div class="cp-savebar" role="group" aria-label="Unsaved changes" hidden>
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
  // Every category of Settings is this one form, which the app's router shows a part of.
  within: (to) => to.pathname === "/settings" || to.pathname.startsWith("/settings/"),
  onChange: (changes) => {
    bar.hidden = changes.length === 0;
    count.textContent = `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}`;
  },
  signal: page.signal,
});
// After a save: the saved values become the start.
guard.saved();
// Or the answer's saved values, so a field typed into during the save stays a change.
guard.saved(answer.values);
// Another tab saved first: the notice's button takes its values, keeping the person's.
notice.querySelector("button").addEventListener("click", async () => {
  guard.rebase(await api.readChecks());
  notice.hidden = true;
});
```

- A change is a field whose value differs from what the form's reset puts back. So the form's saved values are its defaults, written as `value`, `checked` and `selected` in the markup, or made so by `saved()` once the fields hold them. A radio group counts once, a file field counts while it holds files, a field joined by `form="…"` counts, its edits heard as the form's own, and a disabled field, a hidden input and a button never do. A [tokens](tokens.md) field and a [pairs](pairs.md) list count as one field each, against the chips or rows they started with.
- `onChange(changes)` runs each time what waits changes, with the changed fields in page order, not on every key. When it hides the control that held focus, such as Discard or Save changes in a save bar that goes once nothing waits, focus moves to the first field that held a change, else the form's first control, so it never falls to the page. `count` and `changes()` read it at any time, and `update()` counts again after a value set from script.
- A `type="reset"` button is Discard. The platform puts each default back, and the guard counts again once the reset has run. `discard()` does the same from script. A reset that a listener cancels puts nothing back, chips and rows included.
- `saved()` makes each value its field's default, so Discard and the count start from it. A file field empties, since its files were sent.
- `saved(values)` takes the saved values an answer holds instead, by field name, in the shape `rebase()` takes. Each field they name takes its value as its default and keeps what it holds, so a field typed into while the save was busy stays a change, with no note. A field they do not name is left as it is, and a value that does not fit its field throws a `TypeError` before anything changes.
- While a change waits, a press on a link that leaves the page is stopped before the page's router sees it and asks first. The answer that drops the changes discards them and presses the link again. A jump to a fragment on the page, a link to another tab, a download and a press with a modifier key ask nothing. A reload or a closed tab gets the browser's own prompt, listened for only while a change waits, so the page stays in the back and forward cache otherwise.
- The guard hears that press in the window's capture phase, so an app's router listens for link presses on the document or an element below it, where the guard has already asked. A router listening in the window's capture phase could see the press first.
- `within(to)` says which addresses keep the form on the page, given each as a `URL`, for a router that shows another part of the same form there. A link to such an address asks nothing and the changes stay. A Settings page that is one form takes `(to) => to.pathname === "/settings" || to.pathname.startsWith("/settings/")`, so moving between categories, or back to Settings itself, keeps every change and its category's dot, and an item whose tabs are in its query takes `(to) => to.pathname === location.pathname`.
- With several guards holding changes, such as a page's form and the form of a dialog open over it, each asks in turn. Only once every one has its yes are the forms discarded and the link pressed again, so a no keeps every change.
- The browser's Back cannot be stopped by a page, so an app's router calls `leavePage(to)` before it acts on `popstate`, with the address it went to, and puts its entry back when the promise resolves false. It asks every guard holding a change and none whose `within` accepts `to`. It checks only each guard's `within`, so a move that changes only the fragment asks too, since the router decides what a Back leaves. True means the person chose to go, and their changes are discarded.
- `guard.leave()` asks for one form alone, such as before a panel that holds it closes, and resolves false too when a cancelled reset kept the changes.
- In a `.cp-dialog`, Escape, a `command="close"` button and a close request ask first too, whether the form was guarded before or after the dialog opened. On the answer the changes are discarded and then the dialog closes, so its `close` listeners find the form discarded. A reset that a listener cancels keeps the dialog open with the changes, as `leave()` resolves false.
- A dialog that holds several guarded forms asks about each one holding a change, and closes once every one may go. The submit that does the dialog's work, such as Send, never asks. A press outside a `data-keep-typed` dialog still shakes, as [dialog](../overlays/dialog.md) says, since a stray press should not open a question.
- The question is [ask](../overlays/ask.md)'s, with the answer in the danger tone and focus on keeping. `words` gives its `question`, a `detail` sentence under it, `discard` and `keep`. `discard` may be a function of the count. The defaults are "Discard your changes?", "Discard 1 change" or "Discard 3 changes", and "Keep editing". A message dialog might give "Discard this message?", "Discard" and "Keep writing".
- `rebase(fresh)` takes newer saved values by field name, such as after another tab saved. A text field takes a string. A single select takes the value of one of its options, and a radio group the value of one of its radios, or `""` for none checked. A lone checkbox takes a boolean. A multiple select, a group of checkboxes, several fields of one name and a tokens field take a list, and a pairs list takes a list for each name its rows' fields carry.
- Each field the person changed keeps their value. Every other field takes the fresh value as its value and its default, so Discard and the count start from it. `rebase()` returns the count of changes kept. A name the form lacks is left alone.
- A value its field would not hold as given throws a `TypeError` before anything changes, in `rebase()` and in `saved(values)`: a value no option, radio or box of the field has, text a number field cannot hold, a number past a range's limits or between its steps, a line break in a one-line field, more values than fields of the name, more chips than a tokens field's `max` or one chip twice, or a value a pairs row's field would not hold. The field's own spelling of the same value is taken, such as `#FF8800` for a colour or `1e3` for a number.
- So an option that newer values need is added to its select before `rebase()`, beside the options it holds. A select whose options are drawn again loses the person's choice, which then no longer counts as a change and takes the fresh value.
- A field changed both here and in `fresh` keeps the person's value and gets a `.cp-help` note under it, so Save knowingly replaces it. The note reads "Saved elsewhere as 45", "Cleared elsewhere", or "Changed elsewhere" for a password, and `words.elsewhere(value)` gives other words. It goes at `saved()` and at a discard.
- The notice that offers the rebase is the app's markup, a `.cp-notice` with one button, "Load the latest and keep my changes", which hides it and calls `rebase()`.
- `signal` ends the guard. A form takes one guard at a time, and a second call throws a `TypeError` until the first one's signal aborts.
