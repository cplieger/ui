# Principles

These are the decisions every part of `@cplieger/ui` follows, and what an app can rely on because of them. [The design language](design.md) covers the look, and [CONTRIBUTING.md](../CONTRIBUTING.md) the rules and checks that hold a change to these.

## The platform first

The browser's own elements do the behaviour:

- `<dialog>` for dialogs and sheets
- `popover` with CSS anchor positioning for menus, tooltips and panels
- `<details>` for sections that open and close
- native checkboxes, radios and selects for choices

A script exists only for what the platform lacks, such as a menu's keys, a toast's queue or a press under a finger. It works on the element already in the page instead of replacing it, so the markup keeps working when the script has not loaded.

## Nothing runs on import

Importing a subpath adds no listener and changes no element. An app calls an `install…` function once for a behaviour the whole page shares, or an `enhance…` function for one element. Each takes an `AbortSignal` that ends it. A page-wide install keeps one set of listeners until every caller's signal has aborted, so one part of the page ending never removes another part's behaviour.

## Input never waits on a timer

A busy page can delay a timer by seconds. A key, a press or a dismissal therefore takes effect in the task that delivers it, and whatever closes a menu or a dialog is ready the moment it opens. A timer measures only a deliberate length of time, such as a finger held still.

## One prefix

Classes are `.cp-*`, custom properties `--cp-*`, and the state a script writes `data-cp-*`. An option an author sets is a plain attribute, such as `data-tone` or `data-variant`.

## Elements follow their container

An element sizes itself to the box it sits in, not to the window. It works the same in a rail, a dialog, a detail panel or on a phone. The frames, such as the app frame, list and detail, settings and the gate page, decide where each region goes, and no element asks which region holds it.

## Steady under change

- A control keeps its size when its words change.
- Inputs and buttons share one control height, apart from the smaller ones set inside a sentence, and a border never adds height.
- Motion shows what changed. It stays off anything done all day, such as typing or switching tabs, and off anything that loads, as [Motion](design.md#motion) sets out.

## Colour from one accent

An app chooses its colour seeds, and every step, tone and harmony colour derives from them in both themes, as [Colour](design-colour.md) sets out. A state's colour comes from `data-tone`, never from a colour written in the app.

## Every input, every engine

Every element works with a finger, a mouse and a keyboard, and follows the last real input rather than a guess. Each one is tested in Chromium, Firefox and WebKit before it lands.

## The gallery is the finish line

`gallery/` shows every approved element on a card. An element is done when its card looks and behaves as approved, in all three engines, from the library's own code. A change meant to leave the look alone is checked against the cards before and after.

## Apps compose, the library supplies

An app builds its screens, and the shapes of its own information, from these elements. When an element is missing or does not fit, it is added or extended here, and the app uses it. An app does not keep its own version beside the library's.
