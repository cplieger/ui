# tooltip

`@cplieger/ui/tooltip`

Delegated, attribute-driven tooltips. One controller handles every trigger on the page through a `data-uip-tooltip` attribute.

## Usage

```ts
import { initTooltips } from "@cplieger/ui/tooltip";

initTooltips(); // idempotent; installs one delegated controller
```

```html
<button data-uip-tooltip="Copy to clipboard">Copy</button>
<button data-uip-tooltip="Line one&#10;Line two">Multi</button>
```

A trigger whose hit box is bigger than the ink it paints can name that ink. The tooltip is then placed against the mark instead of the trigger's own centre:

```html
<!-- a row-wide control whose only ink is a leading glyph -->
<button data-uip-tooltip="Show details">
  <span data-uip-tooltip-anchor><svg>...</svg></span>
  <span class="row-label"></span>
</button>
```

A finger has no hover, so an explanation a touch user must reach lives in the page as the trigger's description, and an info button opens it on a tap:

```html
<span id="quick-help" hidden>Checks new episodes every 15 minutes.</span>
<button
  type="button"
  aria-label="About quick checks"
  aria-describedby="quick-help"
  data-uip-tooltip-ref="quick-help"
  data-uip-tooltip-toggle
>
  <span class="uip-icon" data-uip-icon="info" aria-hidden="true"></span>
</button>
```

## API

- `initTooltips(opts?)` installs the controller once. `TooltipOptions` = `{ attribute?; delayCold?; delayWarm?; cooldown? }`, with defaults `data-uip-tooltip`, 500ms, the value of `delayCold`, and 500ms.
- `<attribute>-anchor` on a descendant of a trigger marks the ink the tooltip points at. Its name follows `attribute`, so renaming the trigger attribute renames this one.
- `<attribute>-ref="<id>"` makes the text of the element with that id the trigger's tip, over any `<attribute>` text. The host lists the same id in the trigger's `aria-describedby`, so a reader hears it with no tip showing. The controller leaves that attribute as the host set it and marks the painted tip `aria-hidden`. A reference to nothing, or to an empty element, shows no tip.
- `<attribute>-toggle`, on a trigger that also has `-ref`, opens the tip at once on a click, from a tap, a mouse or Enter and Space on a button, and pins it. A second click closes it. A pinned tip stays when the pointer leaves, and closes on Escape, a press outside the trigger and the tip, a scroll, the window losing focus, focus moving elsewhere, or a hover on another trigger. Without `-ref`, a toggle opens nothing, since a tip opened by a tap is not announced.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `--uip-z-tooltip` | tooltip z-index | `10000` |
| `--uip-tooltip-fade-duration` | tooltip fade | `100ms` |
| `--uip-tooltip-fade-easing` | tooltip fade easing | `ease` |
| `.uip-tooltip` | a tooltip (`role="tooltip"`) | |
| `.uip-tooltip.is-leaving` | fade-out state class | |

## Notes

- A touch pointer never starts a hover tip, since it would cover what the finger is about to tap. A mouse and a pen still do.
- Every hover waits `delayCold`, 500ms, the time a native `title` waits, because `delayWarm` defaults to `delayCold`.
- Set `delayWarm` lower to opt into a warm group. While the group stays warm, for `cooldown`, the next tooltip shows faster. That makes a row quick to scan, but on a dense toolbar it reads as tooltips appearing with no hover time at all.
- Without `-ref`, the trigger text is added to the anchor's `aria-describedby` while it shows, and any token the app already set stays. A `\n` in the value splits it into lines separated by `<br>`.
- Escape, scroll and window blur hide the tooltip. On scroll it vanishes like a native `title`, while [popover](popover.md), an opened surface, tracks and repositions instead.
- The tooltip is positioned `fixed` above the anchor, flips below when there is no room, and is clamped to the viewport.
- A marked anchor moves the position only. Hover, focus and `aria-describedby` stay on the trigger. The mark's box is intersected with the trigger's, so ink the trigger clips, such as an ellipsised file name, cannot pull the tooltip off the control. A mark that renders nothing falls back to the trigger.
- When the anchor sits inside an open modal `<dialog>`, the tooltip is appended into that dialog so it stacks over the modal.
