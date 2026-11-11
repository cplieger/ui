/**
 * locale.ts — the language a component writes its numbers in.
 * @module
 */

/** The `lang` of `el` or its nearest ancestor that has one; `undefined`,
 *  the browser's own language, when none does or it is empty. */
export function localeOf(el: Element): string | undefined {
  const lang = el.closest("[lang]")?.getAttribute("lang");
  return lang === null || lang === undefined || lang === "" ? undefined : lang;
}
