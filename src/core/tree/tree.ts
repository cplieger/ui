/**
 * tree.ts — finding an element by id in the tree a node is in, which is a
 * document, a shadow root, or the topmost element of a tree not yet in the
 * document. Only the first two have `getElementById`.
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
