# load-more

`@cplieger/ui/load-more`

The next page of a list, one press at a time. A button in the list's foot, such as "Show older", adds the page after the last row, and a button in a feed's head adds older entries before the first. A press turns the button busy, puts the page in, moves focus to the first item it added and says how many came. The button then takes the page's words, or goes with its part once no page is left. A page that fails is said, and the button reads Retry. The app fetches each page and renders its items itself. One module serves jobs, conversations, an activity log and a conversation's older messages.

```html
<ul class="cp-list" aria-label="Conversations">
  <li><a class="cp-list-row" href="/c/ui">…</a></li>
  <li class="cp-list-foot"><button class="cp-button" data-size="sm" type="button">Show older</button></li>
</ul>

<!-- Older messages above a feed, inside the same scroller -->
<div class="cp-detail-body">
  <div class="cp-feed-head"><button class="cp-button" data-size="sm" type="button">Show older</button></div>
  <ol class="cp-feed" aria-label="Messages">…</ol>
  <div class="cp-feed-foot">…</div>
</div>
```

```ts
import { enhanceLoadMore } from "@cplieger/ui/load-more";

enhanceLoadMore(showOlder, {
  load: async (signal) => {
    const page = await api.conversations({ before: cursor, signal });
    cursor = page.next;
    return { items: page.rows.map(renderRow), more: page.next !== null };
  },
  signal: view.signal,
});

// A conversation's older posts, 100 a page, before its first entry.
enhanceLoadMore(olderPosts, {
  edge: "start",
  load: async (signal) => {
    const page = await api.posts(thread, { before: cursor, signal });
    cursor = page.next;
    return { items: renderEntries(page.posts), more: page.next !== null };
  },
  signal: view.signal,
});
```

## The parts

- `li.cp-list-foot` is a list's last item, its one action centred. A list of groups, such as a history with one list a day, takes a `div.cp-list-foot` after them, its action at their start edge 12px below. Each group is a heading and its list, written side by side before the foot or inside one element before it. A page's `li` rows go into the last group's list, so they continue its day, and a new group, its heading and its list, goes after the last group. One page can do both. A `.cp-table` takes a `div.cp-list-foot` after it, or after the `.cp-panel` that holds it, and a page's rows go at the end of its last body, which the module adds before any `tfoot` when the table has only its head. A page's `tbody` elements go after its last body. A table whose rows a [held-list](held-list.md) also watches writes that body empty in its first render, so both modules work on the same one.
- `.cp-feed-head` comes before a `.cp-feed` in the same scroller, its one action centred. It is not pinned, so the reader meets it at the oldest entry shown. Day separators and the "New since your last visit" marker can come with a page and are not counted.
- The module gives a button that has only words the `.cp-roll` they roll in and a `spinner-arc` that turns while it is busy, which the stylesheet draws. A button whose markup holds them already, as a [confirm](../buttons/confirm.md) button's does, keeps its own.

## API

- `enhanceLoadMore(button, opts)` wires `button`. It throws a `TypeError` when the button is in neither a list's foot nor a feed's head and `list` is not given.
- `LoadMoreOptions` = `{ load, list?, edge?, words?, signal? }`.
  - `load(signal)` fetches the next page and resolves to `{ items, more, label? }`. `items` are the elements to add in their order. One already in the list, such as a row a [keyed-list](keyed-list.md) drew or a row the app put in a group's list itself, stays where it is. `more` says whether another page is left. `label` gives the button new words from now on, such as "Show the last 3". A rejection is the failed state. `signal` aborts when the module's signal does.
  - `list` is where the items go. By default, at the end, the list a `li.cp-list-foot` ends, or what a `div.cp-list-foot` follows: a table, or a panel holding one, takes them in its last body, and a list's groups take them at their end as "The parts" says. At the start, it is the element after the `.cp-feed-head`. A table given as `list` takes a page's rows in its last body and its bodies after its last body, or, at the start, the rows first in its first body and the bodies before it. A body the module adds goes before any `tfoot`.
  - `edge` is `"end"` (the default), after the last row and before the foot, or `"start"`, before the first item.
  - `words` = `{ count?, busy?, failed?, retry? }`. `count(n)` is said once a page of `n` rows or entries is in, by default "20 more rows" at the end and "20 older messages" at the start. `busy` is the button's words while it loads, by default "Loading…". `failed` is said when a page fails, by default "The next page did not load.". It is a sentence, or a function given what `load` rejected with that returns one, so the server's reason can be said ("Older messages could not be loaded. The store is busy."). `retry` is the button's words after a failure, by default "Retry".
  - `signal` ends a load under way, drops a page that comes after it, puts the button at rest and removes its listener.

## Behaviour

- A press runs one load at a time, and a press while one runs does nothing. The button reads busy, with `aria-busy="true"`, only once the load has run 150ms, so a fast page never flashes it, and then for at least 400ms.
- Once a page is in, focus moves to its first item. In a row that is the row's first part that takes focus, such as its link (a disabled control, or one the page does not show, is passed over), else the row itself, which takes `tabindex="-1"` until it loses focus. In a feed it is the entry itself, and in a list of groups the group's heading. So the reader goes on reading from where the page starts, and at a feed's start reads down to where they were. Focus moves only while it is still on the button or on the page. A reader who moved it elsewhere during the load keeps it there.
- The count is said politely through [announce](../feedback/announce.md). Only the rows and entries count: not a group's heading, a day separator or the `.cp-since` line, nor a table's head or foot rows, nor the steps of a row's track or the items of a list in its `<details>`. A page item that holds a table, such as a day's `.cp-panel`, counts the table's body rows. A page with no rows says nothing.
- When `more` is false the foot or head goes. Focus on its button moves to the edge's row, the last at the end or the first at the start, so it never drops to the page.
- A failed page is said with `failed`, and the button reads `retry` and loads the same page again on a press. A page that loads after that gives it back its words.
- At a feed's start, [feed](feed.md) keeps the reader's place as the older entries go in, then takes the entry focus moves to as the reader's new place.
- The module does nothing when it is imported.
