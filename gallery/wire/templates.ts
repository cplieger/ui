import { announce } from "@cplieger/ui/announce";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";
import { enhanceTokens } from "@cplieger/ui/tokens";

const WIDTHS = [
  ["Phone", 390],
  ["Tablet", 820],
  ["Desktop", 1280],
] as const;

for (const [n, view] of [
  ...document.querySelectorAll<HTMLElement>("[data-template-frame]"),
].entries()) {
  const frame = view.querySelector("iframe");
  if (frame === null) {
    continue;
  }
  const name = view.dataset["templateFrame"] ?? "";
  frame.style.setProperty("flex", "none");
  frame.style.setProperty("block-size", "35rem");
  frame.style.setProperty("border", "0");
  frame.style.setProperty("transform", "scale(var(--s, 1))");
  frame.style.setProperty("transform-origin", "0 0");
  const group = document.createElement("div");
  group.className = "cp-segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", `${name}: width`);
  let width: number = innerWidth < 600 ? 390 : 1280;
  const fit = (): void => {
    frame.style.setProperty("inline-size", `${String(width)}px`);
    view.style.setProperty("--s", String(Math.min(1, view.clientWidth / width)));
  };
  for (const [label, w] of WIDTHS) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `template-${String(n)}`;
    input.value = String(w);
    input.checked = w === width;
    input.addEventListener("change", () => {
      width = w;
      fit();
    });
    const option = document.createElement("label");
    option.append(input, `${label}, ${String(w)}px`);
    group.append(option);
  }
  view.before(group);
  new ResizeObserver(fit).observe(view);
  fit();
}

const results = document.getElementById("results");
const terms = document.getElementById("search-terms");
const input = terms?.querySelector("input");
const glass = terms?.querySelector(".cp-icon");
const count = document.getElementById("result-count");
const none = document.getElementById("no-results");
if (
  results !== null &&
  terms !== null &&
  input !== null &&
  input !== undefined &&
  glass !== null &&
  glass !== undefined &&
  count !== null &&
  none !== null
) {
  const items = [...results.querySelectorAll<HTMLElement>(":scope > li")];
  const facets = [...document.querySelectorAll<HTMLButtonElement>("[data-facet]")];
  const loader = document.createElement("span");
  loader.className = "cp-loader";
  loader.setAttribute("aria-hidden", "true");
  loader.append(document.createElement("span"));
  let timer = 0;
  const run = (): void => {
    const words = [...chips.values, input.value]
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w !== "");
    const kinds = facets
      .filter((f) => f.getAttribute("aria-pressed") === "true")
      .map((f) => f.dataset["facet"]);
    let shown = 0;
    for (const item of items) {
      unmark(item);
      const text = (item.textContent ?? "").toLowerCase();
      const hit =
        words.every((w) => text.includes(w)) &&
        (kinds.length === 0 || kinds.includes(item.dataset["kind"]));
      item.hidden = !hit;
      if (hit) {
        shown += 1;
        mark(item, words);
      }
    }
    loader.replaceWith(glass);
    results.removeAttribute("aria-busy");
    none.hidden = shown > 0;
    count.textContent = `${String(shown)} result${shown === 1 ? "" : "s"}`;
  };
  const later = (): void => {
    clearTimeout(timer);
    if (glass.isConnected) {
      glass.replaceWith(loader);
    }
    results.setAttribute("aria-busy", "true");
    timer = window.setTimeout(run, 350);
  };
  const chips = enhanceTokens(terms, { onChange: later });
  input.addEventListener("input", later);
  // main.ts flips a chip's aria-pressed on the same click; run reads it later.
  for (const f of facets) {
    f.addEventListener("click", later);
  }
  document.getElementById("clear-search")?.addEventListener("click", () => {
    for (const v of chips.values) {
      chips.remove(v);
    }
    input.value = "";
    for (const f of facets) {
      f.setAttribute("aria-pressed", "false");
    }
    input.focus();
    later();
  });
  run();
}

const setup = document.getElementById("setup");
if (setup !== null) {
  wireSetup(setup);
}

function wireSetup(panel: HTMLElement): void {
  const steps = [...panel.querySelectorAll<HTMLFormElement>("form[data-setup-step]")];
  const marks = [...panel.querySelectorAll<HTMLLIElement>(".cp-steps > li")];
  const names = marks.map((m) => m.firstChild?.textContent ?? "");
  const title = panel.querySelector<HTMLElement>("h1");
  const compact = panel.querySelector(".cp-steps-compact");
  if (title === null || compact === null || steps.length !== marks.length) {
    return;
  }
  let at = 0;
  const hidden = (text: string): HTMLElement => {
    const words = document.createElement("span");
    words.className = "cp-visually-hidden";
    words.textContent = text;
    return words;
  };
  // Focus follows a move, so a screen reader lands on the new step.
  const show = (i: number): void => {
    at = i;
    steps.forEach((s, k) => (s.hidden = k !== i));
    marks.forEach((m, k) => {
      const name = names[k] ?? "";
      m.dataset["state"] = k < i ? "done" : k === i ? "current" : "todo";
      if (k < i) {
        const back = document.createElement("a");
        back.href = "#setup";
        back.textContent = name;
        m.replaceChildren(back, hidden(", done"));
      } else {
        m.replaceChildren(name, ...(k === i ? [hidden(" (current step)")] : []));
      }
      if (k === i) {
        m.setAttribute("aria-current", "step");
      } else {
        m.removeAttribute("aria-current");
      }
    });
    const label = `Step ${String(i + 1)} of ${String(steps.length)}`;
    title.textContent = `${label}: ${steps[i]?.dataset["setupStep"] ?? ""}`;
    compact.textContent = label;
    title.focus();
  };
  panel.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (link === null) {
      return;
    }
    const done = marks.findIndex((m) => m.contains(link));
    if (done !== -1) {
      event.preventDefault();
      show(done);
    } else if (link.closest('[data-part="actions"]') !== null) {
      event.preventDefault();
      show(Math.max(0, at - 1));
    }
  });
  const last = steps.at(-1)?.querySelector<HTMLButtonElement>('button[type="submit"]');
  const finish =
    last === null || last === undefined
      ? null
      : enhanceConfirm(last, { busy: "Starting…", done: "All set" });
  for (const [k, form] of steps.entries()) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (k < steps.length - 1) {
        show(k + 1);
      } else {
        void finish
          ?.run(() => new Promise((done) => setTimeout(done, 900)))
          .then((ran) => {
            if (ran) {
              announce("Setup is done. The first check is running.");
            }
          });
      }
    });
  }
  const test = document.getElementById("su-test");
  const verdict = document.getElementById("su-verdict");
  const url = document.getElementById("su-url");
  const mark = document.getElementById("su-url-error");
  if (
    test instanceof HTMLButtonElement &&
    verdict !== null &&
    url instanceof HTMLInputElement &&
    mark !== null
  ) {
    enhanceConnectionTest(test, verdict, {
      run: (signal) =>
        new Promise((done, fail) => {
          const timer = setTimeout(() => {
            done(
              /^https?:\/\/\S+:\d+/.test(url.value)
                ? { ok: true, message: "Connected, Sonarr 4.0.9" }
                : {
                    ok: false,
                    message: "Sonarr did not answer at this address and port.",
                    field: "url",
                    fix: "Check the address and its port, such as http://sonarr.lan:8989.",
                  },
            );
          }, 1100);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            fail(new DOMException("The check was ended.", "AbortError"));
          });
        }),
      fields: { url: { input: url, mark } },
    });
  }
}

function unmark(node: HTMLElement): void {
  for (const m of node.querySelectorAll("mark")) {
    m.replaceWith(m.textContent);
  }
  node.normalize();
}

function mark(node: HTMLElement, words: readonly string[]): void {
  if (words.length === 0) {
    return;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode() !== null) {
    texts.push(walker.currentNode as Text);
  }
  // Alternation takes the first word that matches, so a longer word goes first.
  const longest = [...words].sort((a, b) => b.length - a.length);
  const re = new RegExp(
    longest.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "gi",
  );
  for (const t of texts) {
    const found = [...t.data.matchAll(re)];
    if (found.length === 0) {
      continue;
    }
    const parts: (string | HTMLElement)[] = [];
    let last = 0;
    for (const m of found) {
      const hit = document.createElement("mark");
      hit.textContent = m[0];
      parts.push(t.data.slice(last, m.index), hit);
      last = m.index + m[0].length;
    }
    parts.push(t.data.slice(last));
    t.replaceWith(...parts);
  }
}
