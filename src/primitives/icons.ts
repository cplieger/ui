/**
 * icons.ts — a curated set of Lucide drawings, shipped as files under the
 * package's `icons/svg/`, and a factory that paints one through a CSS mask in
 * `currentColor`. The host serves the files and owns the CSS; the factory only
 * builds the element.
 *
 * @module
 */

import { el } from "../dom/el.js";

/** A drawing the package ships, one `icons/svg/<name>.svg` file each. */
export type IconName =
  | "arrow-left-right"
  | "arrow-up"
  | "ban"
  | "check"
  | "check-check"
  | "chevron-right"
  | "circle-alert"
  | "circle-check"
  | "circle-minus"
  | "copy"
  | "download"
  | "external-link"
  | "eye-off"
  | "funnel"
  | "funnel-x"
  | "hard-drive"
  | "info"
  | "layout-dashboard"
  | "library"
  | "list-checks"
  | "monitor"
  | "moon"
  | "pencil"
  | "plus"
  | "refresh-cw"
  | "rss"
  | "search"
  | "settings"
  | "sun"
  | "triangle-alert"
  | "wifi-off"
  | "x"
  | "zap";

/** Every shipped drawing's name, sorted. */
export const iconNames: readonly IconName[] = [
  "arrow-left-right",
  "arrow-up",
  "ban",
  "check",
  "check-check",
  "chevron-right",
  "circle-alert",
  "circle-check",
  "circle-minus",
  "copy",
  "download",
  "external-link",
  "eye-off",
  "funnel",
  "funnel-x",
  "hard-drive",
  "info",
  "layout-dashboard",
  "library",
  "list-checks",
  "monitor",
  "moon",
  "pencil",
  "plus",
  "refresh-cw",
  "rss",
  "search",
  "settings",
  "sun",
  "triangle-alert",
  "wifi-off",
  "x",
  "zap",
];

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
