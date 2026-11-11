/**
 * feed.ts — the gallery's lists, feeds and times, on the library.
 */

import { anchorTo } from "@cplieger/ui/anchor";
import { announce, installAnnouncer } from "@cplieger/ui/announce";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";
import { enhanceContextPanel } from "@cplieger/ui/context-panel";
import { glideShow } from "@cplieger/ui/disclosure";
import { enhanceFeed } from "@cplieger/ui/feed";
import { type FieldError, reportErrors } from "@cplieger/ui/form";
import { enhanceListDetail } from "@cplieger/ui/list-detail";
import { enhancePanel } from "@cplieger/ui/panel";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";
import { enhanceReorder } from "@cplieger/ui/reorder";
import { enhanceTextarea, utf8Length } from "@cplieger/ui/textarea";

installAnnouncer();

// A card writes its times as seconds before the page loaded, in data-ago,
// so they read the same on every visit.
for (const time of document.querySelectorAll<HTMLTimeElement>("time[data-ago]")) {
  time.dateTime ||= new Date(Date.now() - Number(time.dataset["ago"]) * 1000).toISOString();
  const style = time.dataset["style"];
  enhanceRelativeTime(time, { style: style === "narrow" || style === "short" ? style : "long" });
}

const dot = document.querySelector<HTMLElement>("[data-dot-demo]");
const dotWords = dot?.nextElementSibling;
document.querySelector("[data-dot-next]")?.addEventListener("click", () => {
  if (dot == null || dotWords == null) {
    return;
  }
  const live = !dot.hasAttribute("data-live");
  dot.toggleAttribute("data-live", live);
  dot.dataset["tone"] = live ? "success" : "neutral";
  dotWords.textContent = live ? "Checking now" : "Waiting";
});

function arrived(k: number): HTMLLIElement {
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.dataset["cpIcon"] = "plus";
  glyph.setAttribute("aria-hidden", "true");
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  enhanceRelativeTime(time);
  const facts = document.createElement("small");
  facts.append("Grabbed ", time);
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(`New grab ${String(k)}`, facts);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.tabIndex = -1;
  row.append(glyph, text);
  const item = document.createElement("li");
  item.append(row);
  return item;
}

// Rows that arrive wait behind a line that offers them, so nothing moves
// under the reader (WCAG 3.2.2).
for (const list of document.querySelectorAll<HTMLElement>("[data-hold]")) {
  const words = document.createElement("span");
  const show = document.createElement("button");
  show.className = "cp-button";
  show.dataset["size"] = "sm";
  show.type = "button";
  show.textContent = "Show";
  const line = document.createElement("div");
  line.className = "cp-list-pending";
  line.setAttribute("role", "status");
  line.append(words, show);
  let pending = 0;
  show.addEventListener("click", () => {
    let first: HTMLLIElement | undefined;
    for (let k = pending; k > 0; k--) {
      first = arrived(k);
      list.prepend(first);
    }
    pending = 0;
    line.remove();
    first?.querySelector<HTMLElement>(".cp-list-row")?.focus();
  });
  document.querySelector(`[data-hold-push="${list.id}"]`)?.addEventListener("click", () => {
    pending += 3;
    words.textContent = `${String(pending)} newer rows`;
    if (!line.isConnected) {
      line.hidden = true;
      list.before(line);
      glideShow(line, true);
    }
  });
}

interface Title {
  readonly id: string;
  readonly title: string;
  readonly seen: number;
}

const ROW_H = 48;

function titleRow(id: string): HTMLDivElement {
  const link = document.createElement("a");
  link.className = "cp-truncate";
  link.href = `#${id}`;
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(link);
  const count = document.createElement("span");
  count.dataset["part"] = "end";
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.dataset["id"] = id;
  row.append(text, count);
  return row;
}

// Only the rows in view, and five each side, are in the document, each
// keyed by its id so a live update changes it in place. The focused row
// stays drawn when it scrolls away, so focus never drops to the body.
for (const list of document.querySelectorAll<HTMLElement>(".cp-list[data-virtual]")) {
  const spacer = list.querySelector<HTMLElement>('[data-part="spacer"]');
  const count = document.getElementById(list.dataset["count"] ?? "");
  if (spacer === null || count === null) {
    continue;
  }
  const total = Number(list.dataset["total"]);
  const names = [
    "Frieren",
    "Mushishi",
    "Dungeon",
    "Heron",
    "Monogatari",
    "Ping Pong",
    "Haikyu",
    "Mob Psycho",
    "Odd Taxi",
    "Kaiju",
  ];
  let titles: Title[] = Array.from({ length: total }, (_, i) => ({
    id: `t${String(i)}`,
    title: `${names[i % names.length] ?? ""} ${String(Math.floor(i / names.length) + 1)}`,
    seen: (i * 7) % 26,
  }));
  let view = titles;
  const drawn = new Map<string, HTMLDivElement>();
  const draw = () => {
    spacer.style.blockSize = `${String(view.length * ROW_H)}px`;
    const first = Math.max(0, Math.floor(list.scrollTop / ROW_H) - 5);
    const last = Math.min(view.length, Math.ceil((list.scrollTop + list.clientHeight) / ROW_H) + 5);
    const keep = new Set(view.slice(first, last).map((t) => t.id));
    const focused = document.activeElement?.closest<HTMLElement>(".cp-list-row")?.dataset["id"];
    if (focused !== undefined && drawn.has(focused)) {
      keep.add(focused);
    }
    for (const [id, row] of drawn) {
      if (!keep.has(id)) {
        row.remove();
        drawn.delete(id);
      }
    }
    view.forEach((t, i) => {
      if (!keep.has(t.id)) {
        return;
      }
      let row = drawn.get(t.id);
      if (row === undefined) {
        row = titleRow(t.id);
        drawn.set(t.id, row);
        spacer.append(row);
      }
      row.style.insetBlockStart = `${String(i * ROW_H)}px`;
      const [text, end] = row.children;
      if (text?.firstElementChild != null && end != null) {
        text.firstElementChild.textContent = t.title;
        end.textContent = `${String(t.seen)} of 26 episodes`;
      }
    });
  };
  const counted = () =>
    `${view.length.toLocaleString()} of ${titles.length.toLocaleString()} titles`;
  list.addEventListener("scroll", draw, { passive: true });
  const filter = document.getElementById(list.dataset["filter"] ?? "");
  let say: ReturnType<typeof setTimeout> | undefined;
  filter?.addEventListener("input", () => {
    const q = filter instanceof HTMLInputElement ? filter.value.trim().toLowerCase() : "";
    view = q === "" ? titles : titles.filter((t) => t.title.toLowerCase().includes(q));
    list.scrollTop = 0;
    draw();
    count.textContent = counted();
    clearTimeout(say);
    say = setTimeout(() => {
      announce(counted());
    }, 500);
  });
  document.querySelector(`[data-live-update="${list.id}"]`)?.addEventListener("click", () => {
    titles = titles.map((t) =>
      Math.random() < 0.3 ? { ...t, seen: Math.min(26, t.seen + 1) } : t,
    );
    const shown = new Set(view.map((t) => t.id));
    view = titles.filter((t) => shown.has(t.id));
    draw();
  });
  count.textContent = counted();
  draw();
}

// Stop leaves with its job's end, so focus moves to the job's link first
// rather than drop to the body.
function endJob(job: HTMLElement, words: string, glyph: string, tone: string): void {
  job.dataset["ended"] = "";
  const phase = job.querySelector<HTMLElement>("[data-job-phase]");
  if (phase !== null) {
    const mark = document.createElement("span");
    mark.className = "cp-icon";
    mark.dataset["cpIcon"] = glyph;
    mark.setAttribute("aria-hidden", "true");
    phase.className = "cp-state";
    phase.dataset["tone"] = tone;
    phase.replaceChildren(mark, words);
  }
  const stop = job.querySelector<HTMLElement>("[data-stop]");
  if (stop?.contains(document.activeElement) === true) {
    job.querySelector("a")?.focus();
  }
  stop?.remove();
}

for (const list of document.querySelectorAll<HTMLElement>("[data-jobs]")) {
  const template = list.querySelector("li:has(> .cp-list-row)")?.cloneNode(true);
  setInterval(() => {
    for (const job of list.querySelectorAll<HTMLElement>(".cp-list-row:not([data-ended])")) {
      const bar = job.querySelector("progress");
      const n = job.querySelector("[data-job-n]");
      if (bar === null || n === null) {
        continue;
      }
      bar.value = Math.min(bar.max, bar.value + 1);
      n.textContent = `${String(bar.value)} of ${String(bar.max)}`;
      if (bar.value === bar.max) {
        endJob(job, "Finished", "circle-check", "success");
      }
    }
  }, 700);
  list.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const job = target?.closest("[data-stop]")?.closest<HTMLElement>(".cp-list-row");
    if (job != null) {
      endJob(job, "Stopped by you", "circle-minus", "neutral");
      announce(`${job.querySelector("[data-job-kind]")?.textContent ?? "The job"} stopped`);
    }
    const foot = target?.closest("[data-more-jobs]")?.closest(".cp-list-foot");
    if (foot == null || !(template instanceof HTMLElement)) {
      return;
    }
    const added = Array.from({ length: 3 }, () => template.cloneNode(true) as HTMLElement);
    for (const item of added) {
      const bar = item.querySelector("progress");
      const n = item.querySelector("[data-job-n]");
      if (bar !== null && n !== null) {
        bar.value = 0;
        n.textContent = `0 of ${String(bar.max)}`;
      }
    }
    foot.before(...added);
    added[0]?.querySelector("a")?.focus();
    foot.remove();
  });
}

for (const list of document.querySelectorAll<HTMLOListElement>("ol[data-reorder]")) {
  enhanceReorder(list);
}

// A provider's test passes after a second for any key, and fails for none.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-provider-test]")) {
  const status = document.getElementById(button.dataset["providerTest"] ?? "");
  const key = document.getElementById(button.dataset["key"] ?? "");
  const mark = document.getElementById(`${key?.id ?? ""}-error`);
  const card = button.closest<HTMLElement>("section");
  const name = card?.closest<HTMLElement>("li")?.dataset["name"] ?? "The provider";
  if (status === null || !(key instanceof HTMLInputElement) || mark === null || card === null) {
    continue;
  }
  enhanceConnectionTest(button, status, {
    root: card,
    run: (signal) =>
      new Promise((done, fail) => {
        const timer = setTimeout(() => {
          done(
            key.value.trim() === ""
              ? { ok: false, message: `${name} needs an API key.`, field: "key" }
              : { ok: true, message: `Connected to ${name}` },
          );
        }, 1000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          fail(new DOMException("The check was ended.", "AbortError"));
        });
      }),
    fields: { key: { input: key, mark } },
  });
}

const AGENTS = ["@kiro", "@codex", "@gpt", "@claude"];

function icon(name: string): HTMLSpanElement {
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.dataset["cpIcon"] = name;
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
}

function smallButton(words: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "cp-button";
  button.dataset["size"] = "sm";
  button.type = "button";
  button.textContent = words;
  return button;
}

function inlineLoad(words: string): HTMLSpanElement {
  const square = document.createElement("span");
  square.className = "cp-loader";
  square.setAttribute("aria-hidden", "true");
  square.append(document.createElement("span"));
  const load = document.createElement("span");
  load.className = "cp-inline-load";
  load.append(square, words);
  return load;
}

function people(list: string | undefined): string[] {
  return (list ?? "").split(" ").filter((name) => name !== "");
}

function readers(title: string, names: readonly string[]): HTMLElement {
  const heading = document.createElement("h4");
  heading.textContent = title;
  const section = document.createElement("section");
  section.append(heading);
  if (names.length === 0) {
    const none = document.createElement("p");
    none.className = "cp-meta";
    none.textContent = "No one yet.";
    section.append(none);
    return section;
  }
  const list = document.createElement("ul");
  for (const name of names) {
    const link = document.createElement("a");
    link.href = `#agent-${name === "You" ? "user" : name.slice(1)}`;
    link.textContent = name;
    const item = document.createElement("li");
    item.append(link);
    list.append(item);
  }
  section.append(list);
  return section;
}

let readSeq = 0;

const wait = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 600);
  });

// The names load each time the panel first opens, after 600 ms, and a
// button marked data-read-fails fails once, so its Retry shows.
function readSummary(button: HTMLButtonElement): void {
  const panel = document.createElement("div");
  panel.className = "cp-popover cp-feed-readers";
  panel.dataset["variant"] = "panel";
  panel.popover = "auto";
  panel.id = `msg-readers-${String(++readSeq)}`;
  panel.setAttribute("aria-label", "Who read this message");
  button.setAttribute("popovertarget", panel.id);
  button.after(panel);
  anchorTo(panel, button);
  enhancePanel(panel);
  let fails = button.hasAttribute("data-read-fails");
  let state: "idle" | "loading" | "loaded" = "idle";
  const settle = () => {
    panel.removeAttribute("aria-busy");
    const regain =
      panel.matches(":popover-open") &&
      (panel.contains(document.activeElement) ||
        document.activeElement === button ||
        document.activeElement === document.body);
    if (fails) {
      fails = false;
      state = "idle";
      const retry = smallButton("");
      const words = document.createElement("span");
      words.className = "cp-roll";
      words.textContent = "Retry";
      const spinner = icon("spinner-arc");
      spinner.dataset["part"] = "busy";
      const check = icon("check");
      check.dataset["part"] = "done";
      retry.append(spinner, check, words);
      const again = enhanceConfirm(retry, { busy: "Retrying…", done: false });
      retry.addEventListener("click", () => {
        state = "loading";
        void again.run(wait).then(settle);
      });
      const body = document.createElement("div");
      body.dataset["part"] = "body";
      body.append("The readers could not be loaded.", " ", retry);
      const notice = document.createElement("div");
      notice.className = "cp-notice";
      notice.dataset["tone"] = "danger";
      notice.append(icon("circle-x"), body);
      panel.replaceChildren(notice);
      if (regain) {
        retry.focus();
      }
      return;
    }
    state = "loaded";
    panel.replaceChildren(
      readers("Read", people(button.dataset["read"])),
      readers("Not read yet", people(button.dataset["waiting"])),
    );
    const heading = panel.querySelector("h4");
    if (regain && heading !== null) {
      heading.tabIndex = -1;
      heading.focus();
    }
  };
  panel.addEventListener("toggle", (e) => {
    if (e.newState === "open" && state === "idle") {
      state = "loading";
      panel.setAttribute("aria-busy", "true");
      panel.replaceChildren(inlineLoad("Loading who read it…"));
      void wait().then(settle);
    }
  });
}

function readButton(read: readonly string[], waiting: readonly string[]): HTMLButtonElement {
  const button = smallButton(
    `Read by ${String(read.length)} of ${String(read.length + waiting.length)}`,
  );
  button.dataset["variant"] = "quiet";
  button.dataset["read"] = read.join(" ");
  button.dataset["waiting"] = waiting.join(" ");
  return button;
}

interface Post {
  readonly author: string;
  readonly subject: string;
  readonly body: string;
}

function entry(post: Post, own: boolean): HTMLLIElement {
  const author = document.createElement("a");
  author.href = own ? "#agent-user" : `#agent-${post.author.slice(1)}`;
  author.textContent = own ? "You" : post.author;
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  enhanceRelativeTime(time);
  const header = document.createElement("header");
  header.append(author, time);
  const subject = document.createElement("h3");
  subject.textContent = post.subject;
  const text = document.createElement("p");
  text.className = "cp-feed-text";
  text.textContent = post.body;
  const item = document.createElement("li");
  item.className = "cp-feed-entry";
  item.toggleAttribute("data-own", own);
  item.append(header, subject, text, document.createElement("footer"));
  return item;
}

// A path wraps after a slash, where a reader expects it to.
function pathParts(path: string): (string | HTMLElement)[] {
  return path
    .split(/(?<=\/)/)
    .filter((part) => part !== "")
    .flatMap((part, i) => (i === 0 ? [part] : [document.createElement("wbr"), part]));
}

const msgRoot = document.getElementById("msg");
const msgFeed = document.getElementById("msg-feed");
const compose = document.getElementById("msg-compose");

for (const context of document.querySelectorAll<HTMLElement>(".cp-context")) {
  enhanceContextPanel(context);
}

// Each day separator names the day of the entry after it.
const dayWords = new Intl.DateTimeFormat(document.documentElement.lang, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
for (const time of document.querySelectorAll<HTMLTimeElement>(".cp-feed-day > time[data-day]")) {
  const next = time.parentElement?.nextElementSibling?.querySelector("header > time");
  const day = next instanceof HTMLTimeElement ? new Date(next.dateTime) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  time.dateTime = `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  time.textContent = dayWords.format(day);
}

if (msgRoot !== null && msgFeed instanceof HTMLOListElement && compose instanceof HTMLFormElement) {
  const foot = msgFeed.nextElementSibling;
  const jump = foot?.querySelector(".cp-feed-jump");
  const feed = enhanceFeed(msgFeed, {
    ...(foot instanceof HTMLElement ? { foot } : {}),
    ...(jump instanceof HTMLButtonElement ? { jump } : {}),
  });
  for (const button of msgFeed.querySelectorAll<HTMLButtonElement>("button[data-read]")) {
    readSummary(button);
  }

  // The rows all open this one conversation, under their own title.
  const title = document.getElementById("msg-title");
  const kind = document.getElementById("msg-kind");
  const rows = [...msgRoot.querySelectorAll<HTMLAnchorElement>("a.cp-list-row")];
  const detail = enhanceListDetail(msgRoot, {
    onDismiss: () => {
      history.replaceState(null, "", location.pathname + location.search);
      route(null, false);
    },
  });
  function route(row: HTMLAnchorElement | null, still: boolean): void {
    for (const r of rows) {
      if (r === row) {
        r.setAttribute("aria-current", "page");
      } else {
        r.removeAttribute("aria-current");
      }
    }
    if (row === null) {
      detail.close();
      return;
    }
    // Opening a conversation marks it read.
    row.removeAttribute("data-unread");
    row.querySelector(".cp-badge")?.remove();
    const name = row.querySelector(".cp-cell-stack > .cp-truncate");
    if (title !== null && name !== null) {
      const mono = name.classList.contains("cp-mono");
      title.replaceChildren(...(mono ? pathParts(name.textContent) : [name.textContent]));
      title.classList.toggle("cp-mono", mono);
    }
    if (kind !== null) {
      kind.textContent = row.dataset["kind"] ?? "";
    }
    detail.open({ still });
    feed.toNewest();
  }
  const byHash = () => rows.find((r) => r.hash === location.hash && location.hash !== "");
  // The page loads with the open conversation docked beside the list, but
  // with focus and scroll at the page's start; on a phone it would load
  // into the dialog, so there it waits for a press.
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const first = byHash() ?? rows.find((r) => r.hasAttribute("aria-current"));
  if (first !== undefined && msgRoot.getBoundingClientRect().width >= 52 * rem) {
    const y = scrollY;
    route(first, true);
    title?.blur();
    scrollTo({ top: y, behavior: "instant" });
  } else {
    first?.removeAttribute("aria-current");
  }
  addEventListener("hashchange", () => {
    const row = byHash();
    if (row !== undefined) {
      route(row, false);
    }
  });

  const failNext = document.querySelector<HTMLButtonElement>("[data-msg-fail]");
  failNext?.addEventListener("click", () => {
    failNext.setAttribute("aria-pressed", String(failNext.getAttribute("aria-pressed") !== "true"));
  });

  function sending(item: HTMLLIElement): void {
    item.dataset["state"] = "sending";
    item.setAttribute("aria-busy", "true");
    item.querySelector("footer")?.replaceChildren(inlineLoad("Sending…"));
  }
  function sent(item: HTMLLIElement): void {
    delete item.dataset["state"];
    item.removeAttribute("aria-busy");
    const read = readButton([], AGENTS);
    item.querySelector("footer")?.replaceChildren(read);
    readSummary(read);
  }
  function failed(item: HTMLLIElement): void {
    item.dataset["state"] = "failed";
    item.removeAttribute("aria-busy");
    const words = document.createElement("span");
    words.className = "cp-state";
    words.dataset["tone"] = "danger";
    words.append(icon("circle-x"), "Not sent.");
    const retry = smallButton("Retry");
    retry.dataset["retry"] = "";
    item.querySelector("footer")?.replaceChildren(words, retry);
  }
  // A send takes 900 ms, and fails when "Make the next send fail" is on.
  function deliver(item: HTMLLIElement): Promise<void> {
    sending(item);
    const fail = failNext?.getAttribute("aria-pressed") === "true";
    failNext?.setAttribute("aria-pressed", "false");
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (fail) {
          failed(item);
          reject(new Error("The server did not answer."));
        } else {
          sent(item);
          resolve();
        }
      }, 900);
    });
  }

  const subject = compose.elements.namedItem("subject");
  const body = compose.elements.namedItem("body");
  const count = document.getElementById("msg-body-count");
  const sendButton = document.getElementById("msg-send");
  const summary = compose.querySelector<HTMLElement>(".cp-notice");
  if (
    subject instanceof HTMLInputElement &&
    body instanceof HTMLTextAreaElement &&
    sendButton instanceof HTMLButtonElement &&
    summary !== null
  ) {
    enhanceTextarea(body, {
      max: 65536,
      measure: utf8Length,
      submitOnModEnter: true,
      words: (n, max) => `${n.toLocaleString()} of ${(max ?? 0).toLocaleString()} bytes`,
      ...(count === null ? {} : { count }),
    });
    const send = enhanceConfirm(sendButton, { busy: "Sending…", done: false });
    const report = (errors: readonly FieldError[]) => {
      reportErrors(compose, errors, {
        summary,
        heading: (n) => `${String(n)} fields need a fix before the message sends`,
      });
    };
    // The failed entry whose text the composer still holds: sending that
    // text again retries the entry rather than adding a second one.
    let kept: HTMLLIElement | null = null;
    const holds = (item: HTMLLIElement) =>
      item.querySelector("h3")?.textContent === subject.value &&
      item.querySelector(".cp-feed-text")?.textContent === body.value;
    const clear = () => {
      kept = null;
      subject.value = "";
      body.value = "";
      body.dispatchEvent(new Event("input"));
      report([]);
    };
    let busy = false;
    compose.addEventListener("submit", (e) => {
      e.preventDefault();
      if (busy) {
        return;
      }
      const errors: FieldError[] = [];
      if (subject.value.trim() === "") {
        errors.push({ field: subject, message: "Enter a subject." });
      }
      if (body.value.trim() === "") {
        errors.push({ field: body, message: "Write a message." });
      } else if (utf8Length(body.value) > 65536) {
        errors.push({ field: body, message: "Shorten the message to 64 KiB or less." });
      }
      report(errors);
      if (errors.length > 0) {
        return;
      }
      const item =
        kept?.isConnected === true && holds(kept)
          ? kept
          : entry({ author: "You", subject: subject.value, body: body.value }, true);
      if (item.dataset["state"] === "sending") {
        return;
      }
      if (!item.isConnected) {
        msgFeed.append(item);
      }
      busy = true;
      void send
        .run(() => deliver(item))
        .then(
          () => {
            clear();
            body.focus();
          },
          () => {
            kept = item;
            report([
              { field: body, message: "The server did not answer, so your message is kept." },
            ]);
          },
        )
        .finally(() => {
          busy = false;
        });
    });
    // Retry leaves with the failed state, so focus waits on its entry.
    msgFeed.addEventListener("click", (e) => {
      const retry = e.target instanceof Element ? e.target.closest("[data-retry]") : null;
      const item = retry?.closest<HTMLLIElement>(".cp-feed-entry");
      if (item == null) {
        return;
      }
      item.tabIndex = -1;
      item.focus({ preventScroll: true });
      void deliver(item).then(
        () => {
          if (item === kept && holds(item)) {
            clear();
          }
        },
        () => undefined,
      );
    });
  }

  const arrivals = [
    {
      author: "@codex",
      subject: "Queue",
      body: "The scroll fix merged, so internal/feed is mine now.",
    },
    {
      author: "@gpt",
      subject: "Phone check",
      body: "On a phone the composer stays above the keyboard.",
    },
  ];
  let round = 0;
  document.querySelector("[data-msg-arrive]")?.addEventListener("click", () => {
    round += 1;
    const items = arrivals.map((post) =>
      entry({ ...post, subject: `${post.subject} ${String(round)}` }, false),
    );
    for (const item of items) {
      const read = readButton(["@kiro"], ["You", "@claude"]);
      item.querySelector("footer")?.append(read);
      msgFeed.append(item);
      readSummary(read);
    }
    const open = rows.find((r) => r.hasAttribute("aria-current"));
    const preview = open?.querySelector("small");
    const time = open?.querySelector("time");
    if (preview != null && time != null) {
      preview.textContent = `@gpt: ${arrivals[1]?.body ?? ""}`;
      time.dateTime = new Date().toISOString();
      enhanceRelativeTime(time, { style: "short" });
    }
    // The jump says what arrived while the reader is scrolled up; at the
    // end, the arrivals are said here.
    setTimeout(() => {
      if (feed.unseen === 0) {
        announce("New messages from @codex and @gpt");
      }
    });
  });
}
