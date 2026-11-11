# checkbox

`@cplieger/ui/checkbox`

A select-all box for a group of `.cp-checkbox` boxes, such as "All of these" above a list or the header box of a table's select column. A press checks or clears the group, and the box shows checked, a dash or empty as all, some or none of the group are on.

```html
<fieldset class="cp-choices">
  <legend class="cp-label">Notify me when</legend>
  <label class="cp-choice"><input class="cp-checkbox" type="checkbox" id="all"><span>All of these</span></label>
  <label class="cp-choice"><input class="cp-checkbox" type="checkbox" name="notify" value="better" checked><span>A check finds a better release</span></label>
  <label class="cp-choice"><input class="cp-checkbox" type="checkbox" name="notify" value="down"><span>A source stops answering</span></label>
</fieldset>
```

```ts
import { enhanceSelectAll } from "@cplieger/ui/checkbox";

const sync = enhanceSelectAll(all, () => form.querySelectorAll('[name="notify"]'), { signal: page.signal });
sync(); // after code checks or clears boxes itself
```

- `boxes` is read at each change, so rows added or removed need no call.
- A press of the select-all box changes only the boxes that are not disabled, and each box it changes fires `input` and `change`, as its own press would.
- The box's state counts the boxes that can change, or every box when none can, so "All of these" reads checked once everything that can be on is on.
- `enhanceSelectAll` returns `sync`, which sets the box from the group. Call it after code changes the boxes without a press.
- `signal` removes the listeners.
