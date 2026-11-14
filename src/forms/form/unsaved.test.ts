import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhancePairs } from "../pairs/pairs.js";
import { enhanceTokens } from "../tokens/tokens.js";
import { type FreshValues, guardChanges, leavePage } from "./form.js";

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

const title = (): string | undefined => question()?.querySelector("h2")?.textContent;

// Waits for this question to go, not for none to be open: the next guard's
// question may open as it goes.
async function answer(words: string): Promise<void> {
  const q = question();
  const b = [...(q?.querySelectorAll("button") ?? [])].find((x) => x.textContent === words);
  await userEvent.click(b as HTMLButtonElement);
  await expect.poll(() => q?.isConnected).toBe(false);
}

const FIELDS =
  '<div class="cp-field"><label for="name">Name</label><input id="name" name="name" value="Tracker"></div>' +
  '<textarea name="notes">Kept</textarea>' +
  '<select name="every"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select>' +
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

  it("counts a field joined to the form from outside it, telling the host and holding the reload", async () => {
    const f = form("");
    f.id = "joined";
    const out = document.createElement("input");
    out.setAttribute("form", "joined");
    out.setAttribute("aria-label", "Outside");
    const pick = document.createElement("select");
    pick.setAttribute("form", "joined");
    pick.setAttribute("aria-label", "Every");
    pick.setHTMLUnsafe("<option>15</option><option>30</option>");
    document.body.append(out, pick);
    const told: (readonly Element[])[] = [];
    const guard = guardChanges(f, { onChange: (c) => told.push(c), signal: life.signal });
    const unload = (): boolean => {
      const e = new Event("beforeunload", { cancelable: true });
      dispatchEvent(e);
      return e.defaultPrevented;
    };
    await userEvent.type(out, "typed");
    expect(told).toEqual([[out]]);
    expect(unload()).toBe(true);
    await userEvent.selectOptions(pick, "30");
    expect(told.at(-1)).toEqual([out, pick]);
    guard.discard();
    expect([out.value, pick.value, told.at(-1), unload()]).toEqual(["", "15", [], false]);
  });

  it("hears a joined field in a form built before it is mounted", async () => {
    const f = document.createElement("form");
    f.id = "later";
    const told: (readonly Element[])[] = [];
    guardChanges(f, { onChange: (c) => told.push(c), signal: life.signal });
    const out = document.createElement("input");
    out.setAttribute("form", "later");
    out.setAttribute("aria-label", "Outside");
    document.body.append(f, out);
    await userEvent.type(out, "x");
    expect(told).toEqual([[out]]);
  });

  it("hears a joined field in the form's shadow root", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    // Static test markup, never caller text.
    shadow.setHTMLUnsafe(
      '<form id="inside"></form><select form="inside" aria-label="Every"><option>15</option><option>30</option></select>',
    );
    const f = shadow.querySelector("form") as HTMLFormElement;
    const pick = shadow.querySelector("select") as HTMLSelectElement;
    const told: (readonly Element[])[] = [];
    guardChanges(f, { onChange: (c) => told.push(c), signal: life.signal });
    await userEvent.selectOptions(pick, "30");
    expect(told).toEqual([[pick]]);
  });

  it("puts a shadow-root form's chips and rows back on its reset button, counting none after", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    // Static test markup, never caller text.
    shadow.setHTMLUnsafe(
      '<form><div class="cp-tokens"><span class="cp-token" data-value="anime"><span>anime</span><button></button></span><input aria-label="Tags"></div>' +
        '<div class="cp-stack" id="maps"><ul class="cp-pairs"><li><input name="from" value="/tv" aria-label="From"><input name="to" value="/media/tv" aria-label="To"><button type="button" data-remove-pair>Remove</button></li></ul><button type="button" data-add-pair>Add</button></div>' +
        '<button type="reset">Discard</button></form>',
    );
    const f = get<HTMLFormElement>(shadow, "form");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
    });
    const tags = enhanceTokens(get(f, ".cp-tokens"), { name: "tags", signal: life.signal });
    enhancePairs(get(f, "#maps"), { signal: life.signal });
    const told: (readonly Element[])[] = [];
    const guard = guardChanges(f, { onChange: (c) => told.push(c), signal: life.signal });
    await userEvent.type(get(f, ".cp-tokens > input"), "4k{Enter}");
    await userEvent.click(get(f, "[data-remove-pair]"));
    expect(guard.changes()).toEqual([get(f, ".cp-tokens"), get(f, "#maps")]);
    await userEvent.click(get(f, '[type="reset"]'));
    await expect.poll(() => told.at(-1)).toEqual([]);
    const sent = new FormData(f);
    expect([tags.values, sent.getAll("from"), sent.getAll("to"), guard.count]).toEqual([
      ["anime"],
      ["/tv"],
      ["/media/tv"],
      0,
    ]);
  });

  const mounts = [
    ["the document", (): ParentNode => document.body],
    [
      "a shadow root",
      (): ParentNode => {
        const host = document.createElement("div");
        document.body.append(host);
        return host.attachShadow({ mode: "open" });
      },
    ],
  ] as const;

  it.each(mounts)(
    "keeps focus in a chips field when a discard takes the chip that has it, in %s",
    async (_, mount) => {
      const f = document.createElement("form");
      // Static test markup, never caller text.
      f.setHTMLUnsafe(
        '<div class="cp-tokens"><span class="cp-token" data-value="anime"><span>anime</span><button></button></span><input aria-label="Tags"></div>',
      );
      mount().append(f);
      enhanceTokens(get(f, ".cp-tokens"), { name: "tags", signal: life.signal });
      const guard = guardChanges(f, { signal: life.signal });
      const input = get<HTMLInputElement>(f, ".cp-tokens > input");
      await userEvent.type(input, "4k{Enter}{Backspace}");
      const tree = f.getRootNode() as Document | ShadowRoot;
      expect(tree.activeElement?.closest(".cp-token")).toBe(
        [...f.querySelectorAll(".cp-token")].at(-1),
      );
      guard.discard();
      expect(tree.activeElement).toBe(input);
    },
  );

  it.each(mounts)(
    "keeps focus in a rows field when a discard takes the row that has it, in %s",
    async (_, mount) => {
      const f = document.createElement("form");
      // Static test markup, never caller text.
      f.setHTMLUnsafe(
        '<div class="cp-stack" id="maps"><ul class="cp-pairs"><li><input name="from" value="/tv" aria-label="From"><input name="to" value="/media/tv" aria-label="To"><button type="button" data-remove-pair>Remove</button></li></ul><button type="button" data-add-pair>Add</button></div>',
      );
      mount().append(f);
      enhancePairs(get(f, "#maps"), { signal: life.signal });
      const guard = guardChanges(f, { signal: life.signal });
      const add = get<HTMLButtonElement>(f, "[data-add-pair]");
      await userEvent.click(add);
      const tree = f.getRootNode() as Document | ShadowRoot;
      expect(tree.activeElement?.closest("li")).toBe(get(f, "li:last-child"));
      guard.discard();
      expect(tree.activeElement).toBe(add);
    },
  );

  it("stops hearing a joined field once its guard ends", async () => {
    const f = form("");
    f.id = "ended";
    const out = document.createElement("input");
    out.setAttribute("form", "ended");
    out.setAttribute("aria-label", "Outside");
    document.body.append(out);
    const told: (readonly Element[])[] = [];
    const end = new AbortController();
    guardChanges(f, { onChange: (c) => told.push(c), signal: end.signal });
    end.abort();
    await userEvent.type(out, "x");
    expect(told).toEqual([]);
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

  it("puts nothing back when a listener cancels the reset, and keeps the person on the form", async () => {
    const f = form(
      '<input name="name" value="Tracker" aria-label="Name"><div class="cp-tokens"><input aria-label="Tags"></div>',
    );
    const tags = enhanceTokens(get(f, ".cp-tokens"), { name: "tags", signal: life.signal });
    f.addEventListener(
      "reset",
      (e) => {
        e.preventDefault();
      },
      { signal: life.signal },
    );
    const guard = guardChanges(f, { signal: life.signal });
    await userEvent.type(get(f, ".cp-tokens > input"), "4k{Enter}");
    const name = get<HTMLInputElement>(f, '[name="name"]');
    name.value = "Mine";
    guard.discard();
    expect([name.value, tags.values, guard.count]).toEqual(["Mine", ["4k"], 2]);
    const go = guard.leave();
    await answer("Discard 2 changes");
    expect(await go).toBe(false);
    expect([name.value, tags.values, guard.count]).toEqual(["Mine", ["4k"], 2]);
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
    guard.rebase({ every: "60", q: "" });
    expect([...f.querySelectorAll("[data-cp-elsewhere]")].map((n) => n.textContent)).toEqual([
      "Elsewhere: 1 hour",
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

  const FIT =
    '<select name="every" aria-label="Every"><option value="15">15</option><option value="30" selected>30</option></select>' +
    '<select name="langs" multiple aria-label="Languages"><option selected>en</option><option>fr</option></select>' +
    '<label><input type="radio" name="q" value="hd" checked>HD</label><label><input type="radio" name="q" value="uhd">4K</label>' +
    '<input type="checkbox" name="tags" value="anime" checked aria-label="anime"><input type="checkbox" name="tags" value="4k" aria-label="4k">' +
    '<input type="number" name="n" value="5" aria-label="N"><input type="range" name="vol" aria-label="Volume">' +
    '<input name="path" value="/a" aria-label="A"><input name="path" value="/b" aria-label="B">' +
    '<input type="color" name="tint" aria-label="Tint">';

  it.each(["rebase", "saved"] as const)(
    "refuses on %s a value its field would not hold as given, changing nothing",
    (verb) => {
      const f = form(FIT);
      const guard = guardChanges(f, { signal: life.signal });
      const drawn = [...new FormData(f).entries()];
      const cases: [FreshValues, string][] = [
        [{ n: "6", every: "45" }, "every needs the value of one of its options"],
        [{ langs: ["en", "de"] }, "langs needs the values of its options"],
        [{ q: "sd" }, 'q needs the value of one of its radios, or "" for none'],
        [{ tags: ["anime", "8k"] }, "tags needs the values of its boxes"],
        [{ n: "abc" }, "n needs a value a number field holds"],
        [{ vol: "200" }, "vol needs a value a range field holds"],
        [{ vol: "50.5" }, "vol needs a value a range field holds"],
        [{ vol: "" }, "vol needs a value a range field holds"],
        [{ path: ["/a\n/c", "/b"] }, "path needs a value a text field holds"],
        [{ path: ["/a", "/b", "/c"] }, "path needs at most 2 values, one for each field"],
      ];
      for (const [bad, why] of cases) {
        expect(() => guard[verb](bad)).toThrow(`${verb}: ${why}`);
      }
      expect([...new FormData(f).entries()]).toEqual(drawn);
      f.reset();
      expect([...new FormData(f).entries()]).toEqual(drawn);
      expect(guard.count).toBe(0);
    },
  );

  it("takes a value its field spells another way, and no radio for a group given nothing", () => {
    const f = form(FIT);
    const guard = guardChanges(f, { signal: life.signal });
    expect(guard.rebase({ tint: "#FF8800", vol: "80", n: "1e3", q: "" })).toBe(0);
    expect(
      ["tint", "vol", "n"].map((n) => get<HTMLInputElement>(f, `[name="${n}"]`).value),
    ).toEqual(["#ff8800", "80", "1e3"]);
    expect(f.querySelector("[name='q']:checked")).toBeNull();
    expect(guard.rebase({ n: "" })).toBe(0);
    expect(get<HTMLInputElement>(f, '[name="n"]').value).toBe("");
    expect(guard.count).toBe(0);
  });

  it.each(["rebase", "saved"] as const)(
    "refuses on %s more chips than a chips field takes, or one twice, changing nothing",
    (verb) => {
      const f = form(
        '<div class="cp-tokens"><span class="cp-token" data-value="anime"><span>anime</span><button></button></span><input aria-label="Tags"></div>',
      );
      const tags = enhanceTokens(get(f, ".cp-tokens"), {
        name: "tags",
        max: 2,
        signal: life.signal,
      });
      const guard = guardChanges(f, { signal: life.signal });
      expect(() => guard[verb]({ tags: ["anime", "4k", "hdr"] })).toThrow(
        `${verb}: tags needs at most 2 values`,
      );
      expect(() => guard[verb]({ tags: ["anime", "Anime"] })).toThrow(
        `${verb}: tags needs each value once`,
      );
      expect([tags.values, guard.count]).toEqual([["anime"], 0]);
      guard[verb]({ tags: ["anime", "4k"] });
      expect(verb === "rebase" ? tags.values : guard.changes()).toEqual(
        verb === "rebase" ? ["anime", "4k"] : [get(f, ".cp-tokens")],
      );
    },
  );

  it("refuses a rows field's value that its row's field would not hold, changing nothing", () => {
    const f = form(
      '<div class="cp-stack" id="maps"><ul class="cp-pairs"><li><select name="kind" aria-label="Kind"><option>tv</option><option>movies</option></select><input name="to" value="/media/tv" aria-label="To"><button type="button" data-remove-pair>Remove</button></li></ul><button type="button" data-add-pair>Add</button></div>',
    );
    enhancePairs(get(f, "#maps"), { signal: life.signal });
    const guard = guardChanges(f, { signal: life.signal });
    expect(() =>
      guard.rebase({ kind: ["tv", "anime"], to: ["/media/tv", "/media/anime"] }),
    ).toThrow("rebase: kind needs a value its field holds");
    expect([...new FormData(f).entries()]).toEqual([
      ["kind", "tv"],
      ["to", "/media/tv"],
    ]);
    expect(guard.rebase({ kind: ["tv", "movies"], to: ["/media/tv", "/media/films"] })).toBe(0);
    expect([...new FormData(f).entries()]).toEqual([
      ["kind", "tv"],
      ["to", "/media/tv"],
      ["kind", "movies"],
      ["to", "/media/films"],
    ]);
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

  it("lets a link to an address the guard's page keeps reach the router, and asks for one that leaves it", async () => {
    const f = form(FIELDS);
    const { link, seen } = route();
    const guard = guardChanges(f, {
      within: (to) => to.pathname === "/settings" || to.pathname.startsWith("/settings/"),
      signal: life.signal,
    });
    get<HTMLInputElement>(f, "#name").value = "Mine";
    link.href = "/settings/languages";
    await userEvent.click(link);
    link.href = "/settings";
    await userEvent.click(link);
    expect([question(), seen, guard.count]).toEqual([
      null,
      ["/settings/languages", "/settings"],
      1,
    ]);
    link.href = "/settings-archive";
    await userEvent.click(link);
    expect([title(), seen]).toEqual([
      "Discard your changes?",
      ["/settings/languages", "/settings"],
    ]);
    await answer("Keep editing");
    expect(guard.count).toBe(1);
  });

  it("asks each guard in turn and discards none when a later one keeps its changes", async () => {
    const a = form(FIELDS);
    const b = form('<input name="note" aria-label="Note">');
    const { link, seen } = route();
    const ga = guardChanges(a, { words: { question: "Leave the tracker?" }, signal: life.signal });
    const gb = guardChanges(b, { words: { question: "Leave the note?" }, signal: life.signal });
    get<HTMLInputElement>(a, "#name").value = "Mine";
    get<HTMLInputElement>(b, "input").value = "Typed";
    await userEvent.click(link);
    expect(title()).toBe("Leave the tracker?");
    await answer("Discard 1 change");
    expect(title()).toBe("Leave the note?");
    await answer("Keep editing");
    expect([seen, ga.count, gb.count, get<HTMLInputElement>(a, "#name").value]).toEqual([
      [],
      1,
      1,
      "Mine",
    ]);
    await userEvent.click(link);
    await answer("Discard 1 change");
    await answer("Discard 1 change");
    expect([seen, ga.count, gb.count]).toEqual([["/elsewhere?tab=2"], 0, 0]);
  });

  it("asks every guard for a router's Back, and none whose page keeps the address", async () => {
    const a = form(FIELDS);
    const b = form('<input name="note" aria-label="Note">');
    const ga = guardChanges(a, {
      within: (to) => to.pathname.startsWith("/settings/"),
      signal: life.signal,
    });
    const gb = guardChanges(b, { words: { question: "Leave the note?" }, signal: life.signal });
    get<HTMLInputElement>(a, "#name").value = "Mine";
    expect(await leavePage("/settings/languages")).toBe(true);
    expect([question(), ga.count]).toEqual([null, 1]);
    get<HTMLInputElement>(b, "input").value = "Typed";
    const stay = leavePage(new URL("/settings/languages", location.href));
    expect(title()).toBe("Leave the note?");
    await answer("Keep editing");
    expect([await stay, ga.count, gb.count]).toEqual([false, 1, 1]);
    const go = leavePage();
    expect(title()).toBe("Discard your changes?");
    await answer("Discard 1 change");
    expect(title()).toBe("Leave the note?");
    await answer("Discard 1 change");
    expect([await go, ga.count, gb.count]).toEqual([true, 0, 0]);
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
  function dialog(into: ParentNode = document.body): {
    d: HTMLDialogElement;
    f: HTMLFormElement;
    close: HTMLButtonElement;
  } {
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
    into.append(d);
    return { d, f, close: get(f, "[command]") };
  }
  function inShadow(): ReturnType<typeof dialog> {
    const host = document.createElement("div");
    document.body.append(host);
    return dialog(host.attachShadow({ mode: "open" }));
  }
  const asked = (): number => document.querySelectorAll('dialog[data-variant="confirm"]').length;
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

  function twoForms(): ReturnType<typeof dialog> & { g: HTMLFormElement } {
    const parts = dialog();
    const g = document.createElement("form");
    // Static test markup, never caller text.
    g.setHTMLUnsafe('<input id="cc" name="cc" aria-label="Copy to">');
    parts.d.append(g);
    guardChanges(parts.f, { words, signal: life.signal });
    guardChanges(g, { words: { question: "Drop the copy list?" }, signal: life.signal });
    return { ...parts, g };
  }

  it("asks about each guarded form in a dialog, and closes and discards only once every one may go", async () => {
    const { d, f, g } = twoForms();
    const subject = get<HTMLInputElement>(f, "#subject");
    const cc = get<HTMLInputElement>(g, "#cc");
    d.showModal();
    await userEvent.type(subject, "Hello");
    await userEvent.type(cc, "@otto");
    await userEvent.keyboard("{Escape}");
    expect(title()).toBe("Discard this message?");
    await answer("Discard");
    expect(title()).toBe("Drop the copy list?");
    await answer("Keep editing");
    expect([d.open, subject.value, cc.value]).toEqual([true, "Hello", "@otto"]);
    await userEvent.keyboard("{Escape}");
    await answer("Discard");
    const shut = closing(d);
    await answer("Discard 1 change");
    expect(await shut).toBe(false);
    await expect.poll(() => [subject.value, cc.value]).toEqual(["", ""]);
  });

  it("asks only about the guarded form that holds a change, and shakes on a press outside", async () => {
    const { d, f } = twoForms();
    d.showModal();
    await userEvent.type(get(f, "#subject"), "Hello");
    await userEvent.click(document.body, { position: { x: 5, y: 5 } });
    expect([d.open, d.hasAttribute("data-cp-refused"), question()]).toEqual([true, true, null]);
    await userEvent.keyboard("{Escape}");
    expect(title()).toBe("Discard this message?");
    const shut = closing(d);
    await answer("Discard");
    expect(await shut).toBe(false);
  });

  it("discards before the dialog closes, so a close listener set first reads the form discarded", async () => {
    const { d, f, close } = dialog();
    const subject = get<HTMLInputElement>(f, "#subject");
    const read: string[] = [];
    d.addEventListener("close", () => read.push(subject.value));
    guardChanges(f, { words, signal: life.signal });
    for (const press of [() => userEvent.keyboard("{Escape}"), () => userEvent.click(close)]) {
      d.showModal();
      subject.value = "Hello";
      await press();
      const shut = closing(d);
      await answer("Discard");
      expect(await shut).toBe(false);
    }
    expect(read).toEqual(["", ""]);
  });

  it("keeps the dialog open with the changes when a listener cancels the reset", async () => {
    const { d, f } = dialog();
    const reset = new Promise<void>((r) => {
      f.addEventListener("reset", (e) => {
        e.preventDefault();
        r();
      });
    });
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    await userEvent.type(get(f, "#subject"), "Hello");
    await userEvent.keyboard("{Escape}");
    await answer("Discard");
    await reset;
    await new Promise((r) => setTimeout(r, 0));
    expect([
      d.open,
      d.hasAttribute("data-cp-leaving"),
      get<HTMLInputElement>(f, "#subject").value,
    ]).toEqual([true, false, "Hello"]);
  });

  it("asks in a shadow root on Escape, once, stays on keep, and closes and discards on the answer", async () => {
    const { d, f } = inShadow();
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    const subject = get<HTMLInputElement>(f, "#subject");
    await userEvent.type(subject, "Hello");
    await userEvent.keyboard("{Escape}");
    expect([title(), asked(), d.open]).toEqual(["Discard this message?", 1, true]);
    await answer("Keep writing");
    expect([d.open, subject.value]).toEqual([true, "Hello"]);
    await userEvent.keyboard("{Escape}");
    const shut = closing(d);
    await answer("Discard");
    expect([await shut, subject.value]).toEqual([false, ""]);
  });

  it("asks in a shadow root on a close command, once, and closes and discards on the answer", async () => {
    const { d, f, close } = inShadow();
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    const subject = get<HTMLInputElement>(f, "#subject");
    await userEvent.type(subject, "Hello");
    await userEvent.click(close);
    expect([title(), asked(), d.open]).toEqual(["Discard this message?", 1, true]);
    const shut = closing(d);
    await answer("Discard");
    expect([await shut, subject.value]).toEqual([false, ""]);
  });

  it("asks nothing of the dialog around a shadow host for Escape in a dialog inside that host", async () => {
    const { d, f } = dialog();
    guardChanges(f, { words, signal: life.signal });
    d.showModal();
    await userEvent.type(get(f, "#subject"), "Hello");
    const host = document.createElement("div");
    d.append(host);
    const inner = document.createElement("dialog");
    inner.className = "cp-dialog";
    // Static test markup, never caller text.
    inner.setHTMLUnsafe('<button type="button">Done</button>');
    host.attachShadow({ mode: "open" }).append(inner);
    inner.showModal();
    const shut = closing(inner);
    await userEvent.keyboard("{Escape}");
    expect(await shut).toBe(false);
    expect([asked(), d.open, get<HTMLInputElement>(f, "#subject").value]).toEqual([
      0,
      true,
      "Hello",
    ]);
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
