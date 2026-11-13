# feed

`@cplieger/ui/feed`

An open conversation: its entries in time order, oldest at the top, with the composer pinned under them. The feed opens at the newest entry and follows new ones while the reader is there. Once the reader has scrolled up, nothing that arrives moves them: a New messages button above the composer counts the arrivals, and a press takes them to the newest. The stylesheet draws every part, and the script keeps the reader's place.

```html
<div class="cp-detail-body">
  <div class="cp-feed-head"><button class="cp-button" data-size="sm" type="button">Show older</button></div>
  <ol class="cp-feed" aria-label="Messages">
    <li class="cp-feed-day"><time datetime="2026-11-11">11 November</time></li>
    <li class="cp-feed-entry">
      <header>
        <a href="#agent-kiro">@kiro</a>
        <span class="cp-chip"><span class="cp-mono">internal/feed</span></span>
        <time datetime="2026-11-11T10:02:00Z">10:02</time>
      </header>
      <h3>Feed scroll</h3>
      <p class="cp-feed-text">The reservation is yours from now.</p>
      <footer>
        <button class="cp-button" data-variant="quiet" data-size="sm" type="button" popovertarget="read-41">Read by 3 of 5</button>
      </footer>
    </li>
    <li class="cp-since">New since your last visit</li>
    <li class="cp-feed-entry" data-own>…</li>
  </ol>
  <div class="cp-feed-foot">
    <button class="cp-button cp-feed-jump" data-size="sm" type="button" hidden></button>
    <form class="cp-form">…</form>
  </div>
</div>
```

```ts
import { enhanceFeed } from "@cplieger/ui/feed";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

const feed = enhanceFeed(list, { foot, jump, signal: page.signal });
for (const t of list.querySelectorAll("time[datetime*='T']")) {
  enhanceRelativeTime(t, { signal: page.signal });
}
```

## The parts

- `ol.cp-feed` holds the entries as `li.cp-feed-entry`, oldest first. `li.cp-feed-day` separators, each a `<time>` with the day, fall between them, and at most one `li.cp-since`, "New since your last visit", the marker a [list](list-row.md) holds too, comes before the first entry the person has not seen. The feed is a list rather than a live region, because a live region would read every arrival in full. The New messages button says what arrived.
- An entry's `<header>` holds the author's link, any origin as a `.cp-chip` and the `<time>` at the end, which [relative-time](relative-time.md) keeps current. Then an `<h3>` subject, the body and a `<footer>`. A plain-text body is `p.cp-feed-text`, which keeps its line breaks and wraps a long path rather than widening the feed. Keep rendered markdown out of `.cp-feed-text`, whose rule would draw the spaces between its blocks.
- `data-own` marks the person's own entry, whose author reads "You". It sits on the sunken fill, with its text on the same edge as everyone else's.
- An own entry still sending carries `data-state="sending"` and `aria-busy="true"`, and its footer holds a `.cp-inline-load` "Sending…". One that failed carries `data-state="failed"`, and its footer holds a danger `.cp-state` "Not sent." and a small plain Retry button.
- The read summary, "Read by 3 of 5", is a quiet small button opening a `.cp-popover.cp-feed-readers` with a `<section>` each for "Read" and "Not read yet", an `h4` over a list of links. While the names load, the popover holds a `.cp-inline-load`. When they fail, it holds a danger `.cp-notice` with Retry.
- While the entries load, the feed carries `aria-busy="true"` and holds `li.cp-feed-entry[data-skeleton]` items of four `.cp-skeleton` lines. With none, the detail says so in a sentence, such as "No messages in the last 72 hours.", in place of the feed.
- `.cp-feed-head` comes before the feed in its scroller, not pinned, and holds the button that shows older entries above the first, such as "Show older", which [load-more](load-more.md) drives with `edge: "start"`. Its press moves focus to the oldest entry it added, so the reader reads down to where they were, and the feed takes that as the reader's new place. Once the oldest page is in, the head goes.
- `.cp-feed-foot` follows the feed in its scroller and stays pinned to the scroller's end. It holds `button.cp-feed-jump`, `hidden` until the script shows it, and the composer.

## The composer

The composer is a form like any other:

```html
<form class="cp-form" id="compose" novalidate>
  <div class="cp-field">
    <label class="cp-label" for="subject">Subject</label>
    <input class="cp-input" id="subject" name="subject" required>
  </div>
  <div class="cp-field">
    <label class="cp-label" for="body">Message</label>
    <textarea class="cp-input" id="body" name="body" required></textarea>
    <span class="cp-textarea-count" id="body-count"></span>
  </div>
  <button class="cp-button" data-variant="primary" type="submit" id="send">
    <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span>
    <span class="cp-icon" data-cp-icon="check" data-part="done" aria-hidden="true"></span>
    <span class="cp-roll">Send</span>
  </button>
</form>
```

```ts
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { reportErrors } from "@cplieger/ui/form";
import { enhanceTextarea, utf8Length } from "@cplieger/ui/textarea";

enhanceTextarea(body, { max: 65536, measure: utf8Length, count: bodyCount, submitOnModEnter: true, signal: page.signal });
const send = enhanceConfirm(sendButton, { busy: "Sending…", done: false, signal: page.signal });
compose.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errors = check(compose); // [{ field, message }]
  reportErrors(compose, errors);
  if (errors.length === 0) {
    await send.run(() => api.send(compose)); // the own entry shows sending, then sent or failed
  }
});
```

- Send stays enabled with empty fields, so a press says what is missing, as every form does.
- Ctrl+Enter, or Command+Enter on a Mac, sends from the message. Enter alone breaks the line.
- Append the own entry with `data-state="sending"` as the send starts, so the feed scrolls to it, and keep the text in the fields until the send is done. A failed send leaves the entry failed with Retry, and the text stays.

## API

- `enhanceFeed(feed, opts?)` wires an `ol.cp-feed` or `ul.cp-feed`, scrolls it to its newest entry at once and returns a `Feed`.
- `FeedOptions` = `{ foot?, jump?, words?, signal? }`.
  - `foot` is the `.cp-feed-foot`. The script keeps the feed's `--cp-feed-foot-size` at the foot's height, and while the New messages button shows, at the height of the foot and the button together. The stylesheet makes it the end scroll margin of everything in the feed except a popover's contents. So whatever focus scrolls into view lands above the composer and the button with its focus ring clear, while the composer's caret moves nothing. The script also sets the foot's `--cp-keyboard-inset` to the part of it an on-screen keyboard covers, measured on the visual viewport, so the composer rises above the keyboard.
  - `jump` is the `.cp-feed-jump` button. Its words go in its `.cp-roll`, which rolls as the count grows, else they are its whole text.
  - `words(n)` gives the jump's words for `n` new entries, by default "1 new message" and "3 new messages".
  - `signal` removes the listeners and observers, hides the jump and puts back every property the script set.
- `Feed` = `{ toNewest(), unseen }`. `toNewest()` scrolls to the newest entry at once and clears the count, such as after the app opens another conversation in the same feed. `unseen` is the number of entries counted since the reader last saw the end.

## Behaviour

- The feed's scroller is the nearest box around it that scrolls, else the page. It is found again as the feed shows, moves or changes, so a detail that moves from its docked place into a dialog keeps its feed followed.
- The reader's place is either the end or the entry at the top of the view with its distance from the top. The scroller's `scroll-padding-block-start` counts as covered, so under a sticky header the place is the first entry the reader sees below it. Only the reader's own scrolling sets it, and the scroll focus makes, such as onto the oldest entry a Show older press added, and within 2rem of the end counts as at the end. A place the feed scrolled to itself is never taken for the reader's.
- After anything that can move the entries, the feed puts the place back in one step. That covers entries added above or below, an entry or the foot growing or shrinking, the on-screen keyboard opening and closing, and a load. At the end, it scrolls to the end. Scrolled up, the entry at the top goes back to where it was. With that entry gone, as after a list replaced whole, the scroll position itself is the place. The browser's own scroll anchoring is off in the feed, because the two would fight.
- The feed scrolls for nothing else, the page included. Its own writes are this one step and the reader's ways to the newest: the jump, `toNewest()`, their own entry and the first entries of an empty feed.
- On the page, the end is where the foot rests under the last entry, whatever follows the feed. When that place already shows, as for a short conversation or a page scrolled past the feed, the feed scrolls nothing: it only ever scrolls down to its end.
- A feed that is hidden when it is wired, such as one in a detail not yet open, scrolls nothing until it shows, and then opens at its newest entry. A `toNewest()` called as it shows scrolls the box that holds it, never the page.
- An arrival is an entry appended after the newest one while the feed is not `aria-busy="true"`. Arrivals while the reader is scrolled up are counted. A day separator or the marker added with them is not. The jump shows the count, and its words are said politely as it shows and as the count changes.
- The jump hides once the reader reaches the end, by scrolling or by pressing it. A press scrolls to the newest, smoothly unless the person asked for less motion, and moves focus to the newest entry, which takes `tabindex="-1"` for it. Focus on the jump as it hides moves there too, so it never drops to the page.
- The person's own entry appended after the newest always scrolls there, wherever the reader was and even while a load is under way. So does anything added while the feed held no entry, such as the first load.
- Every other entry is a load: entries shown above, such as by "Show older", a list replaced whole, and anything added while the feed is `aria-busy="true"`. That holds even when the app sets and clears it in one go. A load is never counted, and it keeps the place like any other change. A reader at the end stays at the end, and one scrolled up stays on their entry. Marking the feed busy and clearing it moves nothing.
- A pinch zoom also shrinks the visual viewport, so the keyboard inset is measured only at a scale of 1.
- The module does nothing when it is imported.
