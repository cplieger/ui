/**
 * icons.ts — Lucide's drawings in the package's stroke, a few of its own, all
 * under `icons/svg/`, and a factory that paints one as a `currentColor` mask.
 *
 * @module
 */

/** A Lucide drawing the package ships, one `icons/svg/<name>.svg` file each. */
export type LucideIconName =
  | "activity"
  | "arrow-down"
  | "arrow-left-right"
  | "arrow-right"
  | "arrow-up"
  | "arrow-up-down"
  | "ban"
  | "bell"
  | "book-open"
  | "bug"
  | "captions"
  | "chart-gantt"
  | "check"
  | "check-check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "circle-alert"
  | "circle-check"
  | "circle-dashed"
  | "circle-help"
  | "circle-minus"
  | "circle-x"
  | "clock"
  | "cloud-upload"
  | "code"
  | "columns-3"
  | "command"
  | "copy"
  | "download"
  | "ellipsis"
  | "external-link"
  | "eye"
  | "eye-off"
  | "file-text"
  | "film"
  | "fingerprint"
  | "folder"
  | "funnel"
  | "funnel-x"
  | "git-branch"
  | "git-commit-horizontal"
  | "git-merge"
  | "globe"
  | "grip-vertical"
  | "hard-drive"
  | "heart"
  | "history"
  | "hourglass"
  | "info"
  | "key"
  | "key-round"
  | "keyboard"
  | "languages"
  | "layers"
  | "layers-2"
  | "layout-dashboard"
  | "layout-grid"
  | "library"
  | "link"
  | "list"
  | "list-checks"
  | "list-tree"
  | "lock"
  | "log-in"
  | "log-out"
  | "maximize-2"
  | "message-square"
  | "minus"
  | "monitor"
  | "moon"
  | "octagon-alert"
  | "package-open"
  | "palette"
  | "panel-left"
  | "panel-right"
  | "pause"
  | "pencil"
  | "pin"
  | "play"
  | "plus"
  | "radio-tower"
  | "refresh-cw"
  | "rotate-cw"
  | "rows-3"
  | "rss"
  | "save"
  | "scale"
  | "search"
  | "send-horizontal"
  | "server"
  | "settings"
  | "shield-check"
  | "smartphone"
  | "sparkles"
  | "split"
  | "square"
  | "square-pen"
  | "sun"
  | "sun-moon"
  | "tablet"
  | "tag"
  | "telescope"
  | "terminal"
  | "timer"
  | "trash-2"
  | "triangle-alert"
  | "tv"
  | "undo-2"
  | "upload"
  | "user"
  | "user-plus"
  | "users"
  | "wifi-off"
  | "x"
  | "zap";

/** A drawing of the package's own, on the same grid and stroke, for a concept Lucide lacks. */
export type OwnIconName =
  "funnel-filled" | "heart-filled" | "pin-filled" | "spinner-arc" | "tag-filled";

/** Every drawing the package ships under `icons/svg/`. */
export type IconName = LucideIconName | OwnIconName;

/** The Lucide drawings' names, sorted; `npm run icons:sync` restyles exactly these. */
export const iconNames: readonly LucideIconName[] = [
  "activity",
  "arrow-down",
  "arrow-left-right",
  "arrow-right",
  "arrow-up",
  "arrow-up-down",
  "ban",
  "bell",
  "book-open",
  "bug",
  "captions",
  "chart-gantt",
  "check",
  "check-check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "chevron-up",
  "circle-alert",
  "circle-check",
  "circle-dashed",
  "circle-help",
  "circle-minus",
  "circle-x",
  "clock",
  "cloud-upload",
  "code",
  "columns-3",
  "command",
  "copy",
  "download",
  "ellipsis",
  "external-link",
  "eye",
  "eye-off",
  "file-text",
  "film",
  "fingerprint",
  "folder",
  "funnel",
  "funnel-x",
  "git-branch",
  "git-commit-horizontal",
  "git-merge",
  "globe",
  "grip-vertical",
  "hard-drive",
  "heart",
  "history",
  "hourglass",
  "info",
  "key",
  "key-round",
  "keyboard",
  "languages",
  "layers",
  "layers-2",
  "layout-dashboard",
  "layout-grid",
  "library",
  "link",
  "list",
  "list-checks",
  "list-tree",
  "lock",
  "log-in",
  "log-out",
  "maximize-2",
  "message-square",
  "minus",
  "monitor",
  "moon",
  "octagon-alert",
  "package-open",
  "palette",
  "panel-left",
  "panel-right",
  "pause",
  "pencil",
  "pin",
  "play",
  "plus",
  "radio-tower",
  "refresh-cw",
  "rotate-cw",
  "rows-3",
  "rss",
  "save",
  "scale",
  "search",
  "send-horizontal",
  "server",
  "settings",
  "shield-check",
  "smartphone",
  "sparkles",
  "split",
  "square",
  "square-pen",
  "sun",
  "sun-moon",
  "tablet",
  "tag",
  "telescope",
  "terminal",
  "timer",
  "trash-2",
  "triangle-alert",
  "tv",
  "undo-2",
  "upload",
  "user",
  "user-plus",
  "users",
  "wifi-off",
  "x",
  "zap",
];

/** The package's own drawings' names, sorted; no pinned Lucide release has them. */
export const ownIconNames: readonly OwnIconName[] = [
  "funnel-filled",
  "heart-filled",
  "pin-filled",
  "spinner-arc",
  "tag-filled",
];

/** The size tier `icon` writes as `data-cp-icon-size`; the host's CSS gives each its size. */
export type IconSize = "inline" | "ui" | "lg" | "hero";

/** Where the host serves each drawing. Give exactly one of `url` and `base`. */
export type IconsOptions<N extends string = IconName> =
  | {
      /** The URL of `name`'s file, such as a content-hashed `/assets/pin-<hash>.svg`. */
      url: (name: N) => string;
      base?: undefined;
    }
  | {
      /** A URL prefix ending in `/`; the file of `name` is `base + name + ".svg"`. */
      base: string;
      url?: undefined;
    };

/** What `createIcons` returns. */
export interface Icons<N extends string = IconName> {
  /**
   * A decorative `<span class="cp-icon" aria-hidden="true">` with `data-cp-icon` and
   * `data-cp-icon-size` (default `"ui"`), its `--cp-icon-image: url("…")` set through the CSSOM,
   * which a strict `style-src` allows. The control that holds it carries the accessible name.
   */
  icon(name: N, size?: IconSize): HTMLSpanElement;
}

/**
 * Returns an icon factory over the host's files. `N` defaults to the shipped
 * `IconName`; a host with its own drawings passes its own name union with a
 * `url` resolver. Throws a TypeError unless exactly one of `url` and `base` is
 * given.
 */
export function createIcons<N extends string = IconName>(opts: IconsOptions<N>): Icons<N> {
  const resolve = resolver(opts);
  return {
    icon(name, size = "ui") {
      const span = document.createElement("span");
      span.className = "cp-icon";
      span.setAttribute("data-cp-icon", name);
      span.setAttribute("data-cp-icon-size", size);
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--cp-icon-image", `url("${cssString(resolve(name))}")`);
      return span;
    },
  };
}

function resolver<N extends string>(opts: IconsOptions<N>): (name: N) => string {
  const { url, base } = opts as { url?: unknown; base?: unknown };
  if (typeof url === "function" && base === undefined) {
    return url as (name: N) => string;
  }
  if (typeof base === "string" && url === undefined) {
    return (name) => `${base}${name}.svg`;
  }
  throw new TypeError("createIcons: give exactly one of url (a function) and base (a string)");
}

// A URL may hold a quote, a backslash or a line break, each of which would end
// or break the CSS string; escapes keep it one token (CSS Syntax 3, 4.3.5).
function cssString(s: string): string {
  return s.replace(/["\\\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
}
