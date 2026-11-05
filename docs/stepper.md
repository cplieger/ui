# stepper

`@cplieger/ui/stepper`

The progress display of a multi-step flow whose steps are routes: an ordered list naming every step, each marked done, current or to do, and the "Step 2 of 5: Media paths" heading for your page's `<h1>`. It renders progress only. Your app keeps each step's state, decides when Next may proceed, owns the buttons and the form, and routes.

## Usage

```ts
import { createStepper, type StepperStep } from "@cplieger/ui/stepper";

const steps = (current: string): StepperStep[] => [
  { id: "connect", label: "Connect", state: current === "connect" ? "current" : "done", href: "/setup/connect" },
  { id: "paths", label: "Media paths", state: current === "paths" ? "current" : "todo", href: "/setup/paths" },
];

const stepper = createStepper(progressSlot, steps("connect"));
heading.textContent = stepper.heading(); // "Step 1 of 2: Connect"

// On each navigation, from your route handler:
stepper.update(steps("paths"));
heading.textContent = stepper.heading();
```

## API

- `createStepper(root, steps, labels?)` renders `<ol class="uip-stepper">` into `root` and returns `{ update(steps), heading(), dispose() }`.
- `StepperStep` = `{ id, label, state, href }`. `state` is `"done"`, `"current"` or `"todo"`. A done or to-do step with an `href` is a link; the current step never is, and a null `href` gives plain text.
- `StepperLabels` = `{ heading?, done?, current?, todo?, list? }`. The defaults are `Step n of m: label`, "done", "current step", "not started", and "Progress" for the list's accessible name.

## Notes

- Each item carries `data-step` and `data-state`; the current one also has `aria-current="step"`. The state word is in each item's accessible text, after a comma, in a `.uip-visually-hidden` span, so the state never rests on a glyph or a colour.
- The stepper ships no CSS and draws no glyph. Draw your ✓, ● and ○ from `data-state`, and hide `.uip-stepper` in your own container query at the width where only the heading should show.
- Links are plain `<a href>`, with no click handler: your router handles them like any other same-origin link.
- `update` keeps the node of every item whose label, state and link are unchanged, and never moves the item holding focus, so a focused link keeps focus. The exception is an item you moved out of the list: the next `update` puts that node back, and focus inside it moves to the page. An item whose label, state or link changes is replaced, so focus inside it moves to the page: move focus to your `<h1>` on navigation, as for any route change.
- `createStepper` and `update` throw a `TypeError` naming the fault for no step, not exactly one current step, a duplicate `id`, an empty `label`, a `state` that is not one of the three, or an `id`, `label` or `href` that is not a string (or null for `href`); `createStepper` also refuses a `labels` word that is set but not a string, or a `heading` that is set but not a function; null takes the default, as an unset one does. These are programming errors. A refused `update` leaves the previous list on screen.
- An `update` called while another one renders, as from a `focusout` handler that removing a focused item fires, returns at once: `heading()` already follows its list, and the running `update` draws the newest list before it returns. Putting back a focused item you moved out of the list fires `focusout` too. A handler that keeps the render restarting, past 50 restarts, makes the outer `update` throw an `Error` and leaves the list partly drawn until the next `update`.
- There is no draft: the stepper holds no state of its own, so persist your form's state yourself if you need it.
- `dispose()` removes the list; after it `update` does nothing and `heading()` returns the last heading. A stepper made under an owner ends with that owner.
