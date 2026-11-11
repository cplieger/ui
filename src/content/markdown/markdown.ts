/**
 * markdown.ts — `@cplieger/ui/markdown`: text a person did not write, such
 * as an agent's answer, rendered as the design language's prose. The parser
 * takes no DOM and runs in a worker; the DOM sink gates every destination,
 * so no text can yield markup, script, a navigation to a scheme outside
 * `http:`, `https:` and `mailto:`, or an image fetch the app did not allow.
 * @module
 */

export { createParser } from "./parser.js";
export type { AttrName, Kind, MarkdownParser, Sink } from "./parser.js";
export { payloadShaped } from "./gate.js";
export { createDomSink, renderMarkdown } from "./render.js";
export type {
  CodeNode,
  DomSink,
  Hooks,
  ImageNode,
  LinkNode,
  MathNode,
  RenderOptions,
} from "./render.js";
