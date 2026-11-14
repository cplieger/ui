# Moving from the earlier subpaths

`@cplieger/ui` is the cplieger design language and the components built on it. Its earlier releases also carried a general foundation for signals, DOM rendering, requests and actions, and a set of widgets built on that foundation. The foundation now lives in `@cplieger/reactive`, and each widget has a replacement here, often the browser's own element. This page is for code that imports one of them.

## The foundation

| Earlier import | Import from |
| --- | --- |
| `@cplieger/ui`, `@cplieger/ui/signal`, `@cplieger/ui/dom` | `@cplieger/reactive`, `@cplieger/reactive/signal`, `@cplieger/reactive/dom` |
| `@cplieger/ui/fetch` | `@cplieger/reactive/fetch` |
| `@cplieger/ui/actions`, `@cplieger/ui/actions/testing` | `@cplieger/reactive/actions`, `@cplieger/reactive/actions/testing` |
| `@cplieger/ui/css` | `@cplieger/ui/css/system`, which styles every component itself |

The components here need no foundation. Each takes an `AbortSignal` for its lifetime, so an app on `@cplieger/reactive` passes its owner's `signal`.

## The widgets

| Earlier subpath | Replacement |
| --- | --- |
| `dialog`, `modal`, `focus-trap` | A native `<dialog class="cp-dialog">` opened with `commandfor` or `showModal()`. The modal dialog moves focus in, makes the page inert and returns focus. [dialog](overlays/dialog.md) adds a press outside, the keep-typed shake and the exit animation where an engine lacks them, and the stylesheet stops the page scrolling. |
| `ask` | [ask](overlays/ask.md), with the same `ask(message, options)` call over a `.cp-dialog`. `variant: "destructive"` is `tone: "danger"`, which also puts focus on declining. |
| `popover`, `popup` | A native `popover` opened by `popovertarget`, placed by CSS anchor positioning in `.cp-popover`, which closes on Escape and on a press outside by itself. [anchor](overlays/anchor.md) names each opener and panel pair and opens a panel at a point. A menu is [menu](overlays/menu.md). |
| `tooltip` | [tooltip](overlays/tooltip.md): `data-cp-tip` on the control and `installTooltips()` once. |
| `toast` | [toast](feedback/toast.md): `toast({ kind, title, body, actions })`, returning `{ dismiss, update }`. |
| `announce` | [announce](feedback/announce.md): `installAnnouncer()` once, then `announce(message, politeness)`, which reaches any open modal dialog. |
| `disclosure` | A native `<details>`, with a shared `name` for one at a time, and [disclosure](navigation/disclosure.md) for the height glide in every engine. |
| `roving-focus` | [roving-focus](core/roving-focus.md): `enhanceRovingFocus(group, options)`. |
| `connection-test` | [connection-test](forms/connection-test.md): `enhanceConnectionTest(button, status, options)`. |
| `stepper` | `.cp-steps`, an `<ol>` of steps with `data-state` and `aria-current="step"`, styled by the stylesheet with no script. `@cplieger/ui/stepper` is now [stepper](forms/stepper.md), a number between a minus and a plus, with no `createStepper`. |
| `transition` | CSS transitions and `@starting-style`, which every component here uses. |
| `theme`, `skeleton`, `view-transition` | The same modules: [theme](core/theme.md), [skeleton](feedback/skeleton.md) and [view-transition](core/view-transition.md). |

Each replacement is a function you call with an element, or one install at startup, and none of them does anything as it loads.
