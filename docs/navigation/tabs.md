# tabs

`@cplieger/ui/tabs`

Runs a `.cp-tabs` strip, the library's one switcher: a tablist of tabs that show panels, or a nav of links. On a tablist it is the WAI-ARIA tabs pattern: the selected tab is the strip's one Tab stop, the arrows, Home and End move along the tabs, and each tab shows its own panel. A raised pill slides under the selected tab on a spring, as [pill](../core/pill.md) does for a segmented choice, which shares the look. The panels never animate.

```html
<div class="cp-tabs" role="tablist" aria-label="Item">
  <button class="cp-tab" role="tab" type="button" id="tab-episodes" aria-controls="panel-episodes" aria-selected="true">Episodes</button>
  <button class="cp-tab" role="tab" type="button" id="tab-history" aria-controls="panel-history" aria-selected="false" tabindex="-1">History</button>
</div>
<div class="cp-panel" role="tabpanel" id="panel-episodes" aria-labelledby="tab-episodes">…</div>
<div class="cp-panel" role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden>…</div>
```

```ts
import { enhanceTabs } from "@cplieger/ui/tabs";

const tabs = enhanceTabs(list, {
  onSelect: (tab) => history.pushState(null, "", `?tab=${tab.id}`),
  signal: page.signal,
});
addEventListener("popstate", () => tabs.select(tabFromUrl()), { signal: page.signal });
```

- With `activation: "automatic"`, the default, moving focus selects the tab, for panels already on the page. With `activation: "manual"`, the arrows move focus only and Enter, Space or a press selects, so arrowing past a tab never starts a load. Use it for a panel that loads once chosen, and load it in `onSelect`.
- `onSelect(tab, panel)` runs when a press or a key selects another tab, after its panel is shown. Write the tab into the URL there, as [Design patterns](../design-patterns.md#tabs) asks.
- `select(tab)` selects a tab and shows its panel without `onSelect`, as when Back restores the tab the URL names. `selected` reads the selected tab.
- The tab marked `aria-selected="true"` starts selected, else the first. Every other tab's panel is hidden.
- In a strip too narrow for its tabs, the selected tab scrolls into view whenever the selection changes, by a press, a key or `select()`, and whenever the strip or its tabs change size: when it is first drawn, when a strip hidden at the start, as in a closed dialog, is first shown, when it is resized, and when its tabs grow, as when their font arrives. A tab wider than the strip shows from where its label starts. The script scrolls only the strip, never the page.
- Without the script the selected tab fills itself, so a page drawn on the server shows the right tab.
- Aborting `signal` removes the listeners and the pill.

## Tabs as links

When each tab is its own address, the tabs are links in a `<nav class="cp-tabs">` with an `aria-label`, and the current one carries `aria-current="page"`, which raises it as a selected tab is raised. They need no script. ARIA tabs are for panels on one page.

```html
<nav class="cp-tabs" aria-label="Frieren">
  <a href="/item/42/episodes" aria-current="page">Episodes</a>
  <a href="/item/42/history">History</a>
</nav>
```

```ts
const tabs = enhanceTabs(nav, { signal: page.signal });
addEventListener("popstate", () => tabs.select(linkFor(location.pathname)), {
  signal: page.signal,
});
```

- `enhanceTabs()` on the nav slides the pill under the current link and keeps it in view in a strip too narrow for its links. It follows `aria-current` whatever sets it, the app's router or `select()`.
- Each link stays its own Tab stop and a press follows it: the nav has no arrow keys, no panels, no `activation` and no `onSelect`.
- `select(link)` makes that link the one `aria-current="page"`, for a router that changes the view in place. A nav where the page is none of its links keeps none current.
- `.cp-link-tabs` is the earlier name of `nav.cp-tabs`, drawn the same until a later release removes it.
