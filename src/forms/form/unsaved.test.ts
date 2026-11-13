import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhancePairs } from "../pairs/pairs.js";
import { enhanceTokens } from "../tokens/tokens.js";
import { guardChanges } from "./form.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

function form(html: string): HTMLFormElement {
  const f = document.createElement("form");
  // A submit would reload the test page.
  f.addEventListener("submit", (e) => {
    e.preventDefault();
  });
  // Static test markup, never caller text.
  f.setHTMLUnsafe(html);
  document.body.append(f);
  return f;
}

const get = <T extends Element>(root: ParentNode, selector: string): T =>
  root.querySelector(selector) as T;

const question = (): HTMLDialogElement | null =>
  document.querySelector<HTMLDialogElement>('dialog[data-variant="confirm"]');

const buttons = (): string[] =>
  [...(question()?.querySelectorAll("button") ?? [])].map((b) => b.textContent);

async function answer(words: string): Promise<void> {
  const b = [...(question()?.querySelectorAll("button") ?? [])].find(
    (x) => x.textContent === words,
  );
  await userEvent.click(b as HTMLButtonElement);
  await expect.poll(question).toBeNull();
}

const FIELDS =
  '<div class="cp-field"><label for="name">Name</label><input id="name" name="name" value="Tracker"></div>' +
  '<textarea name="notes">Kept</textarea>' +
  '<select name="every"><option value="15">15 minutes</option><option value="30">30 minutes</option></select>' +
  '<select name="langs" multiple><option selected>en</option><option>fr</option></select>' +
  '<input type="checkbox" name="notify">' +
  '<fieldset><legend>Quality</legend><label><input type="radio" name="q" value="hd" checked>HD</label><label><input type="radio" name="q" value="uhd">4K</label></fieldset>' +
  '<input type="range" name="vol"><input type="color" name="tint"><input type="hidden" name="ref" value="7">' +
  '<input type="file" name="up"><input name="off" disabled value="x"><button type="button">Press</button>';

describe("guardChanges: what counts", () => {
  it("counts no change in a form as drawn, whatever a reset would clean or pick for itself", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    expect(guard.count).toBe(0);
    expect(guard.changes()).toEqual([]);
  });

  it("counts each changed field once, a radio group once by its checked radio, in page order", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, '[value="uhd"]').checked = true;
    get<HTMLInputElement>(f, "#name").value = "Tracker 4K";
    get<HTMLSelectElement>(f, '[name="every"]').value = "30";
    get<HTMLInputElement>(f, '[name="notify"]').checked = true;
    get<HTMLInputElement>(f, '[name="vol"]').value = "80";
    expect(guard.count).toBe(5);
    expect(guard.changes()).toEqual([
      get(f, "#name"),
      get(f, '[name="every"]'),
      get(f, '[name="notify"]'),
      get(f, '[value="uhd"]'),
      get(f, '[name="vol"]'),
    ]);
  });

  it("counts a text area, a multiple select and a colour as each holds a change of the person's", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLTextAreaElement>(f, "textarea").value = "Kept, and more";
    expect(guard.count).toBe(1);
    get<HTMLOptionElement>(f, '[name="langs"] option:last-child').selected = true;
    expect(guard.count).toBe(2);
    get<HTMLInputElement>(f, '[name="tint"]').value = "#ff0000";
    expect(guard.count).toBe(3);
  });

  it("tells the host each time what waits changes, not on every key into a field already changed", async () => {
    const f = form(FIELDS);
    const told: (readonly Element[])[] = [];
    guardChanges(f, { onChange: (c) => told.push(c), signal: life.signal });
    await userEvent.type(get(f, "#name"), "ab");
    expect(told).toEqual([[get(f, "#name")]]);
    await userEvent.click(get(f, '[name="notify"]'));
    expect(told.at(-1)).toEqual([get(f, "#name"), get(f, '[name="notify"]')]);
    expect(told).toHaveLength(2);
  });

  it("counts a field joined to the form from outside it", () => {
    const f = form("");
    f.id = "joined";
    const out = document.createElement("input");
    out.setAttribute("form", "joined");
    out.value = "";
    document.body.append(out);
    const guard = guardChanges(f, { signal: life.signal });
    out.value = "typed";
    expect(guard.changes()).toEqual([out]);
  });

  it("counts a file field while it holds files, and empties it on saved(), telling its list", () => {
    const f = form('<input type="file" name="up" aria-label="File">');
    const guard = guardChanges(f, { signal: life.signal });
    const up = get<HTMLInputElement>(f, "input");
    const files = new DataTransfer();
    files.items.add(new File(["1"], "subs.en.ass"));
    up.files = files.files;
    expect(guard.changes()).toEqual([up]);
    let told = 0;
    up.addEventListener("change", () => told++);
    guard.saved();
    expect([up.files.length, told, guard.count]).toEqual([0, 1, 0]);
    expect(guard.rebase({ up: "x" })).toBe(0);
  });

  it("throws for a form that already has a guard, and takes a new one once the first ends", () => {
    const f = form(FIELDS);
    const first = new AbortController();
    guardChanges(f, { signal: first.signal });
    expect(() => guardChanges(f)).toThrow(TypeError);
    first.abort();
    expect(() => guardChanges(f, { signal: life.signal })).not.toThrow();
  });
});

describe("guardChanges: saving and discarding", () => {
  it("makes each value its field's default on saved(), so a reset gives it back", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#name").value = "Renamed";
    get<HTMLSelectElement>(f, '[name="every"]').value = "30";
    get<HTMLInputElement>(f, '[value="uhd"]').checked = true;
    guard.saved();
    expect(guard.count).toBe(0);
    get<HTMLInputElement>(f, "#name").value = "Again";
    guard.discard();
    expect(get<HTMLInputElement>(f, "#name").value).toBe("Renamed");
    expect(get<HTMLSelectElement>(f, '[name="every"]').value).toBe("30");
    expect(get<HTMLInputElement>(f, '[value="uhd"]').checked).toBe(true);
    expect(guard.count).toBe(0);
  });

  it("takes the answer's values as defaults on saved(values), a field changed during the save still a change", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    const name = get<HTMLInputElement>(f, "#name");
    const every = get<HTMLSelectElement>(f, '[name="every"]');
    const notes = get<HTMLTextAreaElement>(f, '[name="notes"]');
    const notify = get<HTMLInputElement>(f, '[name="notify"]');
    name.value = "Tracker 4K";
    every.value = "30";
    notify.checked = true;
    // Typed while the save of the three above was busy.
    name.value = "Tracker 4K HDR";
    notes.value = "Kept, and more";
    // The person left the quality at HD; the answer holds 4K.
    guard.saved({ name: "Tracker 4K", every: "30", notes: "Kept", q: "uhd" });
    expect(guard.changes()).toEqual([name, notes, notify, get(f, '[value="hd"]')]);
    expect([name.value, every.value, notes.value]).toEqual([
      "Tracker 4K HDR",
      "30",
      "Kept, and more",
    ]);
    expect(f.querySelector("[data-cp-elsewhere]")).toBeNull();
    guard.discard();
    expect([name.value, every.value, notes.value, notify.checked]).toEqual([
      "Tracker 4K",
      "30",
      "Kept",
      false,
    ]);
    expect(get<HTMLInputElement>(f, '[value="uhd"]').checked).toBe(true);
    expect(guard.count).toBe(0);
  });

  it("throws for a value saved(values) cannot fit, before any field takes a new default", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#name").value = "Renamed";
    expect(() => guard.saved({ name: "Renamed", every: true })).toThrow(
      "saved: every needs a string",
    );
    expect(() => guard.saved([] as never)).toThrow(TypeError);
    expect(guard.changes()).toEqual([get(f, "#name")]);
  });

  it("takes a chips field's saved chips on saved(values), a chip added during the save still a change", async () => {
    const f = form('<div class="cp-tokens"><input aria-label="Tags"></div>');
    const tags = enhanceTokens(get(f, ".cp-tokens"), { name: "tags", signal: life.signal });
    const guard = guardChanges(f, { signal: life.signal });
    await userEvent.type(get(f, ".cp-tokens > input"), "anime{Enter}4k{Enter}");
    guard.saved({ tags: ["anime"] });
    expect(guard.changes()).toEqual([get(f, ".cp-tokens")]);
    guard.discard();
    expect(tags.values).toEqual(["anime"]);
    expect(guard.count).toBe(0);
  });

  it("counts again after a reset button, once the reset has run", async () => {
    const f = form(`${FIELDS}<button type="reset">Discard</button>`);
    const told: (readonly Element[])[] = [];
    const guard = guardChanges(f, { onChange: (c) => told.push(c), signal: life.signal });
    await userEvent.type(get(f, "#name"), "x");
    await userEvent.click(get(f, '[type="reset"]'));
    await expect.poll(() => told.at(-1)).toEqual([]);
    expect([guard.count, get<HTMLInputElement>(f, "#name").value]).toEqual([0, "Tracker"]);
  });

  it("counts a chips field's change, and puts its chips back on a discard", async () => {
    const f = form(
      '<div class="cp-tokens"><span class="cp-token" data-value="anime"><span>anime</span><button></button></span><input aria-label="Tags"></div>',
    );
    const tags = enhanceTokens(get(f, ".cp-tokens"), { name: "tags", signal: life.signal });
    const guard = guardChanges(f, { signal: life.signal });
    await userEvent.type(get(f, ".cp-tokens > input"), "4k{Enter}");
    expect(guard.changes()).toEqual([get(f, ".cp-tokens")]);
    guard.discard();
    expect(tags.values).toEqual(["anime"]);
    expect([...new FormData(f).getAll("tags")]).toEqual(["anime"]);
    expect(guard.count).toBe(0);
  });

  it("counts a removed row of a rows field, and puts it back with its values on a discard", async () => {
    const f = form(
      '<div class="cp-stack" id="maps"><ul class="cp-pairs"><li><input name="from" value="/tv" aria-label="From"><input name="to" value="/media/tv" aria-label="To"><button type="button" data-remove-pair>Remove</button></li></ul><button type="button" data-add-pair>Add</button></div>',
    );
    enhancePairs(get(f, "#maps"), { signal: life.signal });
    const guard = guardChanges(f, { signal: life.signal });
    await userEvent.click(get(f, "[data-remove-pair]"));
    expect(guard.changes()).toEqual([get(f, "#maps")]);
    guard.discard();
    expect([...new FormData(f).entries()]).toEqual([
      ["from", "/tv"],
      ["to", "/media/tv"],
    ]);
    expect(guard.count).toBe(0);
  });
});

describe("guardChanges: rebase", () => {
  const LATEST = {
    name: "Tracker (home)",
    notes: "Kept",
    every: "30",
    langs: ["en", "fr"],
    notify: true,
    q: "uhd",
  };

  it("takes the latest values into every field the person left, as values and defaults", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    expect(guard.rebase(LATEST)).toBe(0);
    expect([...new FormData(f).entries()].filter(([k]) => k !== "up" && k !== "ref")).toEqual([
      ["name", "Tracker (home)"],
      ["notes", "Kept"],
      ["every", "30"],
      ["langs", "en"],
      ["langs", "fr"],
      ["notify", "on"],
      ["q", "uhd"],
      ["vol", "50"],
      ["tint", "#000000"],
    ]);
    f.reset();
    expect(get<HTMLInputElement>(f, "#name").value).toBe("Tracker (home)");
    expect(guard.count).toBe(0);
  });

  it("keeps each change of the person's, counted from the latest values, and notes one made there too", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    const name = get<HTMLInputElement>(f, "#name");
    name.value = "Mine";
    get<HTMLTextAreaElement>(f, "textarea").value = "Mine too";
    expect(guard.rebase(LATEST)).toBe(2);
    expect([name.value, get<HTMLTextAreaElement>(f, "textarea").value]).toEqual([
      "Mine",
      "Mine too",
    ]);
    expect(get<HTMLSelectElement>(f, '[name="every"]').value).toBe("30");
    const note = get<HTMLElement>(f, "[data-cp-elsewhere]");
    expect(note.textContent).toBe("Saved elsewhere as Tracker (home)");
    expect(note.className).toBe("cp-help");
    expect(note.parentElement).toBe(get(f, ".cp-field"));
    expect(name.getAttribute("aria-describedby")).toBe(note.id);
    expect(f.querySelectorAll("[data-cp-elsewhere]")).toHaveLength(1);
    guard.discard();
    expect(name.value).toBe("Tracker (home)");
    expect(f.querySelector("[data-cp-elsewhere]")).toBeNull();
    expect(name.hasAttribute("aria-describedby")).toBe(false);
  });

  it("notes a choice made both here and there by the words the person reads", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, {
      words: { elsewhere: (v) => `Elsewhere: ${String(v)}` },
      signal: life.signal,
    });
    get<HTMLSelectElement>(f, '[name="every"]').value = "30";
    get<HTMLInputElement>(f, '[value="uhd"]').checked = true;
    guard.rebase({ every: "15", q: "hd" });
    expect(f.querySelector("[data-cp-elsewhere]")).toBeNull();
    guard.saved();
    get<HTMLSelectElement>(f, '[name="every"]').value = "15";
    get<HTMLInputElement>(f, '[value="hd"]').checked = true;
    guard.rebase({ every: "", q: "" });
    expect([...f.querySelectorAll("[data-cp-elsewhere]")].map((n) => n.textContent)).toEqual([
      "Elsewhere: ",
      "Elsewhere: ",
    ]);
    guard.rebase({ q: "uhd" });
    expect(get(f, "fieldset [data-cp-elsewhere]").textContent).toBe("Elsewhere: 4K");
    expect(get<HTMLInputElement>(f, '[value="hd"]').checked).toBe(true);
    guard.saved();
    expect(f.querySelector("[data-cp-elsewhere]")).toBeNull();
  });

  it("names no password it was given, and says a value cleared there was cleared", () => {
    const f = form(
      '<div class="cp-setting"><div><label for="key">Key</label></div><input id="key" name="key" type="password" value="old"></div><input name="host" value="sonarr" aria-label="Host">',
    );
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#key").value = "mine";
    get<HTMLInputElement>(f, '[name="host"]').value = "radarr";
    guard.rebase({ key: "theirs", host: "" });
    const notes = [...f.querySelectorAll("[data-cp-elsewhere]")];
    expect(notes.map((n) => n.textContent)).toEqual(["Changed elsewhere", "Cleared elsewhere"]);
    expect(notes[0]?.parentElement).toBe(get(f, ".cp-setting > div"));
  });

  it("keeps a chips field's own change and takes the latest chips into one the person left", async () => {
    const f = form(
      '<div class="cp-tokens" id="a"><input aria-label="A"></div><div class="cp-tokens" id="b"><input aria-label="B"></div>',
    );
    const a = enhanceTokens(get(f, "#a"), { name: "a", signal: life.signal });
    const b = enhanceTokens(get(f, "#b"), { name: "b", signal: life.signal });
    const guard = guardChanges(f, { signal: life.signal });
    await userEvent.type(get(f, "#a input"), "mine{Enter}");
    expect(guard.rebase({ a: ["theirs"], b: ["new"] })).toBe(1);
    expect([a.values, b.values]).toEqual([["mine"], ["new"]]);
    expect(get(f, "[data-cp-elsewhere]").textContent).toBe("Saved elsewhere as theirs");
    guard.discard();
    expect(a.values).toEqual(["theirs"]);
  });

  it("throws for a value that does not fit its field, changing nothing, and leaves names it lacks alone", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    for (const bad of [{ name: "x", every: true }, { q: ["hd"] }, { langs: "en" }, { notify: 1 }]) {
      expect(() => guard.rebase(bad as never)).toThrow(TypeError);
    }
    expect(get<HTMLInputElement>(f, "#name").value).toBe("Tracker");
    expect(() => guard.rebase([] as never)).toThrow(TypeError);
    expect(guard.rebase({ missing: "x" })).toBe(0);
  });
});

describe("guardChanges: the question", () => {
  it("lets the person go without a question while nothing waits", async () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    expect(await guard.leave()).toBe(true);
    expect(question()).toBeNull();
  });

  it("asks in its words, keeps the changes on keep and discards them on the answer", async () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, {
      words: {
        question: "Leave without saving?",
        detail: "Your changes here are not saved.",
        keep: "Stay",
        discard: (n) => `Drop ${String(n)}`,
      },
      signal: life.signal,
    });
    get<HTMLInputElement>(f, "#name").value = "Mine";
    get<HTMLInputElement>(f, '[name="notify"]').checked = true;
    const stay = guard.leave();
    expect(question()?.querySelector("h2")?.textContent).toBe("Leave without saving?");
    expect(question()?.querySelector("p")?.textContent).toBe("Your changes here are not saved.");
    expect(buttons()).toEqual(["Stay", "Drop 2"]);
    expect(document.activeElement?.textContent).toBe("Stay");
    await answer("Stay");
    expect(await stay).toBe(false);
    expect(guard.count).toBe(2);
    const go = guard.leave();
    await answer("Drop 2");
    expect(await go).toBe(true);
    expect(guard.count).toBe(0);
  });

  it("asks its default question, the answer in the danger tone", async () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#name").value = "Mine";
    void guard.leave();
    expect(question()?.querySelector("h2")?.textContent).toBe("Discard your changes?");
    expect(buttons()).toEqual(["Keep editing", "Discard 1 change"]);
    expect(question()?.querySelector('[data-tone="danger"]')?.textContent).toBe("Discard 1 change");
    await answer("Keep editing");
  });
});

describe("guardChanges: leaving the page", () => {
  function route(): { link: HTMLAnchorElement; seen: string[] } {
    const seen: string[] = [];
    const link = document.createElement("a");
    link.href = "/elsewhere?tab=2";
    link.textContent = "Connections";
    document.body.append(link);
    // The page's router: it takes every press, so the test page never leaves.
    document.addEventListener(
      "click",
      (e) => {
        const a = e.target instanceof Element ? e.target.closest("a") : null;
        if (a !== null) {
          e.preventDefault();
          seen.push(a.getAttribute("href") ?? "");
        }
      },
      { signal: life.signal },
    );
    return { link, seen };
  }

  it("stops a press on a link that leaves before the router sees it, and presses it again on the answer", async () => {
    const f = form(FIELDS);
    const { link, seen } = route();
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#name").value = "Mine";
    await userEvent.click(link);
    expect(seen).toEqual([]);
    await answer("Keep editing");
    expect(seen).toEqual([]);
    expect(guard.count).toBe(1);
    await userEvent.click(link);
    await answer("Discard 1 change");
    expect(seen).toEqual(["/elsewhere?tab=2"]);
    expect(guard.count).toBe(0);
  });

  it("asks nothing for a jump on the page, a press with a modifier, or a new tab", async () => {
    const f = form(FIELDS);
    const { link, seen } = route();
    guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#name").value = "Mine";
    link.href = "#part";
    await userEvent.click(link);
    link.href = "/elsewhere";
    link.target = "_blank";
    await userEvent.click(link);
    link.removeAttribute("target");
    link.download = "a.txt";
    await userEvent.click(link);
    expect(question()).toBeNull();
    expect(seen).toEqual(["#part", "/elsewhere", "/elsewhere"]);
  });

  it("asks nothing once its signal ends", async () => {
    const f = form(FIELDS);
    const { link, seen } = route();
    const end = new AbortController();
    guardChanges(f, { signal: end.signal });
    get<HTMLInputElement>(f, "#name").value = "Mine";
    end.abort();
    await userEvent.click(link);
    expect([question(), seen]).toEqual([null, ["/elsewhere?tab=2"]]);
  });

  it("holds the browser's own prompt for a reload only while a change waits", () => {
    const f = form(FIELDS);
    const guard = guardChanges(f, { signal: life.signal });
    const unload = (): boolean => {
      const e = new Event("beforeunload", { cancelable: true });
      dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(unload()).toBe(false);
    get<HTMLInputElement>(f, "#name").value = "Mine";
    guard.update();
    expect(unload()).toBe(true);
    guard.discard();
    expect(unload()).toBe(false);
  });
});

describe("guardChanges: in a dialog", () => {
  function dialog(): { d: HTMLDialogElement; f: HTMLFormElement; close: HTMLButtonElement } {
    const d = document.createElement("dialog");
    d.className = "cp-dialog";
    d.id = "msg";
    d.setAttribute("data-keep-typed", "");
    // A box well inside the window, so a press at its corner is outside it.
    Object.assign(d.style, { inlineSize: "300px", blockSize: "200px", padding: "0" });
    const f = document.createElement("form");
    f.method = "dialog";
    // Static test markup, never caller text.
    f.setHTMLUnsafe(
      '<input id="subject" name="subject" aria-label="Subject"><button type="button" commandfor="msg" command="close">Cancel</button><button type="submit" value="sent">Send</button>',
    );
    d.append(f);
    document.body.append(d);
    return { d, f, close: get(f, "[command]") };
  }
  const closing = (d: HTMLDialogElement): Promise<boolean> =>
    new Promise((r) => {
      d.addEventListener("close", () => r(d.open), { once: true });
    });
  const words = { question: "Discard this message?", discard: "Discard", keep: "Keep writing" };

  it("asks on Escape while a change waits, stays on keep, and closes and discards on the answer", async () => {
    const { d, f } = dialog();
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    await userEvent.type(get(f, "#subject"), "Hello");
    await userEvent.keyboard("{Escape}");
    expect(question()?.querySelector("h2")?.textContent).toBe("Discard this message?");
    expect(buttons()).toEqual(["Keep writing", "Discard"]);
    await answer("Keep writing");
    expect(d.open).toBe(true);
    expect(get<HTMLInputElement>(f, "#subject").value).toBe("Hello");
    await userEvent.keyboard("{Escape}");
    const shut = closing(d);
    await answer("Discard");
    expect(await shut).toBe(false);
    await expect.poll(() => get<HTMLInputElement>(f, "#subject").value).toBe("");
  });

  it("asks on a close command and a close request, and closes at once with nothing typed", async () => {
    const { d, f, close } = dialog();
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    get<HTMLInputElement>(f, "#subject").value = "Hello";
    await userEvent.click(close);
    expect(buttons()).toEqual(["Keep writing", "Discard"]);
    await answer("Keep writing");
    d.requestClose();
    expect(buttons()).toEqual(["Keep writing", "Discard"]);
    await answer("Keep writing");
    expect(d.open).toBe(true);
    get<HTMLInputElement>(f, "#subject").value = "";
    const shut = closing(d);
    await userEvent.click(close);
    expect(await shut).toBe(false);
    expect(question()).toBeNull();
  });

  it("shakes on a press outside instead of asking, and sends without a question", async () => {
    const { d, f } = dialog();
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    await userEvent.type(get(f, "#subject"), "Hello");
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect([d.open, d.hasAttribute("data-cp-refused"), question()]).toEqual([true, true, null]);
    const shut = closing(d);
    await userEvent.click(get(f, '[type="submit"]'));
    expect(await shut).toBe(false);
    expect([question(), d.returnValue]).toEqual([null, "sent"]);
  });

  it("asks nothing about a closed dialog's form when the page's links are pressed", async () => {
    const { f } = dialog();
    const link = document.createElement("a");
    link.href = "/elsewhere";
    link.textContent = "Elsewhere";
    document.body.append(link);
    const seen: string[] = [];
    document.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        seen.push("router");
      },
      { signal: life.signal },
    );
    const guard = guardChanges(f, { signal: life.signal });
    get<HTMLInputElement>(f, "#subject").value = "Sent already";
    expect(guard.count).toBe(1);
    await userEvent.click(link);
    expect([question(), seen]).toEqual([null, ["router"]]);
    expect(await guard.leave()).toBe(true);
  });
});
