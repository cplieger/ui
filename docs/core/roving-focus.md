# roving-focus

`@cplieger/ui/roving-focus`

One Tab stop for a group of controls, such as a toolbar or a row of chips. Tab enters the group at the item last used, and the arrow keys, Home and End move among its items.

```ts
import { enhanceRovingFocus } from "@cplieger/ui/roving-focus";

enhanceRovingFocus(toolbar, { signal: page.signal });
enhanceRovingFocus(list, { items: '[role="option"]', orientation: "vertical" });
```

| Option | Default | What it does |
| --- | --- | --- |
| `items` | buttons, links and `[role="option"]` | The items, matched at each key, so items added later need no call. |
| `orientation` | `"horizontal"` | `"vertical"` for the up and down arrows, or `"both"`. |
| `wrap` | `true` | From the last item an arrow goes back to the first. |
| `signal` | none | Aborting it removes the listeners and the items' `tabindex`. |

- The inline arrows run the other way in a right-to-left group. Disabled and hidden items are skipped.
- A press or a focus that reaches an item makes it the one Tab returns to.
