# Components

This page lists the classes in `@cplieger/ui/css/system`. [Design language](design.md) covers the foundations they apply, and [Design patterns](design-patterns.md) how screens use them. Every class applies only where markup uses it.

| Class | What it is |
| --- | --- |
| `.cp-app`, `.cp-header`, `.cp-rail`, `.cp-main`, `.cp-status` | the screen frame |
| `.cp-wordmark`, `.cp-mark`, `.cp-hidden-narrow` | the app's name and mark, and a word the compact tier drops |
| `.cp-nav`, `.cp-nav-item`, `.cp-nav-label` | destinations in the header, the current one filled and in a stronger weight, and a word hidden from sight below 60rem |
| `.cp-rail-toggle` | the Filters button that shows only once the rail leaves |
| `.cp-button` | `data-variant="primary"` or `"quiet"`, `data-size="sm"`, `data-tone`, `aria-busy="true"` while working, and `aria-disabled="true"` on a link without `href`; one that confirms in place with [confirm](buttons/confirm.md), and one whose icon turns with [turn](buttons/turn.md) |
| `.cp-group`, `.cp-split` | buttons joined into one control, and a split button: an action and a caret, one shape, the action growing over the caret while it works |
| `.cp-toggle` | a quiet icon button that is on or off, with `data-kind="pin"` or `"favourite"`, as [toggle](buttons/toggle.md) describes |
| `.cp-roll` | words or a number that change by sliding, as [roll](core/roll.md) describes |
| `.cp-field`, `.cp-label`, `.cp-input`, `.cp-help`, `.cp-field-error` | a labelled field, its help and its error, with the danger border on `aria-invalid="true"` and `:user-invalid`, and the warning border on `data-tone="warning"` |
| `.cp-form`, `.cp-input-row`, `.cp-input-wrap` | a column of fields at most 32rem wide, a field with a control beside it, and a field with a quiet control inside its end |
| `.cp-switch` | a native checkbox with `role="switch"`, its thumb at the end when on |
| `.cp-segmented` | one choice of a few, such as a theme, as native radios in labels, with `data-variant="icons"` for square icon segments named by each radio's `aria-label`, and a pill that slides under the choice with [pill](core/pill.md) |
| `.cp-settings`, `.cp-settings-nav`, `.cp-setting`, `.cp-savebar` | a settings page: its categories beside the open one, one setting per row, and the bar that holds unsaved changes, as [Settings](design-settings.md) describes |
| `.cp-gate` | a page outside the frame for one short task, such as sign-in, as [Account and sign-in](design-account.md#the-gate-page) describes |
| `.cp-table` | a data table, with `data-col="select"`, `"num"` or `"actions"` and `data-priority` |
| `.cp-batchbar`, `.cp-batch-count` | the actions for the selected rows and their count, the bar sticking `--cp-sticky-top` from the top, 0 unless a sticky header above it sets its height |
| `.cp-pager` | the range and the Previous and Next links under a table |
| `.cp-chip`, `.cp-notice`, `.cp-swatch`, `.cp-count` | states in a tone, and a count beside a filter |
| `.cp-panel`, `.cp-stack`, `.cp-toolbar`, `.cp-heading-row`, `.cp-crumbs`, `.cp-meta` | surfaces and layout |
| `.cp-cluster` | a row of small things, such as chips or buttons, that wraps instead of overflowing, with `data-gap="tight"` for less space |
| `.cp-side-main` | a side column of `--cp-side-width` (16rem) beside the rest, stacking above it once the rest would be narrower than half the box |
| `.cp-grid` | as many columns of at least `--cp-grid-min` (14rem) as fit, for cards and covers |
| `.cp-list-detail`, `.cp-detail`, `.cp-detail-body` | a list with its entry's detail docked beside it, or in a dialog when the box is narrow, as [List and detail](layout/list-detail.md) describes |
| `.cp-dialog`, `.cp-dialog-body` | a native `<dialog>` opened with `showModal()`, holding a `<form method="dialog">` with its header, a `.cp-dialog-body` that scrolls and a footer of buttons, rising from the bottom on a phone, with `data-variant="confirm"` for a short confirmation led by its icon and `"sheet"` for the window's height at the inline end. The page does not scroll under it, as [dialog](overlays/dialog.md) describes |
| `.cp-popover` | a native popover by the button that opens it, as [anchor](overlays/anchor.md) describes, with `data-variant="panel"` for a panel of controls |
| `.cp-menu`, `.cp-menu-label`, `.cp-menu-tag` | a menu of `menuitem`, `menuitemcheckbox` and `menuitemradio` buttons or links, a group's heading and a word at an item's end, as [menu](overlays/menu.md) describes |
| `.cp-filter-group`, `.cp-filter-title`, `.cp-filter` | a filter list with `aria-pressed` |
| `.cp-tabs`, `.cp-tab` | the WAI-ARIA tabs pattern, as [Design patterns](design-patterns.md#tabs) describes |
| `.cp-progress`, `.cp-progress-track`, `.cp-progress-fill` | a progress bar in a tone |
| `.cp-skeleton`, `.cp-empty` | the loading and empty states |
| `.cp-loader`, `.cp-inline-load` | a loader for work of unknown length, the checkbox's square twirling through the harmony colours, alone or beside words that say what is loading |
| `.cp-toaster`, `.cp-toast` | the toast stack and a toast, as [toast](feedback/toast.md) describes |
| `.cp-tooltip` | a control's tip, as [tooltip](overlays/tooltip.md) describes |
| `.cp-steps`, `.cp-steps-compact` | a multi-step flow's progress: an `<ol>` of steps, each with `data-state` of `"done"`, `"current"` or `"todo"` and a visually hidden word for it, and "Step 2 of 3" in a box under 24rem |
| `.cp-visually-hidden` | text a screen reader reads and the eye does not see |
| `.cp-mono`, `.cp-truncate`, `.cp-cell-stack` | machine text, one line cut with an ellipsis, and a title over a muted line |

Inside `.cp`, the icons from `@cplieger/ui/icons` take the language's sizes.

![Every component in the light theme: buttons including a busy one, fields with errors, chips, notices including an error summary, tabs, a progress bar, a skeleton, an empty state and a filter sheet](images/system-parts-light.png)
