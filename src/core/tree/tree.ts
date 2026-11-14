/**
 * tree.ts — the tree a node is in, which is a document, a shadow root, or
 * the topmost element of a tree not yet in the document: finding an element
 * by id there, and the root its events end at and its focus is read at.
 * @module
 */

/** The element whose id is `id` in `node`'s tree, else null. */
export function byId(node: Node, id: string): HTMLElement | null {
  const root = node.getRootNode();
  if (root instanceof Document || root instanceof ShadowRoot) {
    return root.getElementById(id);
  }
  if (!(root instanceof Element)) {
    return null;
  }
  const found = root.querySelector(`#${CSS.escape(id)}`);
  return found instanceof HTMLElement ? found : null;
}

/**
 * Where a component listens for `el`'s events and reads its focus: its
 * shadow root, else its document, an element not yet mounted included. An
 * event that is not composed, such as `change`, `reset`, `submit` or
 * `cancel`, never leaves a shadow root, and the document reads focus and a
 * composed event's target inside one as its host
 * (https://dom.spec.whatwg.org/#retarget).
 */
export function rootOf(el: Element): Document | ShadowRoot {
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root : el.ownerDocument;
}

/** The element that has focus in `el`'s tree, else null. */
export function focusIn(el: Element): Element | null {
  return rootOf(el).activeElement;
}
