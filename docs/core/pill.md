# pill

`@cplieger/ui/pill`

Slides one raised pill under the chosen segment of a `.cp-segmented`, on a spring, instead of each segment filling on its own. The pill lands without motion when the page first draws and when the group resizes, and slides when the choice changes.

```ts
import { enhancePill } from "@cplieger/ui/pill";

enhancePill(document.querySelector(".cp-segmented")!, { signal: page.signal });
```

- The segmented choice works without it: the chosen segment then fills itself.
- Calling it twice on one group adds one pill. Aborting `signal` removes the pill.
