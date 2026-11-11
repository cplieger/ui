# disclosure

`@cplieger/ui/disclosure`

A section that opens and shuts is a native `<details>`, and sections that share a `name` open one at a time. CSS can take a height to `auto` only in Chromium, so `enhanceDisclosure()` glides the height in every engine.

```html
<details name="settings">
  <summary>Sources</summary>
  …
</details>
```

```ts
import { enhanceDisclosure, glideShow, groupDisclosures } from "@cplieger/ui/disclosure";

for (const d of document.querySelectorAll("details")) {
  enhanceDisclosure(d, { signal: page.signal });
}
groupDisclosures(seasons, oneAtATime ? "seasons" : null);
glideShow(batchBar, selected > 0);
```

- A section stays open while it glides shut, so its content stays drawn, and shuts at the end. It carries `data-cp-closing` meanwhile, so its chevron can turn back as the close begins.
- In a group sharing a `name`, opening one glides the open one shut. The browser's own group would shut the section just opened while a sibling still glides, so the group is kept under `data-cp-group`. Aborting `signal` gives the section the `name` of the group it is in then.
- `groupDisclosures(sections, name)` puts sections in one group at run time, or with `null` lets each open on its own. Grouping keeps the first open section open and glides the others shut. A section not enhanced takes the `name` itself, and the browser shuts the others at once.
- `glideShow(el, show)` glides any element in or out by its height, such as a bar that pushes the content under it.
- Under reduced motion the height changes at once.

## Accordion

`.cp-accordion` draws sections in one raised box, divided by lines. Each summary holds its title, an optional chip, and a chevron as its last child, which turns as the section opens and turns back as the press to shut it lands. The element after the summary is the section's content.

A section with its own menu is a `.cp-accordion-section` holding the `<details>` and a small quiet button that opens a [menu](../overlays/menu.md). The button sits beside the summary before the chevron, outside it, so opening the menu never opens or shuts the section, and the summary keeps the button's room free so a long title wraps short of it. One menu can serve every section's button.

```html
<div class="cp-accordion">
  <div class="cp-accordion-section">
    <details name="seasons" open>
      <summary>Season 1<span class="cp-chip" data-tone="success">On the best</span><span class="cp-icon" data-cp-icon="chevron-down" aria-hidden="true"></span></summary>
      <div>28 episodes, BD remux, dual audio.</div>
    </details>
    <button class="cp-button" data-variant="quiet" data-size="sm" type="button" popovertarget="season-menu" aria-label="Season 1 actions"><span class="cp-icon" data-cp-icon="ellipsis" aria-hidden="true"></span></button>
  </div>
  <details name="seasons">…</details>
</div>
```
