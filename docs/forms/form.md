# form

`@cplieger/ui/form`

A form's errors, as the [forms pattern](../design-patterns.md#forms) asks. Each field with an error is marked invalid and gets its sentence under it. One error moves focus to its field. Two or more fill the form's summary with a link to each field and move focus to it. What the person typed stays.

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
