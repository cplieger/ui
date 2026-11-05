import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import fc from "fast-check";

import { createRoot, effect, signal } from "../signal/signal.js";
import { createStepper, type StepperLabels, type StepperStep, type StepState } from "./stepper.js";

const setup: StepperStep[] = [
  { id: "connect", label: "Connect", state: "done", href: "/setup/connect" },
  { id: "paths", label: "Media paths", state: "current", href: "/setup/paths" },
  { id: "languages", label: "Languages", state: "todo", href: "/setup/languages" },
  { id: "providers", label: "Providers", state: "todo", href: null },
  { id: "review", label: "Review", state: "todo", href: null },
];

function host(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

function items(root: HTMLElement): HTMLLIElement[] {
  return [...root.querySelectorAll<HTMLLIElement>("ol.uip-stepper > li")];
}

/** `setup` with step `at` current, the ones before it done and the rest to do. */
function currentAt(at: number): StepperStep[] {
  return setup.map((step, i) => ({
    ...step,
    state: i < at ? "done" : i === at ? "current" : "todo",
  }));
}

interface Drawn {
  readonly id: string | undefined;
  readonly state: string | undefined;
  readonly current: string | null;
  readonly href: string | null;
  readonly label: string | null | undefined;
}

/** What one step should look like on screen. */
function drawn(step: StepperStep): Drawn {
  return {
    id: step.id,
    state: step.state,
    current: step.state === "current" ? "step" : null,
    href: step.state === "current" ? null : step.href,
    label: step.label,
  };
}

/** What each item shows, in the shape `drawn` gives. */
function shown(root: HTMLElement): Drawn[] {
  return items(root).map((li) => {
    const a = li.querySelector("a");
    return {
      id: li.dataset["step"],
      state: li.dataset["state"],
      current: li.getAttribute("aria-current"),
      href: a?.getAttribute("href") ?? null,
      label: (a ?? li).firstChild?.textContent,
    };
  });
}

// The base stylesheet, so the tree is read with .uip-visually-hidden styled.
beforeAll(async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/css/ui-primitives.css";
  await new Promise<void>((resolve, reject) => {
    link.onload = () => {
      resolve();
    };
    link.onerror = () => {
      reject(new Error("could not load /css/ui-primitives.css"));
    };
    document.head.append(link);
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

interface AXNode {
  readonly nodeId: string;
  readonly role?: { readonly value: string };
  readonly name?: { readonly value: string };
  readonly childIds?: readonly string[];
}

/** The accessibility tree of the runner's iframe, which the test runs in. */
async function axNodes(): Promise<AXNode[]> {
  const { frameTree } = (await cdp().send("Page.getFrameTree", {})) as {
    frameTree: { childFrames?: readonly { frame: { id: string } }[] };
  };
  const frameId = frameTree.childFrames?.[0]?.frame.id;
  if (frameId === undefined) {
    throw new Error("no runner iframe");
  }
  const { nodes } = (await cdp().send("Accessibility.getFullAXTree", { frameId })) as {
    nodes: AXNode[];
  };
  return nodes;
}

/** The accessible names of the links in the list, in order. Chromium puts a
 *  space before the hidden span, which it lays out as a block; a screen reader
 *  does not voice a space before a comma, so it is dropped here. */
async function linkNames(): Promise<string[]> {
  return (await axNodes())
    .filter((n) => n.role?.value === "link")
    .map((n) => (n.name?.value ?? "").replace(/\s+,/g, ","));
}

/** The text the accessibility tree exposes for each list item, in order. */
async function accessibleItems(): Promise<string[]> {
  const nodes = await axNodes();
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const text = (n: AXNode): string =>
    n.role?.value === "StaticText"
      ? (n.name?.value ?? "")
      : (n.childIds ?? [])
          .map((id) => byId.get(id))
          .map((c) => (c === undefined ? "" : text(c)))
          .join("");
  return nodes.filter((n) => n.role?.value === "listitem").map(text);
}

describe("stepper markup", () => {
  it("renders one labelled list with one item per step, in order", () => {
    const root = host();
    createStepper(root, setup);
    const lists = root.querySelectorAll("ol");
    expect(lists).toHaveLength(1);
    expect(lists[0]?.getAttribute("aria-label")).toBe("Progress");
    expect(items(root).map((li) => li.dataset["step"])).toEqual(setup.map((s) => s.id));
    expect(items(root).map((li) => li.dataset["state"])).toEqual(setup.map((s) => s.state));
  });

  it("marks only the current item with aria-current=step", () => {
    const root = host();
    createStepper(root, setup);
    expect(items(root).map((li) => li.getAttribute("aria-current"))).toEqual([
      null,
      "step",
      null,
      null,
      null,
    ]);
  });

  it("puts each state word in the accessible text, never colour alone", async () => {
    createStepper(host(), setup);
    expect(await accessibleItems()).toEqual([
      "Connect, done",
      "Media paths, current step",
      "Languages, not started",
      "Providers, not started",
      "Review, not started",
    ]);
    // A user tabbing through links hears the link's own name.
    expect(await linkNames()).toEqual(["Connect, done", "Languages, not started"]);
  });

  it("reads update's steps untracked too", () => {
    const root = host();
    const s = createStepper(root, [{ id: "b", label: "B", state: "current", href: null }]);
    const state = signal<"done" | "todo">("done");
    const steps: StepperStep[] = [
      {
        id: "a",
        label: "A",
        get state() {
          return state.value;
        },
        href: "/a",
      },
      { id: "b", label: "B", state: "current", href: null },
    ];
    let runs = 0;
    const dispose = createRoot((d) => {
      effect(() => {
        runs++;
        s.update(steps);
      });
      return d;
    });
    state.value = "todo";
    expect(runs).toBe(1);
    dispose();
  });

  it("reads labels untracked", () => {
    const root = host();
    const word = signal("done");
    const labels = {
      get done() {
        return word.value;
      },
    };
    let runs = 0;
    const dispose = createRoot((d) => {
      effect(() => {
        runs++;
        createStepper(root, setup, labels);
      });
      return d;
    });
    word.value = "fait";
    expect(runs).toBe(1);
    dispose();
  });

  it("reads host input untracked, so an enclosing effect does not rerun", () => {
    const root = host();
    const state = signal<"done" | "todo">("done");
    const steps: StepperStep[] = [
      {
        id: "a",
        label: "A",
        get state() {
          return state.value;
        },
        href: "/a",
      },
      { id: "b", label: "B", state: "current", href: null },
    ];
    let runs = 0;
    const dispose = createRoot((d) => {
      effect(() => {
        runs++;
        createStepper(root, steps);
      });
      return d;
    });
    state.value = "todo";
    expect(runs).toBe(1);
    dispose();
  });

  it("uses the host's words and list name", async () => {
    const root = host();
    createStepper(root, setup, {
      done: "fait",
      current: "étape en cours",
      todo: "à faire",
      list: "Avancement",
    });
    expect(root.querySelector("ol")?.getAttribute("aria-label")).toBe("Avancement");
    expect((await accessibleItems())[0]).toBe("Connect, fait");
    expect((await accessibleItems())[1]).toBe("Media paths, étape en cours");
  });
});

describe("stepper links", () => {
  it("links done and to-do steps with an href, never the current one, and shows text for a null href", () => {
    const root = host();
    createStepper(root, setup);
    const links = items(root).map((li) => li.querySelector("a")?.getAttribute("href") ?? null);
    expect(links).toEqual(["/setup/connect", null, "/setup/languages", null, null]);
    expect(items(root)[1]?.querySelector("a")).toBeNull();
  });

  it("adds no click handler: a link is the host's to route", () => {
    const root = host();
    createStepper(root, setup);
    const link = items(root)[0]?.querySelector("a");
    let prevented: boolean | null = null;
    document.addEventListener(
      "click",
      (e) => {
        prevented = e.defaultPrevented;
        e.preventDefault();
      },
      { once: true },
    );
    link?.click();
    expect(prevented).toBe(false);
  });
});

describe("stepper heading", () => {
  it("names the current step, its number and the count", () => {
    const s = createStepper(host(), setup);
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
  });

  it("uses labels.heading when supplied", () => {
    const s = createStepper(host(), setup, {
      heading: (n, m, label) => `${label} (${String(n)}/${String(m)})`,
    });
    expect(s.heading()).toBe("Media paths (2/5)");
  });

  it("follows an update", () => {
    const s = createStepper(host(), setup);
    s.update(
      setup.map((step, i) => ({ ...step, state: i < 3 ? "done" : i === 3 ? "current" : "todo" })),
    );
    expect(s.heading()).toBe("Step 4 of 5: Providers");
  });
});

describe("stepper update", () => {
  it("keeps the node of an unchanged item and replaces a changed one", () => {
    const root = host();
    const s = createStepper(root, setup);
    const before = items(root);
    s.update(
      setup.map((step) =>
        step.id === "languages" ? { ...step, label: "Audio and subtitles" } : step,
      ),
    );
    const after = items(root);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).not.toBe(before[2]);
    expect(after[2]?.textContent).toContain("Audio and subtitles");
    expect(after[3]).toBe(before[3]);
  });

  it("adds, removes and reorders items", () => {
    const root = host();
    const s = createStepper(root, setup);
    const review = items(root)[4];
    const next: StepperStep[] = [
      setup[4] as StepperStep,
      { id: "alerts", label: "Alerts", state: "todo", href: null },
      { ...(setup[1] as StepperStep) },
    ];
    s.update(next);
    expect(items(root).map((li) => li.dataset["step"])).toEqual(["review", "alerts", "paths"]);
    expect(items(root)[0]).toBe(review);
  });

  it("keeps focus on a link across any update that keeps its item's fields", () => {
    const stateArb = fc.constantFrom<StepState>("done", "todo");
    const stepArb = (id: string): fc.Arbitrary<StepperStep> =>
      fc.record({
        id: fc.constant(id),
        label: fc.constantFrom("A", "B", "C"),
        state: stateArb,
        href: fc.option(fc.constant(`/${id}`), { nil: null }),
      });
    const listArb = fc
      .uniqueArray(fc.constantFrom("s1", "s2", "s3", "s4", "s5", "s6"), {
        minLength: 2,
        maxLength: 6,
      })
      .chain((ids) => fc.tuple(...ids.map(stepArb)));
    fc.assert(
      fc.property(listArb, listArb, fc.nat(), fc.nat(), (before, after, f, c) => {
        document.body.replaceChildren();
        // The focused step is a linked done step present in both lists, with the same fields.
        const focused: StepperStep = { id: "focus", label: "Focus", state: "done", href: "/focus" };
        const withCurrent = (list: StepperStep[], at: number): StepperStep[] => {
          const out = [...list];
          out.splice(at % (out.length + 1), 0, {
            id: "here",
            label: "Here",
            state: "current",
            href: null,
          });
          return out;
        };
        const place = (list: StepperStep[], at: number): StepperStep[] => {
          const out = [...list];
          out.splice(at % (out.length + 1), 0, focused);
          return out;
        };
        const root = host();
        const s = createStepper(root, withCurrent(place(before, f), c));
        const link = root.querySelector<HTMLAnchorElement>('li[data-step="focus"] a');
        link?.focus();
        expect(document.activeElement).toBe(link);
        const next = withCurrent(place(after, c), f);
        s.update(next);
        expect(items(root).map((li) => li.dataset["step"])).toEqual(next.map((x) => x.id));
        expect(root.querySelector('li[data-step="focus"] a')).toBe(link);
        expect(document.activeElement).toBe(link);
      }),
    );
  });
});

describe("stepper update of a changed item", () => {
  it("moves current to another step: aria-current, data-state and links follow", () => {
    const root = host();
    const s = createStepper(root, setup);
    s.update(
      setup.map((step, i) => ({ ...step, state: i < 2 ? "done" : i === 2 ? "current" : "todo" })),
    );
    expect(items(root).map((li) => li.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "step",
      null,
      null,
    ]);
    expect(items(root).map((li) => li.dataset["state"])).toEqual([
      "done",
      "done",
      "current",
      "todo",
      "todo",
    ]);
    expect(items(root).map((li) => li.querySelector("a")?.getAttribute("href") ?? null)).toEqual([
      "/setup/connect",
      "/setup/paths",
      null,
      null,
      null,
    ]);
  });

  it("follows a changed href", () => {
    const root = host();
    const s = createStepper(root, setup);
    s.update(
      setup.map((step) =>
        step.id === "connect" ? { ...step, href: "/setup/connect?again" } : step,
      ),
    );
    expect(items(root)[0]?.querySelector("a")?.getAttribute("href")).toBe("/setup/connect?again");
    s.update(setup.map((step) => (step.id === "connect" ? { ...step, href: null } : step)));
    expect(items(root)[0]?.querySelector("a")).toBeNull();
  });

  it("puts each state word in one visually hidden span", () => {
    const root = host();
    createStepper(root, setup);
    expect(
      items(root).map((li) =>
        [...li.querySelectorAll(".uip-visually-hidden")].map((e) => e.textContent),
      ),
    ).toEqual([
      [", done"],
      [", current step"],
      [", not started"],
      [", not started"],
      [", not started"],
    ]);
  });
});

describe("stepper re-entry", () => {
  it("renders the newest list when a focusout handler updates mid-render", () => {
    const root = host();
    const s = createStepper(root, setup);
    const link = items(root)[0]?.querySelector("a");
    link?.focus();
    const inner = setup.map((step) =>
      step.id === "languages" ? { ...step, label: "Audio" } : step,
    );
    link?.addEventListener(
      "focusout",
      () => {
        s.update(inner);
      },
      { once: true },
    );
    s.update(setup.map((step) => (step.id === "connect" ? { ...step, label: "Start" } : step)));
    expect(items(root).map((li) => li.dataset["step"])).toEqual(setup.map((x) => x.id));
    expect(items(root)[2]?.textContent).toContain("Audio");
    expect(items(root)[0]?.textContent).toContain("Connect");
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
  });

  it("draws the newest of two updates one focusout handler makes", () => {
    const root = host();
    const s = createStepper(root, setup);
    items(root)[0]?.querySelector("a")?.focus();
    const third = currentAt(3);
    const first = setup.map((step, i) => ({
      ...step,
      state: i === 0 ? "current" : "todo",
      label: step.id === "review" ? "Check" : step.label,
    })) satisfies StepperStep[];
    items(root)[0]
      ?.querySelector("a")
      ?.addEventListener(
        "focusout",
        () => {
          s.update(third);
          s.update(first);
        },
        { once: true },
      );
    s.update(setup.map((step) => (step.id === "connect" ? { ...step, label: "Start" } : step)));
    expect(shown(root)).toEqual(first.map(drawn));
    expect(s.heading()).toBe("Step 1 of 5: Connect");
  });

  it("draws a list a focusout during a restarted render asks for", () => {
    const root = host();
    const s = createStepper(root, setup);
    items(root)[0]?.querySelector("a")?.focus();
    const inner = currentAt(2);
    const last = currentAt(3).map((step) =>
      step.id === "providers" ? { ...step, label: "Sources" } : step,
    );
    let second = 0;
    items(root)[0]
      ?.querySelector("a")
      ?.addEventListener(
        "focusout",
        () => {
          const languages = items(root)[2]?.querySelector("a");
          languages?.focus();
          languages?.addEventListener(
            "focusout",
            () => {
              second++;
              s.update(last);
            },
            { once: true },
          );
          // Languages turns current, so this render removes the link just focused.
          s.update(inner);
        },
        { once: true },
      );
    s.update(setup.map((step) => (step.id === "connect" ? { ...step, label: "Start" } : step)));
    expect(second).toBe(1);
    expect(shown(root)).toEqual(last.map(drawn));
    expect(s.heading()).toBe("Step 4 of 5: Sources");
  });

  it("diffs a restarted render against what is on screen, not the pass it cut off", () => {
    const root = host();
    const s = createStepper(root, setup);
    const link = items(root)[0]?.querySelector("a");
    link?.focus();
    const newest = setup.map((step) =>
      step.id === "languages" ? { ...step, label: "Audio2" } : step,
    );
    link?.addEventListener(
      "focusout",
      () => {
        s.update(newest);
      },
      { once: true },
    );
    // The cut-off pass builds a Languages node of its own and never places it.
    s.update(
      setup.map((step) =>
        step.id === "connect"
          ? { ...step, label: "Start" }
          : step.id === "languages"
            ? { ...step, label: "Audio" }
            : step,
      ),
    );
    expect(shown(root)).toEqual(newest.map(drawn));
  });

  it("draws the list when a focusout handler moves the item being removed", () => {
    const root = host();
    const s = createStepper(root, setup);
    const old = items(root)[0];
    old?.querySelector("a")?.focus();
    old?.querySelector("a")?.addEventListener(
      "focusout",
      () => {
        if (old !== undefined) {
          document.body.append(old);
        }
      },
      { once: true },
    );
    const next = setup.map((step) => (step.id === "connect" ? { ...step, label: "Start" } : step));
    expect(() => {
      s.update(next);
    }).not.toThrow();
    expect(shown(root)).toEqual(next.map(drawn));
    expect(old?.isConnected).toBe(false);
  });

  it("puts back a focused item a host moved out of the list", () => {
    const root = host();
    const s = createStepper(root, setup);
    const item = items(root)[0];
    const link = item?.querySelector("a");
    if (item === undefined || link === null || link === undefined) {
      throw new Error("no link");
    }
    document.body.append(item);
    link.focus();
    s.update(setup);
    expect(items(root)[0]).toBe(item);
    expect(shown(root)).toEqual(setup.map(drawn));
  });

  it("puts back a focused item though putting it back makes a handler move it again", () => {
    const root = host();
    const s = createStepper(root, setup);
    const item = items(root)[0];
    const link = item?.querySelector("a");
    if (item === undefined || link === null || link === undefined) {
      throw new Error("no link");
    }
    const aside = document.createElement("div");
    document.body.append(aside);
    aside.append(item);
    link.focus();
    link.addEventListener(
      "focusout",
      () => {
        document.body.append(item);
      },
      { once: true },
    );
    const next = setup.map((step) => (step.id === "review" ? { ...step, label: "Check" } : step));
    expect(() => {
      s.update(next);
    }).not.toThrow();
    expect(shown(root)).toEqual(next.map(drawn));
    expect(items(root)[0]).toBe(item);
  });

  it("puts back a focused item though a handler moves the item it is placed before", () => {
    const root = host();
    const s = createStepper(root, setup);
    const item = items(root)[0];
    const link = item?.querySelector("a");
    if (item === undefined || link === null || link === undefined) {
      throw new Error("no link");
    }
    const aside = document.createElement("div");
    document.body.append(aside);
    aside.append(item);
    link.focus();
    link.addEventListener(
      "focusout",
      () => {
        const reference = items(root)[0];
        if (reference !== undefined) {
          document.body.append(reference);
        }
      },
      { once: true },
    );
    expect(() => {
      s.update(setup);
    }).not.toThrow();
    expect(shown(root)).toEqual(setup.map(drawn));
    expect(items(root)[0]).toBe(item);
  });

  it("settles when every focusout moves focus to another link and updates it", () => {
    const root = host();
    const linked = setup.map((step) => ({ ...step, href: `/setup/${step.id}` }));
    const s = createStepper(root, linked);
    let latest: StepperStep[] = linked;
    let calls = 0;
    const hop = (link: HTMLAnchorElement): void => {
      link.addEventListener(
        "focusout",
        () => {
          calls++;
          const other = [...root.querySelectorAll<HTMLAnchorElement>("li a")].find(
            (a) => a !== link && a.isConnected,
          );
          if (other === undefined) {
            return;
          }
          other.focus();
          hop(other);
          const id = other.closest("li")?.dataset["step"];
          latest = latest.map((step) =>
            step.id === id ? { ...step, href: `${step.href ?? ""}?${String(calls)}` } : step,
          );
          s.update(latest);
        },
        { once: true },
      );
    };
    const start = items(root)[0]?.querySelector("a");
    if (start === null || start === undefined) {
      throw new Error("no link");
    }
    start.focus();
    hop(start);
    latest = latest.map((step) => (step.id === "connect" ? { ...step, href: "/again" } : step));
    s.update(latest);
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(linked.length);
    expect(shown(root)).toEqual(latest.map(drawn));
  });

  it("calls labels.heading untracked", () => {
    const word = signal("Step");
    const s = createStepper(host(), setup, {
      heading: (n, m, label) => `${word.value} ${String(n)}/${String(m)} ${label}`,
    });
    let runs = 0;
    const dispose = createRoot((d) => {
      effect(() => {
        runs++;
        s.heading();
      });
      return d;
    });
    word.value = "Étape";
    expect(runs).toBe(1);
    dispose();
  });
});

describe("stepper in a shadow root", () => {
  it("keeps focus on a link it moves around", () => {
    const shadow = host().attachShadow({ mode: "open" });
    const root = document.createElement("div");
    shadow.append(root);
    const a: StepperStep = { id: "a", label: "A", state: "current", href: null };
    const f: StepperStep = { id: "f", label: "F", state: "done", href: "/f" };
    const s = createStepper(root, [a, f]);
    const link = root.querySelector<HTMLAnchorElement>('li[data-step="f"] a');
    link?.focus();
    expect(shadow.activeElement).toBe(link);
    s.update([f, a]);
    expect(items(root).map((li) => li.dataset["step"])).toEqual(["f", "a"]);
    expect(shadow.activeElement).toBe(link);
  });
});

describe("stepper contract", () => {
  const cases: [string, StepperStep[], string][] = [
    ["no step", [], "no step"],
    ["no current step", setup.map((s) => ({ ...s, state: "done" })), "no current step"],
    [
      "two current steps",
      setup.map((s) => ({ ...s, state: "current" })),
      "more than one current step",
    ],
    [
      "a duplicate id",
      [...setup, { ...(setup[0] as StepperStep), state: "todo" }],
      "duplicate step id",
    ],
    ["an empty label", setup.map((s, i) => (i === 0 ? { ...s, label: " " } : s)), "empty label"],
  ];

  it("reads labels.heading once", () => {
    let reads = 0;
    const labels = {
      get heading(): (n: number, m: number, label: string) => string {
        reads++;
        return reads === 1 ? (n, m, label) => `${String(n)}/${String(m)} ${label}` : ("x" as never);
      },
    };
    const s = createStepper(host(), setup, labels);
    expect(s.heading()).toBe("2/5 Media paths");
    expect(reads).toBe(1);
  });

  it("treats null labels as unset", () => {
    const root = host();
    const labels = { heading: null, done: null } as unknown as StepperLabels;
    const s = createStepper(root, setup, labels);
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
    expect(items(root)[0]?.querySelector(".uip-visually-hidden")?.textContent).toBe(", done");
  });

  it("createStepper refuses labels of the wrong type and adds nothing", () => {
    const root = host();
    let read = 0;
    const odd = {
      toString(): string {
        read++;
        return "odd";
      },
    } as unknown as string;
    for (const [labels, message] of [
      [{ done: odd }, "labels.done"],
      [{ current: odd }, "labels.current"],
      [{ todo: odd }, "labels.todo"],
      [{ list: odd }, "labels.list"],
      [{ heading: "Step" as unknown as () => string }, "labels.heading"],
    ] as const) {
      expect(() => createStepper(root, setup, labels)).toThrow(TypeError);
      expect(() => createStepper(root, setup, labels)).toThrow(message);
    }
    expect(read).toBe(0);
    expect(root.childNodes).toHaveLength(0);
  });

  it.each(cases)("createStepper refuses %s and adds nothing", (_name, steps, message) => {
    const root = host();
    expect(() => createStepper(root, steps)).toThrow(new RegExp(message));
    expect(() => createStepper(root, steps)).toThrow(TypeError);
    expect(root.childNodes).toHaveLength(0);
  });

  it.each(cases)("update refuses %s and leaves the previous list", (_name, steps, message) => {
    const root = host();
    const s = createStepper(root, setup);
    const before = items(root);
    expect(() => {
      s.update(steps);
    }).toThrow(new RegExp(message));
    expect(items(root)).toEqual(before);
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
  });

  it("update refuses a field of the wrong type before running its toString", () => {
    const root = host();
    const s = createStepper(root, setup);
    const before = items(root);
    let read = 0;
    const odd = {
      toString(): string {
        read++;
        return "/odd";
      },
    } as unknown as string;
    const lists: [string, StepperStep[]][] = [
      ['href of step "connect"', setup.map((x, i) => (i === 0 ? { ...x, href: odd } : x))],
      ['label of step "connect"', setup.map((x, i) => (i === 0 ? { ...x, label: odd } : x))],
      ["step id", setup.map((x, i) => (i === 0 ? { ...x, id: odd } : x))],
      [
        "no valid state",
        setup.map((x, i) => (i === 0 ? { ...x, state: "skipped" as StepState } : x)),
      ],
    ];
    for (const [message, steps] of lists) {
      expect(() => {
        s.update(steps);
      }).toThrow(TypeError);
      expect(() => {
        s.update(steps);
      }).toThrow(message);
    }
    expect(read).toBe(0);
    expect(items(root)).toEqual(before);
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
  });
});

describe("stepper lifecycle", () => {
  it("dispose removes the list, and update after it does nothing", () => {
    const root = host();
    const s = createStepper(root, setup);
    s.dispose();
    s.dispose();
    expect(root.childNodes).toHaveLength(0);
    s.update(setup.map((step) => ({ ...step, label: `${step.label}!` })));
    expect(root.childNodes).toHaveLength(0);
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
  });

  it("dispose detaches the list though a focusout handler moves it", () => {
    const root = host();
    const s = createStepper(root, setup);
    const list = root.querySelector("ol");
    const aside = document.createElement("div");
    document.body.append(aside);
    items(root)[0]?.querySelector("a")?.focus();
    items(root)[0]
      ?.querySelector("a")
      ?.addEventListener(
        "focusout",
        () => {
          if (list !== null) {
            aside.append(list);
          }
        },
        { once: true },
      );
    s.dispose();
    expect(root.childNodes).toHaveLength(0);
    expect(list?.isConnected).toBe(false);
  });

  it("a dispose from a focusout handler mid-update removes the list", () => {
    const root = host();
    const s = createStepper(root, setup);
    const link = items(root)[0]?.querySelector("a");
    link?.focus();
    link?.addEventListener(
      "focusout",
      () => {
        s.dispose();
      },
      { once: true },
    );
    s.update(setup.map((step) => (step.id === "connect" ? { ...step, label: "Start" } : step)));
    expect(root.childNodes).toHaveLength(0);
    expect(s.heading()).toBe("Step 2 of 5: Media paths");
  });

  it("ends with the owner current when it was made", () => {
    const root = host();
    let s: ReturnType<typeof createStepper> | undefined;
    const dispose = createRoot((d) => {
      s = createStepper(root, setup);
      return d;
    });
    expect(root.querySelector("ol")).not.toBeNull();
    dispose();
    expect(root.childNodes).toHaveLength(0);
    s?.update(setup);
    expect(root.childNodes).toHaveLength(0);
  });

  it("sets no style attribute anywhere it writes", () => {
    const root = host();
    const s = createStepper(root, setup);
    s.update(setup.map((step, i) => ({ ...step, state: i === 0 ? "current" : "todo" })));
    expect(root.querySelectorAll("[style]")).toHaveLength(0);
  });
});
