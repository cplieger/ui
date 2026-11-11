/**
 * highlight.ts — `@cplieger/ui/highlight`: source text coloured by language.
 * The tokenizer and language resolution take no DOM and run in a worker.
 * @module
 */

export { TOKEN_KINDS, runs, tokenize } from "./tokenize.js";
export type { Runs, Token, TokenKind } from "./tokenize.js";
export { languageName, resolveLanguage } from "./languages.js";
