/**
 * conversations.ts — the Messages card's conversation list, on the library:
 * keyed rows that move to the top on new activity, Show older, the filters
 * and the route that opens a conversation beside the list or in a dialog;
 * and the agent card's history, newest first, with Show older at its end.
 */

import { announce } from "@cplieger/ui/announce";
import { enhanceKeyedList } from "@cplieger/ui/keyed-list";
import { enhanceListDetail } from "@cplieger/ui/list-detail";
import { enhanceLoadMore } from "@cplieger/ui/load-more";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";
import { enhanceRovingFocus } from "@cplieger/ui/roving-focus";

import { messageFeed } from "./feed.js";

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
      id: "c-homelab",
      kind: "Thread",
      title: "/workspace/homelab/stacks/monitoring",
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

  const title = document.getElementById("msg-title");
  const kind = document.getElementById("msg-kind");
  const detail = enhanceListDetail(root, {
    onDismiss: () => {
      history.replaceState(null, "", location.pathname + location.search);
      route(null, false);
    },
  });
  function route(row: HTMLAnchorElement | null, still: boolean): void {
    for (const link of links()) {
      if (link === row) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
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
    messageFeed?.toNewest();
  }
  const byHash = () => (location.hash === "" ? undefined : items.get(location.hash.slice(1)));
  // The page loads with the open conversation docked beside the list, but
  // with focus and scroll at the page's start; on a phone it would load
  // into the dialog, so there it waits for a press.
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const first = linkOf(byHash()) ?? current() ?? null;
  if (first !== null && root.getBoundingClientRect().width >= 52 * rem) {
    route(first, true);
    title?.blur();
  } else {
    first?.removeAttribute("aria-current");
  }
  addEventListener("hashchange", () => {
    const row = linkOf(byHash());
    if (row !== null) {
      route(row, false);
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

  /** A row for `c` in the shape of the card's first row. */
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
      enhanceRelativeTime(time, { style: "short" });
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
      enhanceRelativeTime(time, { style: "short" });
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
  // The conversation lowest in the list that is not open hears from @gpt.
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
  /** An entry for `p` in the shape of the history's first one. */
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
        mono.className = "cp-mono";
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
  let page = 0;
  enhanceLoadMore(agentOlder, {
    load: async () => {
      await pause(700);
      const posts = HISTORY[page] ?? [];
      page += 1;
      return { items: posts.map(post), more: page < HISTORY.length };
    },
    words: {
      count: (n) => (n === 1 ? "1 older message" : `${String(n)} older messages`),
    },
  });
}
