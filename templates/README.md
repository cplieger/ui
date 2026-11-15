# Page templates

Each file here is a whole screen in plain HTML on `css/system.css`: the frame, its regions and the slots inside them, filled with a sample release tracker's words. Copy the one your screen is, keep its regions and their order, and replace the words and the sample rows with your own. Each opens from the installed package as it is (`node_modules/@cplieger/ui/templates/`), since it links the stylesheet as `../css/system.css`; in your app, link the stylesheet your bundler gives you.

A template holds no `<script>`, no `<style>` and no `style` attribute, so a strict content policy accepts it. The scripts a region needs are yours to add, from the subpaths each table names. Every `.cp-icon[data-cp-icon]` glyph paints with no script.

A **region** is an element of the frame, a grid area of `.cp-app` or `.cp-gate`. A **slot** is a named place inside a region. Each is marked in the file by one comment, `<!-- region: main -->` or `<!-- slot: notices: … -->`, which says what goes there.

## The app page: `app.html`

The frame every screen inside the app shares, `.cp-app`.

| Region | Element | Slots, in order |
| --- | --- | --- |
| skip | `a.cp-skip`, first in `<body>` | |
| header | `header.cp-header` | brand (`a.cp-wordmark`), destinations (`nav.cp-nav`, the current one `aria-current="page"`), toolbar (the header status and its panel, the theme toggle, the global actions, the account button last) |
| rail | `aside.cp-rail` | filters: a `.cp-list-heading` over a plain compact `.cp-list` per group. Under 60rem the rail leaves and the heading's Filters button, `.cp-rail-toggle`, opens the same filters in a sheet |
| main | `main.cp-main#main`, `tabindex="-1"` | banner (a `.cp-notice[data-variant="banner"]` for a condition that stops work on every screen), heading (`.cp-heading-row`: the `<h1>` and its facts line, then the page's actions), notices (a `.cp-notice` per condition of the whole screen), content |
| status | `footer.cp-status` | the facts about the whole screen, freshness first, a part `data-state="late"` for work that has not run when it should have; about, last |

Main is at most 90rem wide and centred; `data-width="full"` gives it the window, for a screen such as a wide table. A fact or a notice about one region goes in that region, under its heading.

The about slot is `.cp-meta[data-part="about"]`: the product's version, then its source, licence or docs links, as [Design patterns](../docs/design-patterns.md#navigation-and-the-url) describes.

Scripts: [press](../docs/core/press.md) and [pointer](../docs/core/pointer.md) for every page, [theme](../docs/core/theme.md) for the theme toggle, with its snippet before the first paint, [panel](../docs/overlays/panel.md) for the header status's panel, [dialog](../docs/overlays/dialog.md) for the filter sheet, and [relative-time](../docs/data/relative-time.md) for the freshness fact.

## List and detail: `list-detail.html`

The app page with no rail, whose main's content slot holds `.cp-list-detail`.

| Slot | What it holds |
| --- | --- |
| list | a `ul.cp-list` with one `a.cp-list-row` per entry, a link to its address; the open one `aria-current="true"` |
| detail | `section.cp-detail`, hidden until the route opens it |
| detail header | the detail's `<h2 tabindex="-1">`, which takes focus, and its close button |
| detail body | `.cp-detail-body` |

The detail docks beside the list once the box is 52rem wide and opens as a modal dialog below that. `data-variant="wide"` on `.cp-list-detail` gives a detail that is the work, such as a conversation, all but the list's column.

Scripts: the app page's, and [list-detail](../docs/layout/list-detail.md), which your route opens and closes.

## Settings: `settings.html`

The app page with no rail, whose main holds the heading and `.cp-settings`, as [Settings](../docs/design-settings.md) describes.

| Slot | What it holds |
| --- | --- |
| heading | the `<h1>` "Settings" |
| notices | a `.cp-notice` per condition of every category, such as a restart that waits |
| categories | `nav.cp-settings-nav` of a plain compact `.cp-list`, one `a.cp-list-row` per category, each its own address; the open one `aria-current="page"`, one with unsaved changes a `.cp-dot` and the hidden words ", unsaved changes" |
| category | the open category's `<form>` |
| category heading | its `<h2>` |
| errors | the form's danger `.cp-notice` summary, hidden until a save fails |
| groups | a `<section>` with its `<h3>` over a `.cp-panel` of `.cp-setting` rows |
| save bar | `.cp-savebar`: the count, Discard as the form's reset, the primary "Save changes" |

Scripts: the app page's, [form](../docs/forms/form.md) (`guardChanges` for the count, the dots and the leave guard; `reportErrors` for the summary) and [secret](../docs/forms/secret.md) for a saved key.

## Not found: `not-found.html`

The app page with no rail and no current destination, whose main holds only `.cp-empty[data-variant="page"]`: the glyph, the `<h1>`, one sentence and the one link home. It is the screen for an address that matches no route; an item the app does not hold keeps its own screen.

Scripts: the app page's.

## The gate page: `gate.html`

A page outside the frame for one short task, `main.cp-gate`.

| Region | Element | What it holds |
| --- | --- | --- |
| brand | `.cp-wordmark` | the app's mark and name |
| panel | `section.cp-panel#gate-panel`, empty | the task's screen, which `mountSignIn`, `mountSetup` or `mountInvite` from `@cplieger/ui/account` fills with its `<h1>`, notice slot and form |
| foot | `p.cp-meta[data-part="about"]` | the about line, the one line under the panel |

## The gate page's steps form: `gate-steps.html`

`.cp-gate[data-variant="steps"]`, a setup of several steps, each its own address, so the page needs no script.

| Region | Slots, in order |
| --- | --- |
| brand | |
| panel | steps (`ol.cp-steps`, a done step a link back to its address, the current one `aria-current="step"`, each state in hidden words; `p.cp-steps-compact` replaces it at compact width), heading (the step's number and task in its `<h1>`), notices (a `.cp-notice` for the step as a whole), form (the step's fields), actions (`data-part="actions"`: Back, a link to the step before, first; the one primary last) |
| foot | the about line |

An account step is `mountSetup(region, { heading: false })` in the form slot.

## A message with no script: `gate-message.html`

The gate page for a recovery or error message, for a store or server that cannot serve the app. It runs no script, holds no control and passes `default-src 'none'; style-src 'self'; img-src 'self' data:`.

| Region | Slots, in order |
| --- | --- |
| brand | |
| panel | heading (what happened, in the app's words), notices (a danger `.cp-notice` naming the class of the error in words), facts (`dl.cp-facts`: what the person needs to choose a remedy), remedies (an `<ol>` in `.cp-prose`, in the order to try them, each command in `.cp-mono`; a warning `.cp-notice` leads a remedy that needs it) |
| foot | the about line, the build's version first |
