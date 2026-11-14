# form

`@cplieger/ui/form`

A form's errors, as the [forms pattern](../design-patterns.md#forms) asks. Each field with an error is marked invalid and gets its sentence under it. One field's error alone moves focus to its field. Any other mix fills the form's summary with a link to each field and each section with an error, across the form's sections, and moves focus to it. An error of the whole document shows in its notice. What the person typed stays.

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
  const errors = check(form); // the app's own checks: [{ field, message }], [{ section, message }] or [{ message }]
  reportErrors(form, errors, { summary, heading: (n) => `${n} fields need a fix before this saves` });
});
url.addEventListener("blur", () => (isValidUrl(url.value) ? clearError(url) : showError(url, "Enter an address such as http://sonarr.lan:8989")));
```

- `reportErrors(form, errors, { summary, heading, notice? })` takes a field's error as `{ field, message }`. It sets `aria-invalid="true"` on each field and writes its `message` into its error. That is a `.cp-field-error` the field's `aria-describedby` already names, else the element whose `id` is the field's `id` followed by `-error`, such as `url-error`. With neither, it makes a `.cp-field-error` at the end of the field's `.cp-field`, or right after a field outside one, and a field with no `id` gets one. The error joins the field's `aria-describedby`. An error the markup wrote keeps its icon, and one the call makes draws the danger glyph from the stylesheet.
- Each call clears the errors that an earlier call or `showError` showed and that it no longer names, and an empty list hides the summary. An error a [connection test](connection-test.md), a [date range](date-range.md) or a [file field](file.md) showed stays until that module clears it or a call names its field.
- With two or more errors, or any error that is not one field's, the summary's `[data-part="body"]`, or the summary itself, takes `heading(count)` and a list, `count` being its items. A field's link is named by its label, after the name of the outermost `<section>` of the form that holds it, such as "Account and security: Display name". A section's name is the text its `aria-labelledby` names, else its `aria-label`, else its first heading. A link moves focus to its field. The summary shows, takes `tabindex="-1"` and gets focus, so leave it without `role="alert"`, which would be read twice.
- An error with no one control to fix is `{ section, message }`. Its item is a link named by the section, then ": " and the message, such as "Sources: Two sources use one address". The link focuses the section's heading, the element its `aria-labelledby` names or its first heading, which takes `tabindex="-1"` while it holds focus. A section with no `id` gets one.
- A link first opens whatever hides its field or section, outermost first. A closed `<details>` opens. A hidden element with an `id`, such as a settings category the page shows one at a time, is shown by pressing the page's link to it, `a[href="#<id>"]`, outside the summary and the notice. That link's own press must show it before the press returns, as a category link does. So an error in another category is one press from its field.
- An error of the whole document is `{ message }`, such as "These settings changed on another device." It goes into `notice` when given, such as a hidden `.cp-notice` with `data-variant="banner"` at the form's top. The notice's `[data-part="body"]`, or the notice itself, takes the sentence, or a list for several, and the notice shows. The notice hides when a call has none. With form errors alone, focus moves to the notice. Without `notice`, a form error is a plain item of the summary.
- `showError(field, message)` shows one field's error as `reportErrors` does, without the summary or a move of focus, for a field checked as the person leaves it.
- `clearError(field)` marks one field valid. Its error hides and no longer describes it. Call it as soon as the value is valid.
- The checks are the app's, such as when to validate, what a valid value is and the sentence for each fix.
