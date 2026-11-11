# context-panel

`@cplieger/ui/context-panel`

A panel of what surrounds the main work, such as a thread's reservations, queue and followers beside its feed. Once the box holding both is 44rem wide, the panel docks as a 16rem column at the inline start, always open, with one line between it and the main column. Below that width it is a disclosure above the main column, which the person opens and shuts.

```html
<div class="cp-context" id="thread-context">
  <details class="cp-context-panel">
    <summary>Reservations, queue and followers</summary>
    <section>
      <h3>Reservations</h3>
      <ol>
        <li><a href="#agent-kiro">@kiro</a> holds it</li>
        <li><a href="#agent-codex">@codex</a>, 2nd in queue</li>
      </ol>
    </section>
    <section>
      <h3>Followers</h3>
      <ul>
        <li><a href="#agent-kiro">@kiro</a></li>
      </ul>
    </section>
  </details>
  <div class="cp-context-main">
    <ol class="cp-feed" aria-label="Messages">…</ol>
    <div class="cp-feed-foot">…</div>
  </div>
</div>
```

```ts
import { enhanceContextPanel } from "@cplieger/ui/context-panel";

enhanceContextPanel(document.getElementById("thread-context")!, { signal: page.signal });
```

## The parts

- `.cp-context` holds the panel first and the main column second. The panel comes first in the source in both layouts, so the reading and focus order stay the order on screen.
- `details.cp-context-panel` holds a `<summary>` naming what it holds, then a `<section>` for each group, an `h3` over its content. The summary draws a chevron that turns as the panel opens.
- `.cp-context-main` is the main column, such as a [feed](../data/feed.md) and its pinned foot.
- While the groups load, a section holds `.cp-skeleton` lines and carries `aria-busy="true"`. An empty group says so in a `.cp-meta` line, such as "No reservations.".
- Docked, the panel sticks under any sticky header, `--cp-sticky-top` from the top, and scrolls on its own when it is taller than the window. Inside a box of bounded height, a [list-detail](list-detail.md) dialog or the docked detail of its wide variant, the context fills the box: the main column scrolls inside it beside the docked panel, or the whole context scrolls below the open disclosure, so a feed's foot stays pinned to the box's end.

## API

- `enhanceContextPanel(root, opts?)` wires a `.cp-context`. It throws a TypeError when the root's first child is not a `<details>` with a `<summary>`.
- `ContextPanelOptions` = `{ dockAt?, signal? }`.
  - `dockAt` is the box's width, in rem, from which the panel docks. Default 44, which leaves a 28rem main column beside the 16rem panel, so the panel docks in the wide detail of a 1440px window.
  - `signal` removes the observer and the listeners, and undocks the panel.

## Behaviour

- The script measures the box, not the window, with a `ResizeObserver`, and docks the panel by setting `data-cp-docked` on the root. A hidden root, such as a detail not yet shown, is measured once it shows.
- Docked, the panel is open and its summary hidden. Below the docking width the panel is open or shut as the person last left it, and stays open when it undocks while focus is inside it.
- Focus on the summary as it hides moves to the panel's first heading, which takes `tabindex="-1"` for it until the signal aborts.
- The disclosure glides open and shut through [disclosure](../navigation/disclosure.md), and at once when the person asked for less motion.
- The module does nothing when it is imported.
