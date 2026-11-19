/** One `.cp-skeleton` bar, in `variant` when given. */
export function bone(variant?: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "cp-skeleton";
  if (variant !== undefined) {
    span.dataset["variant"] = variant;
  }
  return span;
}
