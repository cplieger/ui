# Design patterns

This page covers the patterns of the design language in `@cplieger/ui/css/system`, for loading, forms, tables, tabs, dialogs, notifications, first run, navigation, language and words. It builds on [Design language](design.md), which covers type, layout, touch and motion, on [Colour](design-colour.md), and on [Components](design-components.md), which lists the classes. [Settings](design-settings.md) covers the settings page, and [Account and sign-in](design-account.md) the screens around an app's accounts.

## Loading

Every region that loads data has four designed states, for loading, empty, error and full. Pick the loading state by what is coming:

| Situation | Show |
| --- | --- |
| The first load of content whose shape is known, such as a table or a list | a skeleton in that shape (`.cp-skeleton`) |
| An action on one control, such as Save or Retry | `spinner-arc` in the control beside its label, with `aria-busy="true"` on it |
| Work with known steps, such as a check of 8 sources | a progress bar (`.cp-progress`) and the step in words, such as "3 of 8" |
| Work with no known length, such as a full check that the server accepted | a status line that names the work, the time it started and its latest progress, with Cancel when the work can stop |
| A request with no answer by its own deadline | the error state, with what to try next |

- Show a skeleton through `skeletonTiming(paint, { showDelayMs: 200, minVisibleMs: 400 })` from `@cplieger/ui/skeleton`. A fast answer never flashes a skeleton, and a shown one stays long enough to read.
- Each request has its own deadline, set by the app for that operation. Background work the server accepted is a job, not a pending request. It keeps running past any request deadline, and it moves to the app's activity history when the person leaves the screen.
- Mark the loading region `aria-busy="true"` while it loads, and set `aria-busy="false"` once it settles into empty, error or full. Announce the outcome, such as "12 results" or "Check failed", through `@cplieger/ui/announce`, whose regions are on the page before the load starts.
- A busy button keeps its label and reads as work in progress with an ellipsis, such as "Saving…".
- Empty says what belongs here and offers the one action that fills it (`.cp-empty`). Error says what broke and what to do next, in a notice where the region would be. It never apologises and never stays vague.
- A change that will most likely succeed shows at once and rolls back on failure, through `@cplieger/reactive/actions`. A destructive action asks first or offers an Undo.

## Forms

A form never loses what the person typed, and every error is text that says how to fix it. [form](forms/form.md) shows and clears the errors as steps 3 to 5 ask, from the app's own checks.

1. Each control has a visible `<label>`, with `.cp-help` under it when a format or a source needs saying. A search field in a toolbar is the one exception. It may go without a label when its placeholder starts with "Search" and names what it searches, such as "Search titles…", and its accessible name is the same words.
2. Validate a field when it loses focus and when the form submits, never on every keystroke. Keep submit enabled, so a submit shows what is missing.
3. A field with an error gets `aria-invalid="true"` and a `.cp-field-error` under it, with a `circle-x` icon and a sentence that names the fix, such as "Enter 5 minutes or more". Tie the error to the field with `aria-describedby`.
4. On a submit with one error, focus its field. With two or more, show a danger notice at the top of the form that lists each field as a link to it. Head it with the count, such as "2 settings need a fix before they save", give it `tabindex="-1"` and focus it.
5. Clear a field's error as soon as its value is valid. Never clear what the person typed.
6. While the form saves, the submit button is busy, and the fields stay as they are.
7. A form with unsaved changes asks before a navigation that would discard them.

![Fields with an error under one of them, and an error summary with a link to the field](images/system-parts-light.png)

## Tables

Rows are never interactive. A row's actions are buttons in its last cell, and a destination is a link in the title cell.

**Row actions.** A row's action button has a visible word, such as "Grab", and an accessible name that starts with that word and adds the row, such as "Grab Delicious in Dungeon". A row with one action gives it the whole actions column, so a column of actions lines up.

**Sorting.** A sortable column's header is a button that names the order it will apply. The current sort is in the URL and in `aria-sort` on its `<th>`.

**Selection.** A table whose rows take a bulk action has a first column, `data-col="select"`, of `.cp-checkbox` boxes:

1. Each row's checkbox has a name that includes its title, such as "Select Mushishi", inside a `<label>` that fills its cell.
2. The header's checkbox selects the rows on this page, and its name says so, such as "Select all 25 entries on this page". It is mixed (`indeterminate`) while some of them are selected. [checkbox](forms/checkbox.md)'s `enhanceSelectAll` does both.
3. A selected row takes the selected fill. Space toggles the focused checkbox. Escape clears the selection while focus is in the table or the batch bar and no dialog or menu is open.
4. With one row or more selected, a `.cp-batchbar` above the table, a `<section>` named by `aria-label`, shows the count, a Clear button and the bulk actions, which name their count, such as "Grab 2". Once the whole page is selected and more rows match, it also offers "Select all 412 entries", which selects every row the filters show on every page. With none selected, the bar is gone.
5. Selection survives sorting and paging. A filter change that hides selected rows keeps them selected and says so in the count, such as "2 selected, 1 hidden by filters".
6. Announce each change to the count through `@cplieger/ui/announce`, politely.
7. A bulk action that changes or removes data asks first or offers an Undo, as a single action does. Its confirmation names the count.

**Pages.** A list longer than one page has a `.cp-pager` under its table, inside the panel:

1. It shows the range and the total, such as "1 to 25 of 412", then Previous and Next as links. At the first or the last page that link has `aria-disabled="true"` and no `href`.
2. The page and the page size are in the URL. Offer a page size choice only when people need it.
3. After a page change, focus moves to the table's caption or the first row's title link, and the scroll returns to the top of the table.
4. When the last page empties, such as after a delete, the list moves to the new last page.

## Tabs

Tabs follow the WAI-ARIA tabs pattern:

1. The `.cp-tabs` container is `role="tablist"` with an `aria-label`. Each `.cp-tab` is `role="tab"` with an `id`, `aria-controls` naming its panel, and `aria-selected`. Each panel is `role="tabpanel"` with `aria-labelledby` naming its tab, and the panels of the other tabs are `hidden`.
2. The tablist is one Tab stop, the selected tab. [tabs](navigation/tabs.md) moves focus between tabs with the arrow keys, Home and End, and slides the pill under the selected one.
3. Moving focus selects the tab when its panel is already loaded. When a panel loads on demand, Enter or Space selects it instead.
4. The selected tab is in the URL.
5. When each tab is its own address, the tabs are links in a `.cp-link-tabs` nav and the current one carries `aria-current="page"`.

## Dialogs and sheets

A dialog is the last answer, after inline editing and disclosure. When one is needed:

- Make it a native `<dialog class="cp-dialog">` opened with `commandfor` or `showModal()`, as [dialog](overlays/dialog.md) describes. The modal dialog makes the page inert, closes on Escape and returns focus to the control that opened it.
- Move focus by what the dialog holds. A form focuses its first field. A confirmation focuses its least destructive action. A dialog of content to read focuses its heading.
- A destructive confirmation names the action and its object on its button, such as "Delete 3 subtitles", and uses `data-tone="danger"` on it.

A sheet is a `.cp-dialog` marked `data-variant="sheet"`, with the same header, body and footer. It opens at the inline end at full height, and across the whole window in the compact tier. The filter sheet is the standard one:

1. Below 60rem, a Filters button in the page toolbar, with class `.cp-rail-toggle`, opens the rail's filters in a sheet. The stylesheet shows it only once the rail is gone. Its label carries the count of active filters, such as "Filters, 2", and while any filter is active, a "Clear filters" button sits beside it.
2. The head holds the title "Filters" and a Close button.
3. A sheet with one group of filters whose results come back fast applies each change at once and writes the URL. Its foot holds "Clear all" and "Done", and Close and Escape keep the changes.
4. A sheet with several groups, or whose results are slow, stages the changes. Its foot holds "Clear all" and "Show 41 results", which applies them as one URL entry and closes the sheet. Close and Escape discard what was staged.
5. A filter set too long for a sheet is a page of its own, with Back returning to the list.

## Notifications

| Situation | Use | Stays |
| --- | --- | --- |
| A problem with one region, such as a source that failed to answer | a notice where the region is | until the problem ends |
| A condition of one screen, such as a rate limit on the source it lists | a notice at the top of `.cp-main` | until the condition ends |
| A condition that stops the person's work on every screen, such as an update that needs a reload, or a lost connection in an app with no header status | a `.cp-banner` at the top of `.cp-main`, with its one action and no dismiss | until the condition ends |
| A lost connection in an app with a header status | the status's offline state alone, with its way to retry in the status's panel | until the connection is back |
| A confirmation on the control the person pressed, such as Saved on Save or Copied on Copy | the control itself, through [confirm](buttons/confirm.md) or [copy](forms/copy.md). Copy announces its word, and a confirm's outcome is yours to announce | 1.6 seconds |
| A short confirmation of the person's own action, such as "Source added", whose result stays visible on the screen or in the history | a toast | 7 seconds, paused while hovered or focused |
| A confirmation whose result is not visible anywhere else | a toast | until dismissed |
| A failure of the person's own action | a toast, with Retry when it can be retried | until dismissed |
| The outcome of background work, such as a finished check | the app's activity history, and a toast only when the person started it | in the history |

- Show each toast with `toast()` from `@cplieger/ui/toast`. A passing toast stays 7 seconds, and an error or a toast with an action, such as Undo, stays until dismissed on its own.
- Toasts announce themselves, confirmations politely and errors assertively, so use an error toast only for a failure of what the person just did. A failure of background work, such as a refresh, is a notice, announced politely.
- A notice that appears announces through `@cplieger/ui/announce`, politely, and only one that blocks the person's current task uses `role="alert"`.
- One message per event. A problem shown in a notice is not also a toast.

## First run

An app whose data comes from another service has these states before it shows any data. Each one is a `.cp-empty` with its own heading, sentence and action, or a loading state where the table says so:

| State | Says | Action |
| --- | --- | --- |
| Not set up | what the app needs to start | the setup step that is missing, such as "Connect Sonarr" |
| Connecting | which service it is reaching | none, it is a loading state |
| Connection failed | which service failed and what it answered | "Check settings", which opens the field at fault |
| First sync running | what is being read, and its progress | "View activity" |
| Sync failed | which step failed and what the service answered | "Retry sync" |
| The service has no items | that the service answered and holds nothing yet | "Open Sonarr", a link to the service |
| Filters hide everything | which filters are active | "Clear filters" |

First sync running is a `.cp-empty` whose heading starts with a `.cp-loader`, then a `.cp-progress` whose words name the phase and the step, such as "Series 120 of 351", repeated in its `aria-valuetext`, then "View activity". Connection failed and Sync failed lead with a `circle-x` glyph in `data-tone="danger"`.

## Navigation and the URL

- The URL is the state. Filters, sort, search, the open tab, the page of a list and an open sheet each live in the path or the query, so a link, a refresh and Back reopen the same view.
- A navigation pushes a history entry, and a change while typing replaces the current one, so Back does not walk through every keystroke.
- Back and Forward restore the view, its scroll position and the focus they left.
- A route change moves focus to the new screen's `<h1>` and sets `<title>` to the screen's name.
- A link to something that is gone, or a query value the app does not know, opens the nearest valid view with a notice that says what was dropped.
- A destination is a link (`<a href>`), so a middle click, a new tab and a copied address all work. A button is for an action on this screen.
- A destination that shows only its icon, from 40rem to 60rem, keeps its word as its accessible name through `.cp-nav-label`, which the stylesheet hides from sight only, and a tooltip with the same word. Under 40rem the header's destinations move to a bar at the window's foot, each an icon over its word.
- The header holds four destinations at most, so each keeps its word on one line in the bar under 40rem. Others go in a menu or on a screen of their own.
- The current destination carries `aria-current="page"`, or `"true"` when the screen sits inside it, as an item sits inside its library.
- A screen opens with its `.cp-crumbs`, then a `.cp-heading-row` holding the `<h1>` with its `.cp-meta` line of facts under it, and the screen's `.cp-toolbar` at its end.

## Language and direction

The interface may ship in one language and still show titles, names and file names in any script.

- Set `lang` on `<html>`, and `lang` on an element whose text is known to be in another language, such as a Japanese title.
- Wrap text from outside the app, such as a title or a release name, in `<bdi>` or give its element `dir="auto"`, so a right-to-left name cannot reorder the text around it.
- Format dates, times, numbers, sizes and durations with `Intl`, in the person's locale.
- The stylesheet uses logical properties throughout, so it mirrors under `dir="rtl"`. Write app CSS with `inline` and `block` properties the same way. Icons that point along the text mirror on their own.
- Test a screen with long words and with a right-to-left title in a table cell, and test one whole screen under `dir="rtl"` at compact and expanded widths, with its sheet open.

## Words on screen

- Sentence case everywhere, buttons included.
- A button is a verb and its object, such as "Save changes" or "Find subtitles". An action keeps its name through the flow, so "Publish" leads to "Published".
- A menu item that asks for more input, and a label for work in progress, end with an ellipsis, such as "Rename…" and "Saving…".
- Numbers are numerals with a non-breaking space before their unit, such as 31.4 GB and 3 of 8.
- Errors name the problem and the way out. Empty states name what belongs there.
- Help text is a last resort. A clear label and a sensible default come first.
- Never invent a number, a quote or a logo on a screen. An absent fact stays absent.

## Not yet decided

The language decides these when an app first needs them, and adds them here:

- Charts. Until then, show the numbers in a table, label series directly, take series colours from the [harmony colours](design-colour.md#harmony-colours), and never use colour as the only way to tell series apart.
- Print styles.
