# pill

`@cplieger/ui/pill`

Slides one raised pill under the chosen segment of a `.cp-segmented`, the selected tab of a `.cp-tabs` tablist, the current link of a `nav.cp-tabs` or the current destination of the header's `.cp-nav` in its bottom bar, on a spring, instead of each choice filling on its own. The pill lands without motion when the page first draws and when the group resizes, and slides when the choice changes. Under reduced motion it moves at once, since the choice's own state already says which is chosen.

```ts
import { enhancePill } from "@cplieger/ui/pill";

enhancePill(document.querySelector(".cp-segmented")!, { signal: page.signal });
```

- The segmented choice works without it: the chosen segment then fills itself. So do tabs and the bottom bar.
- On the header's `.cp-nav` the pill shows only under 40rem, where the nav is the bottom bar, as the destination's own inset mark. At full width each link keeps its own fill.
- It follows a radio's `change`, a tab's `aria-selected` and a link's `aria-current`, whatever script sets the attribute. [tabs](../navigation/tabs.md) adds it to its strip.
- On a segmented choice the pill follows any change on the page, so it hides when another control clears the choice, as a typed date clears a date range's quick range, and it follows a form's reset.
- Calling it twice on one group adds one pill. Aborting `signal` removes the pill.
