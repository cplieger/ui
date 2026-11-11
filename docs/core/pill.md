# pill

`@cplieger/ui/pill`

Slides one raised pill under the chosen segment of a `.cp-segmented`, or the pressed button of a `.cp-toggle-group`, on a spring, instead of each filling on its own. The pill lands without motion when the page first draws and when the group resizes, and slides when the choice changes.

```ts
import { enhancePill } from "@cplieger/ui/pill";

enhancePill(document.querySelector(".cp-segmented")!, { signal: page.signal });
```

- The segmented choice and the toggle group work without it: the chosen segment or the pressed button then fills itself.
- In a toggle group the pill follows `aria-pressed`, so it slides when a press or the host presses another button.
- Calling it twice on one group adds one pill. Aborting `signal` removes the pill.
