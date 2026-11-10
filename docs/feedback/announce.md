# announce

`@cplieger/ui/announce`

Says a message to a screen reader without showing it, for a change the eye sees but a reader would not hear, such as a list that filtered or a row that moved.

```ts
import { announce, installAnnouncer } from "@cplieger/ui/announce";

installAnnouncer({ signal: page.signal }); // at startup
announce("33 entries match");
announce("Sonarr stopped answering", "assertive");
```

- A modal dialog makes everything outside it inert, live regions included. So `announce` writes to a polite and an assertive region inside the topmost modal dialog, and to the page's pair when none is open. Any modal dialog works, whoever opened it.
- `installAnnouncer` makes the page's pair, and gives each dialog its pair before it opens, since a reader can miss a region made in the same change that fills it. A dialog's close empties its regions, so an old message is not read again when it next opens.
- The region is emptied and written 100ms later, so the same message twice is read twice. A second message at the same politeness within those 100ms replaces the first.
- With no announcer installed and no dialog open, `announce` does nothing.
