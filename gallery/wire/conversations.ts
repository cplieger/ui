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

  const title = document.getElementById("msg-title");
  const kind = document.getElementById("msg-kind");
  const compose = document.getElementById("msg-compose");
  const readOnly = document.getElementById("msg-read-only");
  // The person posts only as You, so a direct conversation between two
  // others takes no reply: the foot names who writes there instead.
  function replyFor(row: HTMLAnchorElement): void {
    if (compose === null || readOnly === null) {
      return;
    }
    const names = row.querySelector(".cp-cell-stack > .cp-truncate")?.textContent ?? "";
    const people = row.dataset["kind"] === "Direct" ? names.split(" and ") : [];
    const closed = people.length === 2 && !people.includes("You");
    compose.hidden = closed;
    readOnly.hidden = !closed;
    const [words, actions] = readOnly.children;
    if (!closed || words === undefined || actions === undefined) {
      return;
    }
    words.textContent = `Only ${names} write here.`;
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
  // A conversation a press opened has its own history entry, so Close goes
  // back one entry, which may still name an earlier conversation; the
  // hashchange then drops that hash. The entry a page loaded on is the
  // list's, so closing that one rewrites its address instead.
  const LANDED = "cp-gallery-landed";
  let closing = false;
  const detail = enhanceListDetail(root, {
    onDismiss: () => {
      const state: unknown = history.state;
      const landed = typeof state === "object" && state !== null && LANDED in state;
      if (byHash() !== undefined && !landed) {
        closing = true;
        history.back();
        return;
      }
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
    replyFor(row);
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
    if (byHash() !== undefined) {
      history.replaceState({ [LANDED]: true }, "");
    }
    route(first, true);
    title?.blur();
  } else {
    first?.removeAttribute("aria-current");
    // A press on a link to the address's own hash fires no hashchange.
    if (byHash() !== undefined) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }
  // Back to a hash naming no conversation closes the phone's dialog; wide,
  // the docked conversation stays, so the layout never loses its detail.
  // After a Close the address names no conversation, since a press on a
  // link to the address's own hash would open nothing.
  addEventListener("hashchange", () => {
    const forced = closing;
    closing = false;
    if (forced && byHash() !== undefined) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    const row = forced ? null : linkOf(byHash());
    if (row !== null) {
      route(row, false);
    } else if (forced || root.getBoundingClientRect().width < 52 * rem) {
      route(null, false);
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
