/**
 * measure.ts — label widths without layout: words by `measureText`, numbers
 * as tabular figures, which a canvas cannot draw.
 * @module
 */

const DIGIT = /\p{Nd}/gu;

/** The decimal digits in `text`, of any numbering system. */
export const countDigits = (text: string): number => text.match(DIGIT)?.length ?? 0;

const digitsOf = new Map<string, string>();

/** The locale's ten digits, as its numbers write them. */
export function probeDigits(locale: string | undefined): string {
  const key = locale ?? "";
  let digits = digitsOf.get(key);
  if (digits === undefined) {
    digits = new Intl.NumberFormat(locale, { useGrouping: false }).format(1234567890);
    digitsOf.set(key, digits);
  }
  return digits;
}

/** Widths in pixels: `text` as it is, `number` with every digit as wide as
 *  the font's widest, or its tabular advance when that is wider. */
export interface Measure {
  readonly text: (text: string) => number;
  readonly number: (text: string) => number;
}

/** The texts one font remembers, so a long-lived page's labels stay bounded. */
const MEMO = 4_096;

/** A `Measure` over `measure` (a canvas's `measureText` width) and the
 *  font's tabular digit advance, for `locale`'s digits. */
export function measurer(
  measure: (text: string) => number,
  tabular: number,
  locale: string | undefined,
): Measure {
  // A chart measures thousands of labels that differ only in their digits.
  const seen = new Map<string, number>();
  const known = (text: string): number => {
    let w = seen.get(text);
    if (w === undefined) {
      if (seen.size >= MEMO) {
        seen.clear();
      }
      w = measure(text);
      seen.set(text, w);
    }
    return w;
  };
  const widest = Math.max(...Array.from(probeDigits(locale), known));
  const digit = Math.max(widest, tabular);
  return {
    text: known,
    number: (text) => {
      const rest = text.replace(DIGIT, "");
      return digit * countDigits(text) + (rest === "" ? 0 : known(rest));
    },
  };
}

const fonts = new Map<string, Measure>();

// Canvas parses a CSS `font` shorthand, which takes no percentage stretch.
function fontOf(style: CSSStyleDeclaration): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/**
 * The `Measure` for `element`'s font in `locale`, cached per font for the
 * page. Its tabular advance is read from a hidden probe appended to
 * `element`, a layout read: call it outside any draw.
 */
export function fontMeasure(element: HTMLElement, locale: string | undefined): Measure {
  const font = fontOf(getComputedStyle(element));
  const key = `${font}|${locale ?? ""}`;
  let hit = fonts.get(key);
  if (hit === undefined) {
    const context = document.createElement("canvas").getContext("2d");
    if (context !== null) {
      context.font = font;
    }

    const probe = document.createElement("span");
    probe.textContent = probeDigits(locale);
    Object.assign(probe.style, {
      position: "absolute",
      visibility: "hidden",
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    });
    element.append(probe);
    const tabular = probe.getBoundingClientRect().width / 10;
    probe.remove();
    // A page that refuses canvas reads gets no context; a digit's advance
    // per character is near a text face's average width.
    const measure =
      context === null
        ? (text: string) => tabular * Array.from(text).length
        : (text: string) => context.measureText(text).width;
    hit = measurer(measure, tabular, locale);
    fonts.set(key, hit);
  }
  return hit;
}

/** Forgets every cached measure, for a page whose fonts have loaded since. */
export const forgetMeasures = (): void => {
  fonts.clear();
};
