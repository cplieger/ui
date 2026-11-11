/**
 * review.ts — marks each gallery card for the owner's review: "Built" when
 * it runs on the library alone, "Mockup" while it still draws with the
 * gallery's own CSS, and "To review" while its design waits for the owner
 * (`data-new` in the page, removed once he approves it). The Show control
 * narrows the page to one of these.
 */

/** Gallery classes that frame or arrange a demo and draw no element. */
const HARNESS = new Set([
  "g-row-inline",
  "g-gap-top",
  "g-grid",
  "g-section",
  "g-wide",
  "g-shell",
  "g-shell-page",
  "g-shell-view",
  "g-resizable",
  "g-mini-header",
  "g-statusline",
  "g-phone",
  "g-note",
  "g-sr",
  "g-h1",
  "g-focus-demo",
  "g-harmony",
  "g-ladders",
  "g-ladder",
  "g-buttons",
  "g-heard",
  "g-announce",
  "g-shape",
  "g-type",
  "g-icons",
  "g-icon",
]);

/** Every gallery class the gallery's own stylesheet draws, which build.ts
 *  lists in the page: a preview tab runs the page at an opaque origin, where
 *  reading the stylesheet's rules throws. */
function drawn(): Set<string> {
  const list = document.querySelector<HTMLMetaElement>('meta[name="gallery-classes"]');
  return new Set((list?.content ?? "").split(" ").filter(Boolean));
}

export function markCards(): void {
  const gallery = drawn();
  const mock = (root: Element): boolean =>
    [...root.querySelectorAll<HTMLElement>("[class]")].some(
      (el) =>
        el.closest("footer, .card > h2") === null &&
        [...el.classList].some((c) => gallery.has(c) && !HARNESS.has(c)),
    );
  const cards = document.querySelectorAll<HTMLElement>(".card");
  for (const card of cards) {
    card.dataset["build"] = mock(card) ? "mockup" : "built";
  }
  // A screen page has no cards: the page itself is built or a mockup.
  const screen = document.querySelector("body > main");
  if (cards.length === 0 && screen !== null) {
    document.body.dataset["build"] = mock(screen) ? "mockup" : "built";
  }
  const show = document.querySelector<HTMLSelectElement>('.controls [name="show"]');
  show?.addEventListener("change", () => {
    document.documentElement.dataset["show"] = show.value;
  });
}
