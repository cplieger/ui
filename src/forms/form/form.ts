/**
 * form.ts — a form's errors, as the forms pattern in docs/design-patterns.md
 * asks: each field with an error is marked invalid and gets its sentence
 * under it, tied by `aria-describedby`. One field's error alone moves focus to
 * it; more fill the form's summary with links, across the form's sections,
 * and a document's own error goes to its notice. What the person typed stays.
 * @module
 */

import { type Control, MARK, clearError as clear, idOf, showError as show } from "./field-error.js";

export type { Control } from "./field-error.js";

/** Marks `field` valid: its error hides and no longer describes it, whoever
 *  showed it. */
export function clearError(field: Control): void {
  clear(field);
}

/** Shows `message` as `field`'s error, as `reportErrors` does for one field,
 *  without the summary or a move of focus. */
export function showError(field: Control, message: string): void {
  show(field, message);
}

export interface FieldError {
  readonly field: Control;
  /** The sentence that names the fix, such as "Enter 5 minutes or more". */
  readonly message: string;
}

/** An error of a section with no one control to fix, such as "Two sources
 *  use the same address". */
export interface SectionError {
  readonly section: HTMLElement;
  readonly message: string;
}

/** An error of the whole document, such as "These settings changed on
 *  another device; load them again before saving". */
export interface FormError {
  readonly message: string;
}

export type ReportedError = FieldError | SectionError | FormError;

export interface ReportOptions {
  /** The form's summary, such as a hidden `.cp-notice` with
   *  `data-tone="danger"` at its top. Its `[data-part="body"]`, or the
   *  summary itself, takes the heading and the links. */
  readonly summary: HTMLElement;
  /** The summary's heading for `count` items, such as "2 settings need a
   *  fix before they save". */
  readonly heading: (count: number) => string;
  /** Where a `FormError` shows, such as a hidden `.cp-notice` with
   *  `data-variant="banner"`; its `[data-part="body"]`, or itself, takes the
   *  sentences. Without it, a form error is an item of the summary. */
  readonly notice?: HTMLElement;
}

const HEADING = "h1, h2, h3, h4, h5, h6";
let seq = 0;

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").trim();
}

function nameOf(field: Control): string {
  return (field.labels?.[0]?.textContent ?? field.getAttribute("aria-label") ?? field.name).trim();
}

function sectionName(section: HTMLElement): string {
  const ids = (section.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter((t) => t !== "");
  const root = section.getRootNode() as ParentNode;
  const labelled = ids.map((id) => textOf(root.querySelector(`#${CSS.escape(id)}`))).join(" ");
  return (
    labelled ||
    section.getAttribute("aria-label") ||
    textOf(section.querySelector(HEADING))
  ).trim();
}

/** The name of the outermost named `<section>` of `form` holding `field`. */
function sectionOf(form: HTMLFormElement, field: Control): string {
  let name = "";
  for (let el = field.parentElement; el !== null && el !== form; el = el.parentElement) {
    if (el.localName === "section" && form.contains(el)) {
      name = sectionName(el) || name;
    }
  }
  return name;
}

function hides(el: HTMLElement): boolean {
  return el.hidden !== false || getComputedStyle(el).display === "none";
}

/** Opens what hides `target`, outermost first: a hidden element with an id
 *  is shown by pressing the page's `a[href="#<id>"]` (the app's category
 *  link, which must show it before the press returns), a closed `<details>`
 *  by `open`. */
function reveal(target: HTMLElement, own: readonly HTMLElement[]): void {
  const around: HTMLElement[] = [];
  for (let el: HTMLElement | null = target; el !== null; el = el.parentElement) {
    around.unshift(el);
  }
  const root = target.getRootNode() as ParentNode;
  for (const el of around) {
    if (el instanceof HTMLDetailsElement && !el.open) {
      el.open = true;
    } else if (el.id !== "" && hides(el)) {
      const link = [
        ...root.querySelectorAll<HTMLAnchorElement>(`a[href="#${CSS.escape(el.id)}"]`),
      ].find((a) => !own.some((o) => o.contains(a)));
      link?.click();
    }
  }
}

function sectionTarget(section: HTMLElement): HTMLElement {
  const id = (section.getAttribute("aria-labelledby") ?? "").split(/\s+/)[0] ?? "";
  const root = section.getRootNode() as ParentNode;
  const labelled = id === "" ? null : root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  return labelled ?? section.querySelector<HTMLElement>(HEADING) ?? section;
}

/** Focuses `el`, which need not be focusable: it takes `tabindex="-1"` while
 *  it holds focus. */
function focusOn(el: HTMLElement): void {
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) {
    el.tabIndex = -1;
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus();
}

function link(href: string, words: string, go: () => void): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = words;
  // Focus the target and bring it into view, which a jump to the fragment
  // alone does not.
  a.addEventListener("click", (e) => {
    e.preventDefault();
    go();
  });
  return a;
}

function fill(host: HTMLElement, ...nodes: (Node | string)[]): void {
  (host.querySelector("[data-part='body']") ?? host).replaceChildren(...nodes);
}

/**
 * Shows `errors` on `form` and clears each error an earlier call or
 * `showError` showed that `errors` no longer names; one a connection test,
 * date range or file field showed stays until that module clears it or this
 * call names its field. A field's error is the `.cp-field-error` its
 * `aria-describedby` names, else `#<its id>-error`, else one made at the end
 * of its `.cp-field`, or after a bare field. One field's error alone focuses
 * the field; any other mix fills and focuses the summary, or, for form
 * errors alone, the notice. An empty list hides both.
 */
export function reportErrors(
  form: HTMLFormElement,
  errors: readonly ReportedError[],
  options: ReportOptions,
): void {
  const { summary, notice } = options;
  const fields = errors.filter((e): e is FieldError => "field" in e);
  const named = new Set(fields.map((e) => e.field));
  for (const f of form.querySelectorAll<Control>(`[${MARK}="form"]`)) {
    if (!named.has(f)) {
      clear(f);
    }
  }
  for (const e of fields) {
    show(e.field, e.message);
  }
  const own = notice === undefined ? [summary] : [summary, notice];
  const formErrors = errors.filter((e) => !("field" in e) && !("section" in e));
  const noticed = notice !== undefined && formErrors.length > 0;
  if (notice !== undefined) {
    const items = formErrors.map((e) => e.message);
    if (items.length > 1) {
      const list = document.createElement("ul");
      list.append(
        ...items.map((m) => Object.assign(document.createElement("li"), { textContent: m })),
      );
      fill(notice, list);
    } else {
      fill(notice, ...items);
    }
    notice.hidden = !noticed;
  }
  const listed = errors.filter((e) => !(noticed && formErrors.includes(e)));
  const lone = listed.length === 1 && !noticed ? fields[0] : undefined;
  if (listed.length === 0 || lone !== undefined) {
    summary.hidden = true;
    if (lone !== undefined) {
      lone.field.focus();
    } else if (noticed) {
      focusOn(notice);
    }
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = options.heading(listed.length);
  const list = document.createElement("ul");
  for (const e of listed) {
    const item = document.createElement("li");
    if ("field" in e) {
      const { field } = e;
      const section = sectionOf(form, field);
      const words = section === "" ? nameOf(field) : `${section}: ${nameOf(field)}`;
      item.append(
        link(`#${idOf(field)}`, words, () => {
          reveal(field, own);
          field.focus();
          (field.labels?.[0] ?? field).scrollIntoView({ block: "nearest" });
        }),
      );
    } else if ("section" in e) {
      const { section } = e;
      if (section.id === "") {
        section.id = `cp-section-${String(++seq)}`;
      }
      item.append(
        link(`#${section.id}`, sectionName(section), () => {
          reveal(section, own);
          const target = sectionTarget(section);
          focusOn(target);
          target.scrollIntoView({ block: "nearest" });
        }),
        `: ${e.message}`,
      );
    } else {
      item.append(e.message);
    }
    list.append(item);
  }
  fill(summary, heading, list);
  summary.hidden = false;
  summary.tabIndex = -1;
  summary.focus();
}
