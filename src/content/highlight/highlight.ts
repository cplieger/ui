/**
 * highlight.ts — `@cplieger/ui/highlight`: source text coloured by language.
 * The tokenizer, language resolution and detection take no DOM and run in a
 * worker; `highlightInto` writes the tokens into an element.
 * @module
 */

export { TOKEN_KINDS, runs, tokenize } from "./tokenize.js";
export type { Runs, Token, TokenKind } from "./tokenize.js";
export { languageName, resolveLanguage } from "./languages.js";
export { detectLanguage } from "./detect.js";
export { highlightInto } from "./dom.js";
export type { HighlightOptions, MarkRange } from "./dom.js";
