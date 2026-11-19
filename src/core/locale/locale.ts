/**
 * locale.ts — the language a component writes its numbers in.
 * @module
 */

/** The `lang` of `el` or its nearest ancestor that has one, in its
 *  canonical form; `undefined`, the browser's own language, when none does
 *  or it is empty or not a BCP 47 tag, which HTML reads as an unknown
 *  language. */
export function localeOf(el: Element): string | undefined {
  const lang = el.closest("[lang]")?.getAttribute("lang");
  if (lang === null || lang === undefined || lang === "") {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(lang)[0];
  } catch {
    return undefined;
  }
}
