# load-more

`@cplieger/ui/load-more`

The next page of a list, one press at a time. A button in the list's foot, such as "Show older", adds the page after the last row; a button in a feed's head adds older entries before the first. A press turns the button busy, puts the page in, moves focus to the first item it added and says how many came. The button then takes the page's words, or goes with its part once no page is left. A page that fails is said, and the button reads Retry. The app fetches each page and renders its items itself; one module serves jobs, conversations, an activity log and a conversation's older messages.

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

- `li.cp-list-foot` is a list's last item, its one action centred. A list of groups, such as a history with one list a day, takes a `div.cp-list-foot` after them, its action at their start edge 12px below; the page then goes after the last group, as its own heading and list.
- `.cp-feed-head` comes before a `.cp-feed` in the same scroller, its one action centred. It is not pinned, so the reader meets it at the oldest entry shown. Day separators and the "New since your last visit" marker can come with a page; they are not counted.
- The module gives a button that has only words the `.cp-roll` they roll in and a `spinner-arc` that turns while it is busy, which the stylesheet draws. A button whose markup holds them already, as a [confirm](../buttons/confirm.md) button's does, keeps its own.

## API

- `enhanceLoadMore(button, opts)` wires `button`. It throws a `TypeError` when the button is in neither a list's foot nor a feed's head and `list` is not given.
- `LoadMoreOptions` = `{ load, list?, edge?, words?, signal? }`.
  - `load(signal)` fetches the next page and resolves to `{ items, more, label? }`. `items` are the elements to add in their order; one already in the list, such as a row a [keyed-list](keyed-list.md) drew, stays where it is. `more` says whether another page is left. `label` gives the button new words from now on, such as "Show the last 3". A rejection is the failed state. `signal` aborts when the module's signal does.
  - `list` is where the items go. By default, at the end, the list a `li.cp-list-foot` ends, or the element before a `div.cp-list-foot`; at the start, the element after the `.cp-feed-head`.
  - `edge` is `"end"` (the default), after the last row and before the foot, or `"start"`, before the first item.
  - `words` = `{ count?, busy?, failed?, retry? }`. `count(n)` is said once a page of `n` rows or entries is in, by default "20 more rows" at the end and "20 older messages" at the start. `busy` is the button's words while it loads, by default "Loading…". `failed` is said when a page fails, by default "The next page did not load.". `retry` is the button's words after a failure, by default "Retry".
  - `signal` ends a load under way, drops a page that comes after it, puts the button at rest and removes its listener.

## Behaviour

- A press runs one load at a time; a press while one runs does nothing. The button reads busy, with `aria-busy="true"`, only once the load has run 150ms, so a fast page never flashes it, and then for at least 400ms.
- Once a page is in, focus moves to its first item: a row's first part that takes focus, such as its link, else the row, which takes `tabindex="-1"` until it loses focus; a feed's entry itself; a group's heading. So the reader goes on reading from where the page starts, and at a feed's start reads down to where they were. Focus moves only while it is still on the button or on the page; a reader who moved it elsewhere during the load keeps it there.
- The count is said politely through [announce](../feedback/announce.md). A page with no rows says nothing.
- When `more` is false the foot or head goes. Focus on its button moves to the edge's row, the last at the end or the first at the start, so it never drops to the page.
- A failed page is said with `failed`, and the button reads `retry` and loads the same page again on a press. A page that loads after that gives it back its words.
- At a feed's start, [feed](feed.md) keeps the reader's place as the older entries go in, then takes the entry focus moves to as the reader's new place.
- The module does nothing when it is imported.
