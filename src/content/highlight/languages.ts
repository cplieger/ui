/**
 * languages.ts — the highlighter's grammars, and how a fence tag, an
 * extension or a path names one. Every lookup is a `Map`, so a hint such as
 * `constructor` names nothing.
 * @module
 */

/** How one language's text divides into tokens. */
export interface Grammar {
  /** The label a code block shows. */
  readonly name: string;
  readonly keywords: ReadonlySet<string>;
  readonly scan: "code" | "markup" | "diff" | "plain";
  /** Line-comment openers. */
  readonly line: readonly string[];
  /** A `#` opener opens a comment only at a word's start, after a space or at a line start. */
  readonly wordHash: boolean;
  readonly block: readonly [open: string, close: string] | null;
  /** Backtick strings span lines; `raw` ones take no escapes (Go's). */
  readonly backtick: "raw" | "escaped" | null;
  /** Quoted strings span lines instead of ending at one. */
  readonly multiline: boolean;
  /** `"""` and `'''` open strings that span lines. */
  readonly triple: boolean;
  /** A single-quoted string takes no escapes (the shell's). */
  readonly rawSingle: boolean;
  /** A quote right after a letter or digit is text, as an apostrophe in a plain scalar. */
  readonly wordQuote: boolean;
  /** A `'` opens only a character literal, so a lifetime (`'a`) stays text. */
  readonly charQuote: boolean;
  /** Which keys colour as `key`: a JSON string before `:`, or a YAML mapping key. */
  readonly keys: "json" | "yaml" | null;
}

const NO_KEYWORDS: ReadonlySet<string> = new Set();

const BASE: Grammar = {
  name: "",
  keywords: NO_KEYWORDS,
  scan: "code",
  line: [],
  wordHash: false,
  block: null,
  backtick: null,
  multiline: false,
  triple: false,
  rawSingle: false,
  wordQuote: false,
  charQuote: false,
  keys: null,
};

const C_COMMENTS = { line: ["//"], block: ["/*", "*/"] } as const;

/** The shared keywords of the languages with no table of their own. */
const GENERIC_KW = new Set(
  "if else for while return function class import export const let var true false null undefined new this".split(
    " ",
  ),
);

const words = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter((w) => w !== ""));

const GO_KW = words(`package import func var const type struct interface map chan go defer return
  if else for range switch case default select break continue fallthrough goto nil true false iota
  make new append len cap delete copy close panic recover error any`);

const JS_KW = words(`import export from const let var function class return if else for while do
  switch case default break continue new this super extends async await yield throw try catch
  finally typeof instanceof in of void null undefined true false delete static`);

const TS_KW = new Set([
  ...JS_KW,
  ...words(`interface type enum implements as is readonly abstract private protected public
    declare module namespace keyof infer satisfies unique never unknown any`),
]);

const PY_KW = words(`import from def class return if elif else for while break continue pass
  raise try except finally with as yield lambda and or not in is None True False global nonlocal
  del assert async await`);

const SH_KW = words(`if then else elif fi for while until do done case esac in function return
  exit local export readonly unset shift set true false source declare`);

const RS_KW = words(`fn let mut const static struct enum impl trait pub use mod crate self Self
  super return if else for while loop match break continue as in ref move async await dyn unsafe
  where type extern true false None Some Ok Err`);

const RB_KW = words(`def end if elsif else unless while until for in do return class module
  self nil true false and or not begin rescue ensure raise yield then case when super break next
  redo retry alias defined`);

const C_KW = words(`auto break case char const continue default do double else enum extern float
  for goto if inline int long register restrict return short signed sizeof static struct switch
  typedef union unsigned void volatile while bool true false NULL include define ifdef ifndef
  endif pragma`);

const CPP_KW = new Set([
  ...C_KW,
  ...words(`class namespace template typename public private protected virtual override final
    new delete this nullptr using try catch throw operator friend constexpr noexcept decltype
    explicit mutable static_cast dynamic_cast reinterpret_cast const_cast`),
]);

// Instructions are matched as written, and Dockerfiles write them uppercase.
const DOCKER_KW = words(`FROM AS RUN CMD ENTRYPOINT COPY ADD ENV ARG WORKDIR EXPOSE VOLUME USER
  LABEL HEALTHCHECK SHELL STOPSIGNAL ONBUILD MAINTAINER`);

const LITERALS = words("true false null");

/** Each grammar's key, then its definition and every tag and extension that names it. */
const TABLE: readonly [key: string, grammar: Grammar, names: readonly string[]][] = [
  [
    "go",
    { ...BASE, ...C_COMMENTS, name: "Go", keywords: GO_KW, backtick: "raw" },
    ["golang", "mod"],
  ],
  [
    "ts",
    { ...BASE, ...C_COMMENTS, name: "TypeScript", keywords: TS_KW, backtick: "escaped" },
    ["typescript", "tsx", "mts", "cts"],
  ],
  [
    "js",
    { ...BASE, ...C_COMMENTS, name: "JavaScript", keywords: JS_KW, backtick: "escaped" },
    ["javascript", "jsx", "mjs", "cjs", "node"],
  ],
  [
    "py",
    { ...BASE, name: "Python", keywords: PY_KW, line: ["#"], triple: true },
    ["python", "python3", "py3"],
  ],
  [
    "sh",
    {
      ...BASE,
      name: "Shell",
      keywords: SH_KW,
      line: ["#"],
      wordHash: true,
      multiline: true,
      rawSingle: true,
    },
    ["shell", "bash", "zsh", "ksh"],
  ],
  [
    "rs",
    { ...BASE, ...C_COMMENTS, name: "Rust", keywords: RS_KW, multiline: true, charQuote: true },
    ["rust"],
  ],
  ["rb", { ...BASE, name: "Ruby", keywords: RB_KW, line: ["#"] }, ["ruby"]],
  ["c", { ...BASE, ...C_COMMENTS, name: "C", keywords: C_KW }, ["h"]],
  [
    "cpp",
    { ...BASE, ...C_COMMENTS, name: "C++", keywords: CPP_KW },
    ["c++", "cplusplus", "cc", "cxx", "hpp", "hh", "hxx"],
  ],
  [
    "docker",
    { ...BASE, name: "Dockerfile", keywords: DOCKER_KW, line: ["#"], wordHash: true },
    ["dockerfile", "containerfile"],
  ],
  ["php", { ...BASE, ...C_COMMENTS, name: "PHP", keywords: GENERIC_KW, line: ["//", "#"] }, []],
  ["java", { ...BASE, ...C_COMMENTS, name: "Java", keywords: GENERIC_KW }, []],
  ["toml", { ...BASE, name: "TOML", keywords: GENERIC_KW, line: ["#"] }, []],
  ["css", { ...BASE, name: "CSS", keywords: GENERIC_KW, block: ["/*", "*/"] }, []],
  ["sql", { ...BASE, name: "SQL", keywords: GENERIC_KW, line: ["--"], block: ["/*", "*/"] }, []],
  ["xml", { ...BASE, name: "XML", scan: "markup" }, ["svg", "xsd", "xsl", "plist"]],
  ["html", { ...BASE, name: "HTML", scan: "markup" }, ["htm", "xhtml"]],
  [
    "json",
    { ...BASE, ...C_COMMENTS, name: "JSON", keywords: LITERALS, keys: "json" },
    ["jsonc", "json5", "geojson"],
  ],
  [
    "yaml",
    {
      ...BASE,
      name: "YAML",
      keywords: LITERALS,
      line: ["#"],
      wordHash: true,
      wordQuote: true,
      keys: "yaml",
    },
    ["yml"],
  ],
  ["diff", { ...BASE, name: "Diff", scan: "diff" }, ["patch"]],
  ["md", { ...BASE, name: "Markdown", scan: "plain" }, ["markdown", "mdx"]],
];

const GRAMMARS: ReadonlyMap<string, Grammar> = new Map(TABLE.map(([key, g]) => [key, g]));

const NAMES: ReadonlyMap<string, string> = new Map(
  TABLE.flatMap(([key, , names]) => [key, ...names].map((n): [string, string] => [n, key])),
);

/**
 * The language a fence tag (`go`, `TypeScript`), an extension or a path
 * (`src/main.rs`, `build/Dockerfile`) names, as a key the other functions
 * take; "" when nothing matches.
 */
export function resolveLanguage(hint: string): string {
  const s = hint.trim().toLowerCase();
  const named = NAMES.get(s);
  if (named !== undefined) {
    return named;
  }
  const base = s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")) + 1);
  if (base === "dockerfile" || base.startsWith("dockerfile.") || base === "containerfile") {
    return "docker";
  }
  // A dotfile's leading dot names the file, not an extension.
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : (NAMES.get(base.slice(dot + 1)) ?? "");
}

/** The display name of the language `lang` resolves to ("TypeScript" for `ts`); "" when none. */
export function languageName(lang: string): string {
  return grammarOf(lang)?.name ?? "";
}

/** @internal The grammar `lang` resolves to, if any. */
export function grammarOf(lang: string): Grammar | undefined {
  return GRAMMARS.get(resolveLanguage(lang));
}
