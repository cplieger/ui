import { announce } from "@cplieger/ui/announce";
import { enhanceKeyedList } from "@cplieger/ui/keyed-list";
import { enhanceListDetail } from "@cplieger/ui/list-detail";
import { enhanceLoadMore } from "@cplieger/ui/load-more";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";
import { enhanceRovingFocus } from "@cplieger/ui/roving-focus";

import { markDay, messageFeed } from "./feed.js";

interface Conversation {
  readonly id: string;
  readonly kind: "Thread" | "Direct";
  readonly title: string;
  readonly preview: string;
  readonly ago: number;
  readonly people: number;
}

const OLDER: readonly (readonly Conversation[])[] = [
  [
    {
      id: "c-ci",
      kind: "Thread",
      title: "/workspace/ci/.github/workflows",
      preview: "@codex: The sync job runs on every repo again.",
      ago: 260_000,
      people: 3,
    },
    {
      id: "c-codex-claude",
      kind: "Direct",
      title: "@codex and @claude",
      preview: "@claude: I will review it in the morning.",
      ago: 300_000,
      people: 2,
    },
    {
      id: "c-monitoring",
      kind: "Thread",
      title: "/workspace/monitoring/alerts/rules",
      preview: "You: The alert rules ship with the app now.",
      ago: 340_000,
      people: 4,
    },
  ],
  [
    {
      id: "c-subflux",
      kind: "Thread",
      title: "/workspace/subflux/internal/server/static-src",
      preview: "@gpt: The settings page moves onto the library's template.",
      ago: 420_000,
      people: 3,
    },
    {
      id: "c-gpt-user",
      kind: "Direct",
      title: "@gpt and You",
      preview: "@gpt: Thanks for the review.",
      ago: 500_000,
      people: 2,
    },
  ],
];

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// A path wraps after a slash, where a reader expects it to.
function pathParts(path: string): (string | HTMLElement)[] {
  return path
    .split(/(?<=\/)/)
    .filter((part) => part !== "")
    .flatMap((part, i) => (i === 0 ? [part] : [document.createElement("wbr"), part]));
}

const root = document.getElementById("msg");
const list = document.getElementById("msg-list");
const filters = document.getElementById("msg-filters");

if (root !== null && list instanceof HTMLUListElement && filters !== null) {
  const linkOf = (item: Element | undefined) =>
    item?.querySelector<HTMLAnchorElement>(":scope > a.cp-list-row") ?? null;
  const items = new Map<string, HTMLLIElement>();
  for (const item of list.querySelectorAll<HTMLLIElement>(":scope > li:has(> a.cp-list-row)")) {
    const link = linkOf(item);
    if (link !== null) {
      items.set(link.hash.slice(1), item);
    }
  }
  /** Newest activity first, every conversation the page has loaded. */
  let order = [...items.keys()];
  const template = items.values().next().value;
  let show = "all";
  const shown = () =>
    order.filter(
      (id) => show === "all" || items.get(id)?.querySelector("a")?.dataset["kind"] === show,
    );
  const keyed = enhanceKeyedList(list, {
    keys: shown(),
    row: (id) => {
      const item = items.get(id);
      if (item === undefined) {
        throw new TypeError(`no conversation ${id}`);
      }
      return item;
    },
    window: false,
  });
  enhanceRovingFocus(list, { items: "a.cp-list-row", orientation: "vertical", wrap: false });

  const links = () => [...items.values()].flatMap((item) => linkOf(item) ?? []);
  const current = () => links().find((link) => link.hasAttribute("aria-current"));

  interface View {
    readonly title: string;
    readonly kind: string;
  }
  /** A conversation the page knows: a loaded row, or one a later page holds, as grelot fetches it by id. */
  const named = (id: string): View | undefined => {
    const row = linkOf(items.get(id));
    if (row !== null) {
      const name = row.querySelector(".cp-cell-stack > .cp-truncate")?.textContent ?? "";
      return { title: name, kind: row.dataset["kind"] ?? "" };
    }
    return OLDER.flat().find((c) => c.id === id);
  };

  const title = document.getElementById("msg-title");
  const kind = document.getElementById("msg-kind");
  const compose = document.getElementById("msg-compose");
  const readOnly = document.getElementById("msg-read-only");
  // The person posts only as You, so a direct conversation between two
  // others takes no reply: the foot names who writes there instead.
  function replyFor(view: View): void {
    if (compose === null || readOnly === null) {
      return;
    }
    const people = view.kind === "Direct" ? view.title.split(" and ") : [];
    const closed = people.length === 2 && !people.includes("You");
    compose.hidden = closed;
    readOnly.hidden = !closed;
    const [words, actions] = readOnly.children;
    if (!closed || words === undefined || actions === undefined) {
      return;
    }
    words.textContent = `Only ${view.title} write here.`;
    actions.replaceChildren(
      ...people.map((name) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cp-button";
        b.textContent = `Message ${name}`;
        return b;
      }),
    );
  }
  function render(view: View): void {
    if (title !== null) {
      const mono = view.title.startsWith("/");
      title.replaceChildren(...(mono ? pathParts(view.title) : [view.title]));
      title.classList.toggle("cp-mono", mono);
    }
    if (kind !== null) {
      kind.textContent = view.kind;
    }
    replyFor(view);
  }

  // The address is the state: its fragment names the open conversation, and
  // each entry's DEPTH counts the entries since the one the page loaded on.
  // sync() renders the address; Close is one traversal back by DEPTH to the
  // entry the page loaded on, rewritten to the list's address. CLOSING
  // carries that rewrite across a traversal that loads the page again.
  const DEPTH = "cp-gallery-depth";
  const CLOSING = "cp-gallery-closing";
  const depthOf = (state: unknown): number | undefined => {
    const d: unknown =
      typeof state === "object" && state !== null ? Reflect.get(state, DEPTH) : undefined;
    return typeof d === "number" ? d : undefined;
  };
  // Storage throws in an opaque-origin frame, where a reload then opens what its address names.
  const intend = (on: boolean): boolean => {
    try {
      const had = sessionStorage.getItem(CLOSING) !== null;
      if (on) {
        sessionStorage.setItem(CLOSING, "");
      } else {
        sessionStorage.removeItem(CLOSING);
      }
      return had;
    } catch {
      return false;
    }
  };
  // The app's own keys in an entry's state, such as its router's scroll, stay beside the depth.
  const stamp = (depth: number, url?: string): void => {
    const own: unknown = history.state;
    history.replaceState(
      { ...(typeof own === "object" && own !== null ? own : {}), [DEPTH]: depth },
      "",
      url,
    );
  };
  const toList = () => {
    stamp(0, location.pathname + location.search);
  };
  let here = 0;
  let closing = false;
  let showing: string | null = null;

  const detail = enhanceListDetail(root, {
    onDismiss: () => {
      if (closing) {
        return;
      }
      const depth = depthOf(history.state) ?? 0;
      if (depth > 0) {
        closing = true;
        intend(true);
        history.go(-depth);
        return;
      }
      toList();
      sync();
    },
  });
  function sync(still = false): void {
    const id = location.hash.slice(1);
    const view = id === "" ? undefined : named(id);
    for (const link of links()) {
      if (view !== undefined && link.hash === location.hash) {
        link.setAttribute("aria-current", "page");
        link.removeAttribute("data-unread");
        link.querySelector(".cp-badge")?.remove();
      } else {
        link.removeAttribute("aria-current");
      }
    }
    if (view === undefined) {
      showing = null;
      detail.close();
      return;
    }
    if (id === showing) {
      return;
    }
    showing = id;
    render(view);
    detail.open({ still });
    messageFeed?.toNewest();
  }
  /** Settles the entry the page arrived on: a Close's landing, or the new entry of a press. */
  const arrive = (): void => {
    const intent = intend(false);
    const depth = depthOf(history.state);
    if ((closing || intent) && depth === 0) {
      toList();
    } else if (depth === undefined) {
      stamp(here + 1);
    }
    closing = false;
    here = depthOf(history.state) ?? 0;
    sync();
  };

  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const wide = root.getBoundingClientRect().width >= 52 * rem;
  if (intend(false) && depthOf(history.state) === 0) {
    toList();
  } else if (depthOf(history.state) === undefined) {
    // A wide page docks the markup's open conversation, so the address names it.
    const open = location.hash === "" && wide ? current()?.hash : undefined;
    stamp(0, open ?? location.href);
  }
  here = depthOf(history.state) ?? 0;
  // On a phone the addressed row takes focus first, so Close returns it there.
  if (!wide) {
    linkOf(items.get(location.hash.slice(1)))?.focus({ preventScroll: true });
  }
  sync(true);
  if (wide) {
    title?.blur();
  }

  addEventListener("popstate", arrive);
  addEventListener("hashchange", arrive);
  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      arrive();
    }
  });
  // A press on a link to the address itself would replace its entry, which
  // in Firefox drops its state (https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate-fragid);
  // the page keeps the entry and only moves focus.
  document.addEventListener("click", (e) => {
    const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
    const plain = e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
    if (
      !(link instanceof HTMLAnchorElement) ||
      !plain ||
      e.defaultPrevented ||
      location.hash === "" ||
      link.href !== location.href
    ) {
      return;
    }
    e.preventDefault();
    if (showing === null) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    } else {
      detail.open();
    }
  });

  // A filter replaces the rows; the open conversation stays open, and its
  // row is current again wherever the filter shows it.
  filters.addEventListener("click", (e) => {
    const pick =
      e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[data-show]") : null;
    if (pick === null) {
      return;
    }
    e.preventDefault();
    for (const link of filters.querySelectorAll("a[data-show]")) {
      if (link === pick) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
    show = pick.dataset["show"] ?? "all";
    keyed.reset(shown());
  });

  const make = (c: Conversation): HTMLLIElement => {
    const item = template?.cloneNode(true);
    const link = item instanceof HTMLLIElement ? linkOf(item) : null;
    if (!(item instanceof HTMLLIElement) || link === null) {
      throw new TypeError("the card has no row to copy");
    }
    link.href = `#${c.id}`;
    link.dataset["kind"] = c.kind;
    link.removeAttribute("aria-current");
    link.removeAttribute("data-unread");
    link.querySelector(".cp-badge")?.remove();
    const name = link.querySelector<HTMLElement>(".cp-cell-stack > .cp-truncate");
    if (name !== null) {
      const mono = c.title.startsWith("/");
      name.textContent = c.title;
      name.classList.toggle("cp-mono", mono);
      if (mono) {
        name.dataset["cut"] = "start";
        name.dataset["cpTip"] = c.title;
        name.dir = "ltr";
      } else {
        delete name.dataset["cut"];
        delete name.dataset["cpTip"];
        name.removeAttribute("dir");
      }
    }
    const preview = link.querySelector("small");
    if (preview !== null) {
      preview.textContent = c.preview;
    }
    const people = link.querySelector(".cp-meta");
    const glyph = people?.querySelector(".cp-icon");
    const words = people?.querySelector(".cp-visually-hidden");
    if (people != null && glyph != null && words != null) {
      people.replaceChildren(glyph, String(c.people), words);
    }
    const time = link.querySelector("time");
    if (time !== null) {
      time.dateTime = new Date(Date.now() - c.ago * 1000).toISOString();
      enhanceRelativeTime(time);
    }
    return item;
  };

  const older = list.querySelector<HTMLButtonElement>(".cp-list-foot > button");
  if (older !== null) {
    let page = 0;
    enhanceLoadMore(older, {
      load: async () => {
        await pause(700);
        const rows = OLDER[page] ?? [];
        page += 1;
        for (const c of rows) {
          items.set(c.id, make(c));
        }
        order = [...order, ...rows.map((c) => c.id)];
        keyed.update(shown());
        sync();
        return {
          items: rows.flatMap((c) => keyed.rowOf(c.id) ?? []),
          more: page < OLDER.length,
        };
      },
      words: {
        count: (n) => (n === 1 ? "1 older conversation" : `${String(n)} older conversations`),
      },
    });
  }

  /** New activity in `id`: its preview and time change, and it moves to the top. */
  const touch = (id: string, from: string, text: string, unread: boolean): void => {
    const link = linkOf(items.get(id));
    if (link === null) {
      return;
    }
    const preview = link.querySelector("small");
    if (preview !== null) {
      preview.textContent = `${from}: ${text}`;
    }
    const time = link.querySelector("time");
    if (time !== null) {
      time.dateTime = new Date().toISOString();
      enhanceRelativeTime(time);
    }
    if (unread) {
      link.setAttribute("data-unread", "");
      let badge = link.querySelector(".cp-badge");
      if (badge === null) {
        badge = document.createElement("span");
        badge.className = "cp-badge";
        badge.setAttribute("data-variant", "quiet");
        link.querySelector("[data-part='end'] > .cp-cluster")?.append(badge);
      }
      const hidden = document.createElement("span");
      hidden.className = "cp-visually-hidden";
      hidden.textContent = " unread";
      badge.replaceChildren(String(Number.parseInt(badge.textContent, 10) + 1 || 1), hidden);
    }
    order = [id, ...order.filter((k) => k !== id)];
    keyed.update(shown());
  };

  // The feed's wiring adds the arrivals to the open conversation first.
  document.querySelector("[data-msg-arrive]")?.addEventListener("click", () => {
    const open = current();
    const last = document.querySelector("#msg-feed > .cp-feed-entry:last-child");
    const from = last?.querySelector("header > a")?.textContent;
    const text = last?.querySelector(".cp-feed-text")?.textContent;
    if (open !== undefined && from != null && text != null) {
      touch(open.hash.slice(1), from, text, false);
    }
  });
  document.querySelector("[data-msg-elsewhere]")?.addEventListener("click", () => {
    const open = current()?.hash.slice(1);
    const id = shown().findLast((k) => k !== open);
    if (id !== undefined) {
      touch(id, "@gpt", "Can you look at this when you have a minute?", true);
      announce("New message from @gpt");
    }
  });
}

interface Post {
  readonly from: string;
  readonly origin: { readonly href: string; readonly title: string };
  readonly subject: string;
  readonly text: string;
  readonly ago: number;
}

const HISTORY: readonly (readonly Post[])[] = [
  [
    {
      from: "@codex",
      origin: { href: "#c-ui-data", title: "/workspace/ui/src/data" },
      subject: "List rows",
      text: "The list row keeps its look on every data card now.",
      ago: 180_000,
    },
    {
      from: "@claude",
      origin: { href: "#c-codex-claude", title: "@codex and @claude" },
      subject: "Review",
      text: "I will review it in the morning.",
      ago: 260_000,
    },
  ],
  [
    {
      from: "@codex",
      origin: { href: "#c-ci", title: "/workspace/ci/.github/workflows" },
      subject: "Sync",
      text: "The sync job runs on every repo again.",
      ago: 340_000,
    },
  ],
];

const agentHistory = document.getElementById("agent-history");
const agentOlder = document.querySelector<HTMLButtonElement>("[data-agent-older]");
const postTemplate = agentHistory?.querySelector(".cp-feed-entry");

if (agentOlder !== null && postTemplate instanceof HTMLLIElement) {
  const post = (p: Post): HTMLLIElement => {
    const item = postTemplate.cloneNode(true) as HTMLLIElement;
    const [author, origin] = item.querySelectorAll<HTMLAnchorElement>("header > a");
    if (author !== undefined) {
      author.textContent = p.from;
      author.href = `#agent-${p.from.slice(1)}`;
    }
    if (origin !== undefined) {
      origin.href = p.origin.href;
      if (p.origin.title.startsWith("/")) {
        const mono = document.createElement("span");
        mono.className = "cp-truncate cp-mono";
        mono.dataset["cut"] = "start";
        mono.dataset["cpTip"] = p.origin.title;
        mono.dir = "ltr";
        mono.textContent = p.origin.title;
        origin.replaceChildren(mono);
      } else {
        origin.replaceChildren(p.origin.title);
      }
    }
    const subject = item.querySelector("h3");
    if (subject !== null) {
      subject.textContent = p.subject;
    }
    const text = item.querySelector(".cp-feed-text");
    if (text !== null) {
      text.textContent = p.text;
    }
    const time = item.querySelector("time");
    if (time !== null) {
      time.dateTime = new Date(Date.now() - p.ago * 1000).toISOString();
      enhanceRelativeTime(time);
    }
    return item;
  };
  const dayKey = (d: Date) => d.toDateString();
  let page = 0;
  enhanceLoadMore(agentOlder, {
    load: async () => {
      await pause(700);
      const posts = HISTORY[page] ?? [];
      page += 1;
      const times = agentHistory?.querySelectorAll<HTMLTimeElement>(".cp-feed-entry time");
      const lastTime = times?.[times.length - 1];
      let day = lastTime === undefined ? "" : dayKey(new Date(lastTime.dateTime));
      const items: HTMLLIElement[] = [];
      for (const p of posts) {
        const item = post(p);
        const at = new Date(item.querySelector("time")?.dateTime ?? Date.now());
        if (dayKey(at) !== day) {
          day = dayKey(at);
          const sep = document.createElement("li");
          sep.className = "cp-feed-day";
          const time = document.createElement("time");
          markDay(time, at);
          sep.append(time);
          items.push(sep);
        }
        items.push(item);
      }
      return { items, more: page < HISTORY.length };
    },
    words: {
      count: (n) => (n === 1 ? "1 older message" : `${String(n)} older messages`),
    },
  });
}
