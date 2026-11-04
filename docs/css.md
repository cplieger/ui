# CSS contract

This page covers the base stylesheet and how to style the widgets, for a developer giving them an app's look.

## Loading the base stylesheet

Load the base stylesheet once, before the widgets render:

```ts
import "@cplieger/ui/css";
```

The `/css` import works on npm. JSR exports only modules, so a JSR install has no `/css` export. Load the stylesheet from the package file `css/ui-primitives.css` instead.

## What you supply

The base stylesheet sets only layout and motion. You supply the rest in two ways:

1. Define `--uip-*` custom properties for anything the base stylesheet reads, such as durations, offsets, z-indices and the backdrop dim. Set them in `:root` or on a narrower selector.
2. Write your own rules against the `.uip-*` classes for background, color, border, radius, padding and type.

```css
:root {
  --uip-toast-duration: 5000ms;
}
.uip-toast {
  background: #1e1e1e;
  color: #fff;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.uip-toast-progress {
  --uip-toast-progress-color: #4ade80;
}
```

## Names the widgets own

Everything the widgets own is namespaced, so it never collides with your app's names:

- classes: `uip-*`, such as `.uip-toast` and `.uip-tooltip`
- custom properties: `--uip-*`, such as `--uip-toast-duration`
- trigger attributes: `data-uip-*`, such as `data-uip-tooltip`
- state classes: `is-*` on a widget element, such as `.uip-toast.is-entering`, `.is-shown` and `.is-leaving`

Each widget's reference page lists its own classes, state classes and custom properties.

## Shared tokens

One token is shared. `--uip-backdrop` sets the dialog and ask backdrop dim, defaults to `oklch(0% 0 0deg / 50%)`, and is the default for `--uip-modal-backdrop`.

Every motion property is a duration and easing pair. The `--uip-*-easing` timing functions default to `ease`, except the toast progress bar, which defaults to `linear`. You override them the same way as the durations.

Stacking in the page follows a fixed order. `--uip-z-popover` (`1100`) sits below `--uip-z-toast` (`9999`) and `--uip-z-tooltip` (`10000`). A modal `<dialog>` opens in the browser's top layer, above every `z-index`.

## Hiding and motion

`.uip-visually-hidden` hides an element from sight but keeps it in the accessibility tree. The announce regions use it, and so can a label collapsed at narrow widths. Never hide such an element with `display: none` or `visibility: hidden`, which remove it from that tree too.

Under `prefers-reduced-motion: reduce`, the base stylesheet cuts animations to 0.01ms rather than zero. `transitionend` and `animationend` still fire, so close animations complete.
