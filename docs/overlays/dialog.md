# dialog

`@cplieger/ui/dialog`

A dialog is a native `<dialog class="cp-dialog">`. A button opens it with `commandfor` and `command="show-modal"`, and a `<form method="dialog">` or `command="close"` closes it. The modal dialog itself moves focus in, makes the page inert, closes on Escape and returns focus to the button that opened it, and the stylesheet stops the page scrolling under it.

```html
<button class="cp-button" type="button" commandfor="rename" command="show-modal">Rename</button>
<dialog class="cp-dialog" id="rename" aria-labelledby="rename-title" data-keep-typed>
  <form id="rename-form">
    <header><h2 id="rename-title">Rename the instance</h2></header>
    <div class="cp-dialog-body">
      <div class="cp-field"><label class="cp-label" for="rename-name">Name</label><input class="cp-input" id="rename-name"></div>
    </div>
    <footer>
      <button class="cp-button" type="button" commandfor="rename" command="close">Cancel</button>
      <button class="cp-button" data-variant="primary" type="submit">Save</button>
    </footer>
  </form>
</dialog>
```

The primary is the form's one submit button and every other button is `type="button"`, so Enter in a field runs the primary. A `<button>` with no `type` submits, and Enter submits through the form's first submit button, so a Cancel before the primary without a `type` would close the dialog and drop what was typed. The work runs in the form's `submit` listener, which calls `preventDefault()` and closes the dialog with `closeDialog()` once the work succeeds. A `<form method="dialog">` closes the dialog before any work can show an answer in it, so keep it for a dialog whose buttons only choose, such as a confirmation.

```ts
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (await save.run(() => api.rename(nameField.value))) {
    closeDialog(dialog, "saved");
  }
});
```

```ts
import { closeDialog, installDialogs } from "@cplieger/ui/dialog";

installDialogs({ signal: page.signal }); // at startup
closeDialog(dialog, "saved"); // from your code, with its exit everywhere
```

`installDialogs()` adds what some engines lack:

- A press that starts and ends outside a dialog marked `closedby="any"` closes it in an engine without `closedby`, as Safari is today.
- A dialog marked `data-keep-typed` closes on a press outside, and shakes instead while it holds changes the person typed. Give it no `closedby`: the engine's own light dismiss closes it whatever it holds. Escape and Cancel still close it. `holdsTypedChanges(dialog)` says whether it holds any.
- The exit animation plays in Firefox and Safari, which drop a dialog from the top layer at once, for Escape, a dialog form and a close command. Call `closeDialog()` rather than `dialog.close()` to get it from your own code.
- It measures the page's scrollbar, so the stylesheet pads the page by that width while a modal dialog stops it scrolling, and nothing shifts.

- `holdDialog(dialog, held, { signal })` keeps a dialog open while `held()` returns true: Escape and a press outside shake it instead, as for a secret shown once that has not been copied, which [secret](../forms/secret.md)'s `shownOnce` does. A close the person chooses, a `command="close"` button or the form's submit, still closes it. A key a field inside takes for itself, such as Escape closing a combobox's list, stays the field's.

Every call shares one set of listeners, which stays until every caller's `signal` has aborted. `data-variant="confirm"` and `"sheet"` give the confirmation and the sheet, as [Components](../design-components.md) describes.
