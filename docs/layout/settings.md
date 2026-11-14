# settings

`@cplieger/ui/settings`

The script of a settings page, as [Settings](../design-settings.md) describes it. It paints what the form's unsaved-changes guard reports: the save bar and its count, a dot on each category that holds a change, and a category select for a narrow screen. On a page of sections it also marks the category in view.

## Markup

```html
<div class="cp-settings">
  <nav class="cp-settings-nav" aria-label="Settings">
    <ul class="cp-list" data-surface="plain" data-divider="none" data-density="compact">
      <li><a class="cp-list-row" href="#connections"><span class="cp-cell-stack">Connections</span></a></li>
      <li><a class="cp-list-row" href="#checks"><span class="cp-cell-stack">Checks</span></a></li>
    </ul>
  </nav>
  <form class="cp-stack" action="/settings" method="post">
    <section class="cp-stack" id="connections" aria-labelledby="connections-h">
      <h2 id="connections-h">Connections</h2>
      <div class="cp-panel">…</div>
    </section>
    <section class="cp-stack" id="checks" aria-labelledby="checks-h">…</section>
    <div class="cp-savebar" aria-label="Unsaved changes" hidden>
      <span data-part="count"></span>
      <button class="cp-button" type="reset">Discard</button>
      <button class="cp-button" data-variant="primary" type="submit">Save changes</button>
    </div>
  </form>
</div>
```

A page of sections links each category to its section by its fragment. An app with one route per category links each to its address and marks the open one `aria-current="page"`: every field of the form is then that category's.

## Script

```ts
import { guardChanges } from "@cplieger/ui/form";
import { enhanceSettings } from "@cplieger/ui/settings";

const settings = enhanceSettings(form, { signal: page.signal });
const guard = guardChanges(form, {
  onChange: settings.paint,
  within: (to) => to.pathname.startsWith("/settings/"),
  signal: page.signal,
});
settings.paint(guard.changes());
```

The guard from [form](../forms/form.md) decides what waits: a field whose value differs from its default. `enhanceSettings` only paints it, so give its `paint` to the guard as `onChange` and call it once with what waits when the page opens. Save changes runs through [confirm](../buttons/confirm.md), and after the save's answer the app calls `guard.saved(values)`, so the values saved become the defaults that Discard, the count and the dots read from.

| Option | Default | What it does |
| --- | --- | --- |
| `nav` | the `.cp-settings-nav` of the form's `.cp-settings` | The categories: a `.cp-list` of `a.cp-list-row` links. Without one, `enhanceSettings` throws a `TypeError`. |
| `bar` | the form's `.cp-savebar` | The bar, with its count in `[data-part="count"]`. |
| `words` | below | The words it writes. |
| `signal` | none | Aborting it removes the select, the dots it wrote, the bar's height and its listeners. |

- **The bar** is `hidden` while nothing waits, and its count reads "1 unsaved change" or "3 unsaved changes". While a button in the bar plays its busy and done words, the bar stays with its last count, and it is painted again once the button is back at rest, so a save that leaves nothing waiting hides it then. While the bar shows, a field that focus or a link scrolls into view stops with its focus ring above the bar: the script gives the form the bar's height as `--cp-savebar-size`, which grows when the bar wraps on a phone.
- **The dot**: a category with a change holds a `.cp-dot` in its row's `[data-part="end"]`, with ", unsaved changes" for a screen reader. It makes the end part when the row has none and removes it again when it empties. A dot painted as the page opens stands still, and one added later pops in.
- **The select**: below 48rem the stylesheet hides the links and shows a select labelled "Category", which the script appends to the nav, one option per link, the open category chosen. A changed category's option reads "Checks, unsaved changes", since an option holds only text. Choosing an option presses its link, so the router, the jump to the section and the guard's question treat it as the link, and a choice the page refused shows the open category again. A choice made with the arrow or letter keys of a closed select waits for Enter, and Escape or leaving the select puts the open category back, so the keys never move the page under the person.
- **The category in view**: on a page of sections, the first section in the band from 20% to 40% of the window gives its link `aria-current="location"`. A pressed link is current at once and stays current until the person scrolls, so a last section too short to reach the band still reads as open. `aria-current="page"` is the app's, and the script never writes it: while a link carries it, the app's router shows one section at a time and says which is open, so the script marks no section in view.
- `update()` reads the categories again, after the app added, removed or renamed one.
- Without script, the categories stay a row of links that scrolls sideways below 48rem.

| Word | Default |
| --- | --- |
| `count(n)` | "1 unsaved change", "3 unsaved changes" |
| `unsaved` | ", unsaved changes" |
| `marked(name)` | "{name}, unsaved changes" |
| `category` | "Category" |

A form that the settings saved elsewhere while the person edited shows a warning `.cp-notice` whose button, "Load the latest and keep my changes", calls `guard.rebase(fresh)`, as [form](../forms/form.md) describes.
