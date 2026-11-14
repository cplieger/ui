/**
 * templates.ts — the gallery's wiring for the page templates' cards: each
 * template in an `<iframe>` drawn at a phone's, a tablet's or a desktop's
 * width and scaled to its card, so the template's own media queries answer
 * to the width chosen.
 */

const WIDTHS = [
  ["Phone", 390],
  ["Tablet", 820],
  ["Desktop", 1280],
] as const;

for (const [n, view] of [
  ...document.querySelectorAll<HTMLElement>("[data-template-frame]"),
].entries()) {
  const frame = view.querySelector("iframe");
  if (frame === null) {
    continue;
  }
  const name = view.dataset["templateFrame"] ?? "";
  frame.style.setProperty("flex", "none");
  frame.style.setProperty("block-size", "35rem");
  frame.style.setProperty("border", "0");
  frame.style.setProperty("transform", "scale(var(--s, 1))");
  frame.style.setProperty("transform-origin", "0 0");
  const group = document.createElement("div");
  group.className = "cp-segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", `${name}: width`);
  let width: number = innerWidth < 600 ? 390 : 1280;
  const fit = (): void => {
    frame.style.setProperty("inline-size", `${String(width)}px`);
    view.style.setProperty("--s", String(Math.min(1, view.clientWidth / width)));
  };
  for (const [label, w] of WIDTHS) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `template-${String(n)}`;
    input.value = String(w);
    input.checked = w === width;
    input.addEventListener("change", () => {
      width = w;
      fit();
    });
    const option = document.createElement("label");
    option.append(input, `${label}, ${String(w)}px`);
    group.append(option);
  }
  view.before(group);
  new ResizeObserver(fit).observe(view);
  fit();
}
