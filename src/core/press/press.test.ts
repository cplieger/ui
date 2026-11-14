import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";

import { installPress } from "./press.js";

type Kind = "mouse" | "touch" | "pen";

interface PointerInit {
  readonly kind?: Kind;
  readonly id?: number;
  readonly x?: number;
  readonly y?: number;
  readonly button?: number;
  readonly primary?: boolean;
  readonly related?: EventTarget | null;
}

function pointer(type: string, target: EventTarget, init: PointerInit = {}): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      pointerId: init.id ?? 1,
      pointerType: init.kind ?? "mouse",
      isPrimary: init.primary ?? true,
      button: init.button ?? 0,
      clientX: init.x ?? 0,
      clientY: init.y ?? 0,
      relatedTarget: init.related ?? null,
    }),
  );
}

function key(
  type: "keydown" | "keyup",
  target: EventTarget,
  k: string,
  init: KeyboardEventInit = {},
): void {
  target.dispatchEvent(
    new KeyboardEvent(type, { key: k, bubbles: true, composed: true, cancelable: true, ...init }),
  );
}

function mount<T extends Element>(markup: string, selector: string): T {
  const host = document.createElement("div");
  // Static test markup, never caller text.
  host.setHTMLUnsafe(markup);
  document.body.append(host);
  const el = host.querySelector<T>(selector);
  if (el === null) {
    throw new Error(`no ${selector}`);
  }
  return el;
}

const pressed = (el: Element): boolean => el.hasAttribute("data-cp-pressed");
const anyPressed = (): Element | null => document.querySelector("[data-cp-pressed]");

let installs: AbortController[] = [];
function install(): AbortController {
  const ac = new AbortController();
  installs.push(ac);
  installPress({ signal: ac.signal });
  return ac;
}

afterEach(() => {
  for (const ac of installs) {
    ac.abort();
  }
  installs = [];
  vi.useRealTimers();
  document.body.replaceChildren();
});

const fake = (): void => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
};

describe("installPress with a mouse", () => {
  it("presses at once and lets go 150ms after a quick click", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(true);
    pointer("pointerup", b);
    vi.advanceTimersByTime(149);
    expect(pressed(b)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(pressed(b)).toBe(false);
  });

  it("lets go of a long press as soon as the button comes up", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    vi.advanceTimersByTime(400);
    expect(pressed(b)).toBe(true);
    pointer("pointerup", b);
    expect(pressed(b)).toBe(false);
  });

  it("keeps the press while the mouse moves", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { x: 0, y: 0 });
    pointer("pointermove", b, { x: 40, y: 30 });
    expect(pressed(b)).toBe(true);
  });

  it("hides a press dragged off its button and shows it again on return", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button><p>out</p>", "button");
    const out = document.querySelector("p") as HTMLElement;
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(true);
    pointer("pointerout", b, { related: out });
    expect(pressed(b)).toBe(false);
    pointer("pointerover", b, { related: out });
    expect(pressed(b)).toBe(true);
  });

  it("shows nothing when the button comes up off the control", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button><p>out</p>", "button");
    const out = document.querySelector("p") as HTMLElement;
    pointer("pointerdown", b);
    pointer("pointerout", b, { related: out });
    pointer("pointerup", out);
    expect(anyPressed()).toBeNull();
    vi.advanceTimersByTime(500);
    expect(anyPressed()).toBeNull();
  });

  it("ignores the secondary button", () => {
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { button: 2 });
    expect(pressed(b)).toBe(false);
  });

  it("ignores a second finger", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind: "touch", primary: false, id: 2 });
    vi.advanceTimersByTime(100);
    expect(pressed(b)).toBe(false);
  });

  it("keeps a press while focus moves off another element", () => {
    install();
    const field = mount<HTMLInputElement>("<input>", "input");
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    field.focus();
    pointer("pointerdown", b);
    b.focus();
    expect(pressed(b)).toBe(true);
  });
});

describe.each<Kind>(["touch", "pen"])("installPress with a %s", (kind) => {
  it("shows a held press after 100ms", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind });
    vi.advanceTimersByTime(99);
    expect(pressed(b)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(pressed(b)).toBe(true);
  });

  it("shows a quick tap as it lifts, for the whole 150ms", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind });
    vi.advanceTimersByTime(40);
    pointer("pointerup", b, { kind });
    expect(pressed(b)).toBe(true);
    vi.advanceTimersByTime(149);
    expect(pressed(b)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(pressed(b)).toBe(false);
  });

  it("never shows a press the browser cancels for a scroll", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind });
    vi.advanceTimersByTime(50);
    pointer("pointercancel", b, { kind });
    vi.advanceTimersByTime(300);
    expect(pressed(b)).toBe(false);
  });

  it("drops a showing press the moment the browser cancels it", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind });
    vi.advanceTimersByTime(120);
    expect(pressed(b)).toBe(true);
    pointer("pointercancel", b, { kind });
    expect(pressed(b)).toBe(false);
  });

  it("keeps a press through 8px of travel", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind, x: 10, y: 10 });
    pointer("pointermove", b, { kind, x: 10, y: 18 });
    vi.advanceTimersByTime(100);
    expect(pressed(b)).toBe(true);
  });

  it("cancels a press that travels further than 8px", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind, x: 10, y: 10 });
    pointer("pointermove", b, { kind, x: 16, y: 17 });
    vi.advanceTimersByTime(100);
    pointer("pointerup", b, { kind });
    expect(pressed(b)).toBe(false);
  });
});

describe("installPress targets", () => {
  it("presses the nearest pressable ancestor of the target", () => {
    install();
    const b = mount<HTMLButtonElement>("<button><span>Go</span></button>", "button");
    pointer("pointerdown", b.querySelector("span") as HTMLElement);
    expect(pressed(b)).toBe(true);
  });

  it.each([
    [
      "a checkbox's label, from the box",
      '<label><input type="checkbox"><span>A</span></label>',
      "input",
    ],
    [
      "a checkbox's label, from its words",
      '<label><input type="checkbox"><span>A</span></label>',
      "span",
    ],
    ["a radio's label", '<label><input type="radio" name="r"> A</label>', "input"],
  ])("presses %s", (_, markup, from) => {
    install();
    const label = mount<HTMLLabelElement>(markup, "label");
    pointer("pointerdown", label.querySelector(from) as HTMLElement);
    expect(pressed(label)).toBe(true);
  });

  it.each([
    ["a link", '<a href="#x">x</a>', "a"],
    ["a summary", "<details><summary>More</summary></details>", "summary"],
    ["a role=button", '<div role="button" tabindex="0">x</div>', "div"],
    ["a listbox option", '<ul role="listbox"><li role="option">x</li></ul>', "li"],
  ])("presses %s", (_, markup, sel) => {
    install();
    const el = mount<HTMLElement>(markup, sel);
    pointer("pointerdown", el);
    expect(pressed(el)).toBe(true);
  });

  it.each([
    ["a disabled button", "<button disabled>x</button>", "button"],
    ["an aria-disabled button", '<button aria-disabled="true">x</button>', "button"],
    [
      "a button in a disabled fieldset",
      "<fieldset disabled><button>x</button></fieldset>",
      "button",
    ],
    ["an aria-disabled link", '<a href="#x" aria-disabled="true">x</a>', "a"],
    [
      "an aria-disabled summary",
      '<details><summary aria-disabled="true">More</summary></details>',
      "summary",
    ],
    ["a link with no href", "<a>x</a>", "a"],
    ["the label of a text field", '<label>Name <input type="text"></label>', "label"],
    [
      "the label of a disabled checkbox",
      '<label><input type="checkbox" disabled> A</label>',
      "label",
    ],
    [
      "an aria-disabled listbox option",
      '<ul role="listbox"><li role="option" aria-disabled="true">x</li></ul>',
      "li",
    ],
    ["plain text", "<p>words</p>", "p"],
  ])("presses nothing for %s", (_, markup, sel) => {
    install();
    pointer("pointerdown", mount<HTMLElement>(markup, sel));
    expect(anyPressed()).toBeNull();
  });

  it("presses a button inside an open shadow root", () => {
    install();
    const host = mount<HTMLElement>("<div></div>", "div");
    const shadow = host.attachShadow({ mode: "open" });
    const b = document.createElement("button");
    shadow.append(b);
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(true);
  });

  it("still ends a press whose pointerup the page stops", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    b.addEventListener("pointerup", (e) => {
      e.stopPropagation();
    });
    pointer("pointerdown", b);
    vi.advanceTimersByTime(200);
    pointer("pointerup", b);
    expect(pressed(b)).toBe(false);
  });

  it("presses one thing at a time", () => {
    install();
    const [a, b] = [
      ...mount<HTMLElement>("<div><button>A</button><button>B</button></div>", "div").children,
    ];
    (a as HTMLButtonElement).focus();
    key("keydown", a as HTMLElement, " ");
    expect(pressed(a as Element)).toBe(true);
    pointer("pointerdown", b as HTMLElement);
    expect([pressed(a as Element), pressed(b as Element)]).toEqual([false, true]);
  });
});

describe("installPress with keys", () => {
  it("presses on Space until the key comes up", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    b.focus();
    key("keydown", b, " ");
    vi.advanceTimersByTime(400);
    expect(pressed(b)).toBe(true);
    key("keyup", b, " ");
    expect(pressed(b)).toBe(false);
  });

  it("presses on Enter for 150ms", () => {
    fake();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    b.focus();
    key("keydown", b, "Enter");
    expect(pressed(b)).toBe(true);
    vi.advanceTimersByTime(150);
    expect(pressed(b)).toBe(false);
  });

  it("presses a checkbox's label on Space and not on Enter", () => {
    install();
    const label = mount<HTMLLabelElement>('<label><input type="checkbox"> A</label>', "label");
    const box = label.querySelector("input") as HTMLInputElement;
    box.focus();
    key("keydown", box, "Enter");
    expect(pressed(label)).toBe(false);
    key("keydown", box, " ");
    expect(pressed(label)).toBe(true);
  });

  it("presses a link on Enter and not on Space, which scrolls", () => {
    install();
    const a = mount<HTMLAnchorElement>('<a href="#x">x</a>', "a");
    a.focus();
    key("keydown", a, " ");
    expect(pressed(a)).toBe(false);
    key("keydown", a, "Enter");
    expect(pressed(a)).toBe(true);
  });

  it.each([
    ["a repeat", { repeat: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Alt", { altKey: true }],
    ["Meta", { metaKey: true }],
    ["an IME composition", { isComposing: true }],
  ])("ignores %s", (_, init) => {
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    b.focus();
    key("keydown", b, " ", init);
    expect(pressed(b)).toBe(false);
  });

  it("drops a Space press when focus leaves", () => {
    install();
    const b = mount<HTMLButtonElement>("<button>A</button><button>B</button>", "button");
    b.focus();
    key("keydown", b, " ");
    expect(pressed(b)).toBe(true);
    (b.nextElementSibling as HTMLButtonElement).focus();
    expect(pressed(b)).toBe(false);
  });
});

describe("installPress lifecycle", () => {
  it("drops a press when the window loses focus", () => {
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(pressed(b)).toBe(false);
  });

  it("clears every press it set and listens no more once its signal aborts", () => {
    const ac = install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(true);
    ac.abort();
    expect(pressed(b)).toBe(false);
    pointer("pointerup", b);
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(false);
  });

  it("writes nothing from a timer that was pending when its signal aborted", () => {
    fake();
    const ac = install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b, { kind: "touch" });
    ac.abort();
    vi.advanceTimersByTime(300);
    expect(pressed(b)).toBe(false);
  });

  it("leaves a data-cp-pressed the page set itself", () => {
    const ac = install();
    const own = mount<HTMLElement>('<div data-cp-pressed=""></div>', "div");
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    ac.abort();
    expect(pressed(own)).toBe(true);
  });

  it("installs nothing under a signal that has already aborted", () => {
    installPress({ signal: AbortSignal.abort() });
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(false);
  });

  it("keeps a press showing while another call still holds the listeners", () => {
    const first = install();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    first.abort();
    expect(pressed(b)).toBe(true);
  });

  it("stops once the last call's signal aborts", () => {
    const [a, b] = [install(), install()];
    const button = mount<HTMLButtonElement>("<button>Go</button>", "button");
    a.abort();
    b.abort();
    pointer("pointerdown", button);
    expect(pressed(button)).toBe(false);
  });

  it("listens again when called after every earlier signal aborted", () => {
    install().abort();
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    pointer("pointerdown", b);
    expect(pressed(b)).toBe(true);
  });
});

// Real input from the browser, so the events above are the ones it sends.
// Real touches are dispatched through Chromium's debugging protocol only.
describe.skipIf(server.browser !== "chromium")("installPress with real input", () => {
  // CDP takes page coordinates; the test page is a frame inside the runner.
  function pageCentre(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    const f = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 };
  }

  function watch(el: Element): { readonly ever: boolean } {
    const seen = { ever: false };
    new MutationObserver(() => {
      seen.ever ||= pressed(el);
    }).observe(el, { attributes: true, attributeFilter: ["data-cp-pressed"] });
    return seen;
  }

  it("shows a real mouse click's press, then lets go", async () => {
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    const seen = watch(b);
    await userEvent.click(b);
    await vi.waitFor(() => {
      expect(seen.ever).toBe(true);
      expect(pressed(b)).toBe(false);
    });
  });

  it("shows a real quick tap's press as the finger lifts, then lets go", async () => {
    install();
    const b = mount<HTMLButtonElement>("<button>Go</button>", "button");
    const types: string[] = [];
    b.addEventListener("pointerdown", (e) => types.push(e.pointerType));
    // The press shows for 150ms, which the protocol's reply to touchEnd can
    // outlast on a loaded machine, so it is watched as it happens.
    const seen = watch(b);
    const at = pageCentre(b);
    await cdp().send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    await cdp().send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(types).toEqual(["touch"]);
    await vi.waitFor(() => {
      expect(seen.ever).toBe(true);
      expect(pressed(b)).toBe(false);
    });
  });

  it("never shows a real finger's press that sets off a scroll", async () => {
    install();
    const b = mount<HTMLButtonElement>(
      '<button style="margin-block: 40vh 200vh">Go</button>',
      "button",
    );
    const seen = watch(b);
    const at = pageCentre(b);
    const moves = [1, 2, 3, 4, 5, 6].map((i) => ({
      type: "touchMove" as const,
      touchPoints: [{ x: at.x, y: at.y - i * 12 }],
    }));
    await Promise.all([
      cdp().send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] }),
      ...moves.map((m) => cdp().send("Input.dispatchTouchEvent", m)),
      cdp().send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
    ]);
    await new Promise((r) => setTimeout(r, 250));
    expect(seen.ever).toBe(false);
  });
});
