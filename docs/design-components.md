# Components

This page lists the classes in `@cplieger/ui/css/system`. [Design language](design.md) covers the foundations they apply, and [Design patterns](design-patterns.md) how screens use them. Every class applies only where markup uses it.

| Class | What it is |
| --- | --- |
| `.cp-app`, `.cp-header`, `.cp-rail`, `.cp-main`, `.cp-status` | the screen frame |
| `.cp-wordmark`, `.cp-mark`, `.cp-hidden-narrow` | the app's name and mark, and a word the compact tier drops |
| `.cp-nav`, `.cp-nav-item`, `.cp-nav-label` | destinations in the header, the current one filled and in a stronger weight, and a word hidden from sight below 60rem. Under 40rem the header's nav is a bar at the window's foot, each destination an icon over its word |
| `.cp-header-status` | the header's status button, `data-state` of `"problem"`, `"offline"`, `"warning"`, `"working"` or `"ok"`, worst first. The stylesheet draws each state's glyph and tone. It holds the state's words and an optional `<span data-part="detail">`, such as a running check, and opens its panel, which [panel](overlays/panel.md) gives its focus. Say each change of state with [announce](feedback/announce.md), politely, in the state's words |
| `.cp-skip` | the link that takes a keyboard past the header to `.cp-main`, shown only while it has focus |
| `.cp-banner` | a condition that stops the person's work on every screen, such as an update that needs a reload, or a lost connection in an app with no header status, at the top of `.cp-main` in a `data-tone`, its words first and its one action at the end, with no dismiss |
| `.cp-rail-toggle` | the Filters button that shows only once the rail leaves |
| `.cp-button` | `data-variant="primary"` or `"quiet"`, `data-size="sm"`, `data-tone`, `aria-busy="true"` while working, and `aria-disabled="true"` on a link without `href`. One that confirms in place with [confirm](buttons/confirm.md), and one whose icon turns with [turn](buttons/turn.md) |
| `.cp-group`, `.cp-split` | buttons joined into one control, and a split button: an action and a caret, one shape, the action growing over the caret while it works |
| `.cp-toggle` | a quiet icon button that is on or off, with `data-kind="pin"`, `"favourite"` or `"theme"`, as [toggle](buttons/toggle.md) describes |
| `.cp-roll` | words or a number that change by sliding, as [roll](core/roll.md) describes |
| `.cp-field`, `.cp-label`, `.cp-input`, `.cp-help`, `.cp-field-error` | a labelled field, its help and its error, with the danger border on `aria-invalid="true"` and `:user-invalid`, and the warning border on `data-tone="warning"` |
| `.cp-form`, `.cp-input-row`, `.cp-input-wrap` | a column of fields at most 32rem wide, a field with a control beside it, and a field with a quiet control inside its end |
| `.cp-checkbox`, `.cp-radio` | a native checkbox, which twirls into an accent circle as it checks and holds a dash while `:indeterminate`, and a native radio, whose dot springs in. A select-all box comes from [checkbox](forms/checkbox.md) |
| `.cp-choices`, `.cp-choice`, `.cp-choice-field` | a fieldset of whole-row labels, each a checkbox or a radio, its words and a muted `<small>` line, and a radio's own field, such as "Every [30] minutes", as [choice](forms/choice.md) describes |
| `.cp-switch` | a native checkbox with `role="switch"`, its thumb springing to the end when on |
| `.cp-select` | a native `<select class="cp-input">` in a box that draws its chevron |
| `.cp-stepper`, `.cp-stepper-value` | a number between a minus and a plus, as wide as what it holds, or a value button between them, such as a zoom, as [stepper](forms/stepper.md) describes. With `data-variant="nudge"` it is a signed value between buttons of several sizes and a Reset |
| `.cp-secret`, `.cp-secret-source` | a saved secret that is replaced, never shown, as [secret](forms/secret.md) describes, and a secret from the environment: its name, where it comes from and its state |
| `.cp-code`, `.cp-copy` | machine text in a box with Copy attached, as [copy](forms/copy.md) describes |
| `.cp-drop`, `.cp-files` | a file field's label as a dashed area that takes dropped files, and the list of the files a field took, as [file](forms/file.md) describes |
| `.cp-rules`, `.cp-rule-target` | rules that read as sentences with pickers, set in columns, each target with its remove, as [rules](forms/rules.md) describes |
| `.cp-pairs` | rows of two fields that belong together, such as path mappings, each with an arrow between and its remove, as [pairs](forms/pairs.md) describes |
| `.cp-affix` | a field with a fixed part of its value beside it, such as `https://` or a unit, in a `<span>` before or after the `.cp-input`. The field and its fixed part share one box, one control tall |
| `.cp-search` | a search field with its glass and a clear button, as [search](forms/search.md) describes |
| `.cp-textarea-count` | a text area's count under it, red past its limit, as [textarea](forms/textarea.md) describes. A `textarea.cp-input` grows from three lines to ten |
| `.cp-range`, `.cp-range-row` | a slider in the accent and its row with an `<output>`. [range](forms/range.md) fills the track to the thumb and writes the value |
| `.cp-tokens`, `.cp-token` | a field of chosen values as chips, one control tall on one line, as [tokens](forms/tokens.md) describes |
| `.cp-test-status` | the connection test's answer, its glyph and tone drawn from `data-cp-state`: the spinner while busy, `circle-check` in the success tone once passed and `circle-x` in the danger tone once failed, as [connection-test](forms/connection-test.md) describes |
| `.cp-listbox` | the options under a combobox, on a `.cp-popover` as wide as its field, the active one filled, as [combobox](forms/combobox.md) describes |
| `.cp-state` | a short state word in its `data-tone`, after a `.cp-icon` with the tone's glyph, such as `circle-check` for `success` |
| `.cp-segmented` | one choice of a few, such as a theme, as native radios in labels, with `data-variant="icons"` for square icon segments named by each radio's `aria-label`, and a pill that slides under the choice with [pill](core/pill.md) |
| `.cp-settings`, `.cp-settings-nav`, `.cp-setting`, `.cp-savebar` | a settings page: its categories beside the open one, one setting per row, and the bar that holds unsaved changes, as [Settings](design-settings.md) describes |
| `.cp-gate` | a page outside the frame for one short task, such as sign-in, as [Account and sign-in](design-account.md#the-gate-page) describes. `data-variant="steps"` is a setup of several steps: a 28rem column whose panel is the steps' container, and a `data-part="actions"` row with Back first and the primary last |
| `.cp-table` | a data table, with `data-col="select"`, `"num"` or `"actions"` and `data-priority`. A row's header, a `<th scope="row">` in the body, reads as one of the row's cells, and a link in a cell holds its glyph beside its words |
| `.cp-batchbar`, `.cp-batch-count` | the actions for the selected rows and their count, the bar sticking `--cp-sticky-top` from the top, 0 unless a sticky header above it sets its height |
| `.cp-pager` | the range and the Previous and Next links under a table |
| `.cp-share`, `.cp-share-bar`, `.cp-share-legend` | the parts of a whole as segments sized by share with a 2px gap, a tip on each, and a legend of chips that can be links, over the table that holds the numbers, as [share-bar](data/share-bar.md) describes |
| `.cp-chip`, `.cp-notice`, `.cp-swatch`, `.cp-count` | states in a tone, or categories on a slot of the [series colours](design-colour.md#series-colours) with `data-series`, and a count beside a filter |
| `.cp-panel`, `.cp-stack`, `.cp-toolbar`, `.cp-heading-row`, `.cp-crumbs`, `.cp-meta` | surfaces and layout |
| `.cp-cluster` | a row of small things, such as chips or buttons, that wraps instead of overflowing, with `data-gap="tight"` for less space |
| `.cp-side-main` | a side column of `--cp-side-width` (16rem) beside the rest, stacking above it once the rest would be narrower than half the box |
| `.cp-grid` | as many columns of at least `--cp-grid-min` (14rem) as fit, for cards and covers. `data-variant="fit"` lets a short row's items share its width, so two children are equal halves that stack once the box is under twice `--cp-grid-min` |
| `.cp-list-detail`, `.cp-detail`, `.cp-detail-body` | a list with its entry's detail docked beside it, or in a dialog when the box is narrow, as [List and detail](layout/list-detail.md) describes |
| `.cp-dialog`, `.cp-dialog-body` | a native `<dialog>` opened with `showModal()`, holding a `<form>` with its header, a `.cp-dialog-body` that scrolls and a footer of buttons, rising from the bottom on a phone, with `data-variant="confirm"` for a short confirmation led by its icon and `"sheet"` for the window's height at the inline end. The page does not scroll under it, as [dialog](overlays/dialog.md) describes |
| `.cp-popover` | a native popover by the button that opens it, as [anchor](overlays/anchor.md) describes, with `data-variant="panel"` for a panel of controls, whose focus [panel](overlays/panel.md) gives |
| `.cp-menu`, `.cp-menu-label`, `.cp-menu-tag` | a menu of `menuitem`, `menuitemcheckbox` and `menuitemradio` buttons or links, a group's heading and a word at an item's end, as [menu](overlays/menu.md) describes |
| `.cp-filter-group`, `.cp-filter-title`, `.cp-filter` | a filter list with `aria-pressed` |
| `.cp-filter-chip` | a pill `<button>` that turns one filter on or off by `aria-pressed`, filled with the accent and its `check` icon sliding in while pressed. A row of them is a `.cp-cluster` with `role="group"` and a name. Your click handler sets `aria-pressed` from the filter's state |
| `.cp-tabs`, `.cp-tab` | the WAI-ARIA tabs pattern, as [Design patterns](design-patterns.md#tabs) describes |
| `.cp-progress`, `.cp-progress-track`, `.cp-progress-fill` | a progress bar in a tone |
| `.cp-skeleton`, `.cp-empty` | the loading and empty states |
| `.cp-loader`, `.cp-inline-load` | a loader for work of unknown length, the checkbox's square twirling through the harmony colours, alone or beside words that say what is loading |
| `.cp-toaster`, `.cp-toast` | the toast stack and a toast, as [toast](feedback/toast.md) describes |
| `.cp-tooltip` | a control's tip, as [tooltip](overlays/tooltip.md) describes |
| `.cp-steps`, `.cp-steps-compact` | a multi-step flow's progress: an `<ol>` of steps, each with `data-state` of `"done"`, `"current"` or `"todo"` and a visually hidden word for it, a done step holding an `<a href>` back to it, and "Step 2 of 3" in a box under 24rem |
| `.cp-visually-hidden` | text a screen reader reads and the eye does not see |
| `.cp-mono`, `.cp-truncate`, `.cp-cell-stack` | machine text, one line cut with an ellipsis, and a title over a muted line |

Inside `.cp`, the icons from `@cplieger/ui/icons` take the language's sizes.

![Every component in the light theme: buttons including a busy one, fields with errors, chips, notices including an error summary, tabs, a progress bar, a skeleton, an empty state and a filter sheet](images/system-parts-light.png)
