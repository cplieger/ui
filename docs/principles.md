# Principles

These are the decisions every part of `@cplieger/ui` follows, and what an app can rely on because of them. [The design language](design.md) covers the look, and [CONTRIBUTING.md](../CONTRIBUTING.md) the rules and checks that hold a change to these.

## The platform first

The browser's own elements do the behaviour:

- `<dialog>` for dialogs and sheets
- `popover` with CSS anchor positioning for menus, tooltips and panels
- `<details>` for sections that open and close
- native checkboxes, radios and selects for choices

A script exists only for what the platform lacks, such as a menu's keys, a toast's queue or a press under a finger. It works on the element already in the page instead of replacing it, so the markup keeps working when the script has not loaded. A feature one engine lacks is used only where its absence still leaves something usable.

## Nothing runs on import

Importing a subpath adds no listener and changes no element. An app calls an `install…` function once for a behaviour the whole page shares, or an `enhance…` function for one element. Each takes an `AbortSignal` that ends it. A page-wide install keeps one set of listeners until every caller's signal has aborted, so one part of the page ending never removes another part's behaviour.

## Input never waits on a timer

A busy page can delay a timer by seconds. A key, a press or a dismissal therefore takes effect in the task that delivers it, and whatever closes a menu or a dialog is ready the moment it opens. A timer measures only a deliberate length of time, such as a finger held still.

## One prefix

Classes are `.cp-*` and custom properties `--cp-*`. `data-cp-*` names the state a script writes and a hook a script reads on any element, such as `data-cp-tip`. An option an author sets on a library element is a plain attribute, such as `data-tone` or `data-variant`. So are `data-theme` and `data-pointer` on `<html>`, which the theme and pointer scripts write and an app may set too.

## Elements follow their container

An element sizes itself to the box it sits in, not to the window, so it works the same in a rail, a dialog, a detail panel or on a phone. No element asks which region holds it. The window sets only the frames and the overlays, by the width tiers in [Space and layout](design.md#space-and-layout). It decides where the app frame, list and detail, settings and the gate page put each region, what the header shows, and where a dialog or a toast appears.

## Steady under change

- A control never jumps when its words change. A button that confirms in place glides to its new width, and in a split button or a table's actions cell it holds its widest word, so nothing after it moves.
- Inputs and buttons share one control height, apart from `data-size="sm"` and menu items, which are smaller under a mouse and the same height under a finger. A border never adds height.
- Motion shows what changed. It stays off anything done all day, such as typing or switching tabs, and off anything that loads, as [Motion](design.md#motion) sets out.

## Colour from a few seeds

An app chooses its colour seeds, and every step, tone and harmony colour derives from them in both themes, as [Colour](design-colour.md) sets out. A state's colour comes from `data-tone`, never from a colour written in the app.

## Every input, every engine

Every element works with a finger, a mouse and a keyboard, and follows the last real input rather than a guess. CI tests each one in Chromium, and `CPLIEGER_BROWSERS=chromium,firefox,webkit npm test` runs the same tests in Firefox and WebKit before a change lands, apart from the few that need Chromium's DevTools protocol.

## The gallery is the finish line

`gallery/` shows each element on a card, and the card is the element's reference. An element is done when its card looks and behaves the same from the library's own code. Until then the card runs the gallery's own version from `gallery/legacy/`, so a change to that element in `src/` does not show on it. A change meant to leave the look alone is checked against the cards before and after.

## Apps compose, the library supplies

An app builds its screens, and the shapes of its own information, from these elements. When an element is missing or does not fit, it is added or extended here, and the app uses it. An app does not keep its own version beside the library's.
