/**
 * icons.ts — a curated set of Lucide's drawings and two of the package's own,
 * shipped as files under `icons/svg/`, and a factory that paints one through a
 * CSS mask in `currentColor`. The host serves the files and owns the CSS; the
 * factory only builds the element.
 *
 * @module
 */

import { el } from "../dom/el.js";

/** A Lucide drawing the package ships, one `icons/svg/<name>.svg` file each. */
export type LucideIconName =
  | "arrow-left-right"
  | "arrow-right"
  | "arrow-up"
  | "ban"
  | "book-open"
  | "bug"
  | "captions"
  | "chart-gantt"
  | "check"
  | "check-check"
  | "chevron-down"
  | "chevron-right"
  | "chevron-up"
  | "circle-alert"
  | "circle-check"
  | "circle-dashed"
  | "circle-minus"
  | "circle-x"
  | "clock"
  | "code"
  | "copy"
  | "download"
  | "external-link"
  | "eye"
  | "eye-off"
  | "file-text"
  | "folder"
  | "funnel"
  | "funnel-x"
  | "git-branch"
  | "git-commit-horizontal"
  | "git-merge"
  | "globe"
  | "hard-drive"
  | "history"
  | "hourglass"
  | "info"
  | "languages"
  | "layers-2"
  | "layout-dashboard"
  | "library"
  | "link"
  | "list"
  | "list-checks"
  | "list-tree"
  | "maximize-2"
  | "message-square"
  | "minus"
  | "monitor"
  | "moon"
  | "octagon-alert"
  | "pause"
  | "pencil"
  | "pin"
  | "play"
  | "plus"
  | "radio-tower"
  | "refresh-cw"
  | "rotate-cw"
  | "rss"
  | "scale"
  | "search"
  | "send-horizontal"
  | "settings"
  | "smartphone"
  | "split"
  | "square"
  | "sun"
  | "sun-moon"
  | "tablet"
  | "terminal"
  | "timer"
  | "trash-2"
  | "triangle-alert"
  | "undo-2"
  | "user"
  | "wifi-off"
  | "x"
  | "zap";

/** A drawing of the package's own, on the same grid and stroke, for a concept Lucide lacks. */
export type OwnIconName = "pin-filled" | "spinner-arc";

/** Every drawing the package ships under `icons/svg/`. */
export type IconName = LucideIconName | OwnIconName;

/** The Lucide drawings' names, sorted; `npm run icons:sync` copies exactly these. */
export const iconNames: readonly LucideIconName[] = [
  "arrow-left-right",
  "arrow-right",
  "arrow-up",
  "ban",
  "book-open",
  "bug",
  "captions",
  "chart-gantt",
  "check",
  "check-check",
  "chevron-down",
  "chevron-right",
  "chevron-up",
  "circle-alert",
  "circle-check",
  "circle-dashed",
  "circle-minus",
  "circle-x",
  "clock",
  "code",
  "copy",
  "download",
  "external-link",
  "eye",
  "eye-off",
  "file-text",
  "folder",
  "funnel",
  "funnel-x",
  "git-branch",
  "git-commit-horizontal",
  "git-merge",
  "globe",
  "hard-drive",
  "history",
  "hourglass",
  "info",
  "languages",
  "layers-2",
  "layout-dashboard",
  "library",
  "link",
  "list",
  "list-checks",
  "list-tree",
  "maximize-2",
  "message-square",
  "minus",
  "monitor",
  "moon",
  "octagon-alert",
  "pause",
  "pencil",
  "pin",
  "play",
  "plus",
  "radio-tower",
  "refresh-cw",
  "rotate-cw",
  "rss",
  "scale",
  "search",
  "send-horizontal",
  "settings",
  "smartphone",
  "split",
  "square",
  "sun",
  "sun-moon",
  "tablet",
  "terminal",
  "timer",
  "trash-2",
  "triangle-alert",
  "undo-2",
  "user",
  "wifi-off",
  "x",
  "zap",
];

/** The package's own drawings' names, sorted; no pinned Lucide release has them. */
export const ownIconNames: readonly OwnIconName[] = ["pin-filled", "spinner-arc"];

/** The size tier `icon` writes as `data-uip-icon-size`; the host's CSS gives each its size. */
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
   * A decorative `<span class="uip-icon" aria-hidden="true">` carrying
   * `data-uip-icon` and `data-uip-icon-size` (default `"ui"`), with
   * `--uip-icon: url("…")` set through the CSSOM, which a strict `style-src`
   * allows. The control that holds it carries the accessible name.
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
      const span = el("span", {
        className: "uip-icon",
        "data-uip-icon": name,
        "data-uip-icon-size": size,
        "aria-hidden": "true",
      });
      span.style.setProperty("--uip-icon", `url("${cssString(resolve(name))}")`);
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
