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
import { enhanceDisclosure, glideShow } from "@cplieger/ui/disclosure";

for (const d of document.querySelectorAll("details")) {
  enhanceDisclosure(d, { signal: page.signal });
}
glideShow(batchBar, selected > 0);
```

- A section stays open while it glides shut, so its content stays drawn, and shuts at the end. It carries `data-uip-closing` meanwhile, so its chevron can turn back as the close begins.
- In a group sharing a `name`, opening one glides the open one shut. The browser's own group would shut the section just opened while a sibling still glides, so the group is kept under `data-uip-group`. Aborting `signal` gives the `name` back.
- `glideShow(el, show)` glides any element in or out by its height, such as a bar that pushes the content under it.
- Under reduced motion the height changes at once.
