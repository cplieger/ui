/**
 * detect.ts — the language an untagged code block is written in, read from
 * its first lines, with no DOM.
 * @module
 */

/** One shape a line can take, the language it points to, and how much it counts. */
type Signal = readonly [lang: string, weight: number, pattern: RegExp];

const SHELL_COMMANDS =
  "sudo|apt|apt-get|brew|npm|npx|pnpm|yarn|pip|pip3|uv|git|cd|ls|mkdir|rm|cp|mv|curl|wget|docker|kubectl|make|cargo|go|export|echo|chmod|chown|systemctl|cat|grep|ssh|tar|source";

// Patterns run on lines cut to LINE_CAP, so no backtracking reads past it.
const SIGNALS: readonly Signal[] = [
  ["go", 3, /^package [a-z_]\w*\s*$/],
  ["go", 3, /^func (?:\(\w+ \*?\w+\) )?\w+(?:\[[^\]]*\])?\(/],
  ["go", 2, /^import (?:\(|"[\w./-]+")\s*$/],
  ["go", 3, /^type \w+ (?:struct|interface) \{/],
  ["go", 1, /\w := /],
  ["py", 3, /^\s*(?:async )?def \w+\(.*\)(?: -> [^:]+)?:\s*(?:#.*)?$/],
  ["py", 3, /^\s*class \w+(?:\([\w., ]*\))?:\s*$/],
  ["py", 2, /^(?:import [\w.]+(?: as \w+)?(?:, [\w.]+)*|from [\w.]+ import [\w*, ()]+)\s*$/],
  ["py", 3, /^if __name__ == ["']__main__["']:/],
  ["py", 1, /^\s*(?:elif .+|except(?: \w+(?: as \w+)?)?|else|try|finally):\s*$/],
  ["rs", 3, /^\s*(?:pub(?:\(\w+\))? )?(?:async )?fn \w+(?:<[^>]*>)?\(/],
  ["rs", 2, /\blet mut \w+(?:: [^=]+)? = /],
  ["rs", 2, /^use (?:std|crate|super|self)::/],
  ["rs", 2, /^impl(?:<[^>]*>)? \w+/],
  ["rs", 2, /\b(?:println|vec|format)!\(/],
  ["js", 1, /\) => |\w => /],
  ["js", 2, /^\s*(?:export )?(?:const|let) \w+ = /],
  ["js", 3, /^\s*(?:export )?(?:async )?function\*? ?\w*\(/],
  ["js", 3, /^import .+ from ["'][^"']+["'];?\s*$/],
  ["js", 2, /^export (?:default|class) /],
  ["js", 2, /\bconsole\.\w+\(/],
  ["js", 2, /\brequire\(["'][^"']+["']\)/],
  ["ts", 3, /^\s*(?:export )?(?:interface \w+(?:<[^>]*>)? \{|type \w+(?:<[^>]*>)? = )/],
  ["ts", 2, /\b\w+\??: (?:string|number|boolean|unknown|void)\b/],
  ["sh", 3, /^\$ \S/],
  // A known command with at most two words after it, or with a flag, a path, a pipe, `&&` or an
  // assignment; a line that ends in sentence punctuation is prose.
  [
    "sh",
    1,
    new RegExp(
      String.raw`^(?!.*[.,:;!?]$)(?:${SHELL_COMMANDS})(?:(?: \S+){0,2}$| .*(?: -{1,2}\w| \S*/| \||&&|\w=))`,
    ),
  ],
  ["sh", 2, /^[^|].* \| ?(?:grep|sed|awk|xargs|sort|head|tail|jq|wc)\b/],
  ["diff", 5, /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/],
  ["diff", 5, /^diff --git /],
  ["diff", 2, /^(?:---|\+\+\+) [ab]?\/?\S/],
];

const DOCKER_INSTRUCTION = /^(?:RUN|COPY|CMD|ENTRYPOINT|WORKDIR|ENV|EXPOSE|ARG|ADD|USER|LABEL) \S/;

const SHEBANG: ReadonlyMap<string, string> = new Map([
  ["sh", "sh"],
  ["bash", "sh"],
  ["zsh", "sh"],
  ["ksh", "sh"],
  ["dash", "sh"],
  ["python", "py"],
  ["python3", "py"],
  ["node", "js"],
  ["deno", "ts"],
  ["bun", "ts"],
  ["ruby", "rb"],
]);

/** The best score a language must reach; one strong line, or several weak ones. */
const FLOOR = 3;
const LINE_LIMIT = 40;
const LINE_CAP = 400;
const HEAD_CAP = 8192;

/**
 * The language `code` reads as, as a key `tokenize` takes, or "" when no
 * language scores the floor or two tie for it. Prose, a list of paths and a
 * markdown table give "", since a wrong colour is worse than none.
 */
export function detectLanguage(code: string): string {
  const text = code.trim();
  if (text === "") {
    return "";
  }
  if (isJson(text)) {
    return "json";
  }
  const lines = text
    .slice(0, HEAD_CAP)
    .split("\n", LINE_LIMIT)
    .map((l) => l.slice(0, LINE_CAP).trimEnd());
  const first = lines[0] ?? "";
  if (first.startsWith("#!")) {
    const lang = shebang(first);
    if (lang !== "") {
      return lang;
    }
  }
  const scores = new Map<string, number>();
  const add = (lang: string, n: number): void => {
    scores.set(lang, (scores.get(lang) ?? 0) + n);
  };
  for (const line of lines) {
    for (const [lang, weight, pattern] of SIGNALS) {
      if (pattern.test(line)) {
        add(lang, weight);
      }
    }
  }
  // Every Dockerfile opens on FROM, so instructions count only under one.
  if (/^FROM [\w./:@${}-]+(?: AS \w[\w.-]*)?$/.test(firstInstruction(lines))) {
    add("docker", 3 + lines.filter((l) => DOCKER_INSTRUCTION.test(l)).length);
  }
  if (isYaml(lines)) {
    add("yaml", FLOOR);
  }
  // TypeScript's lines are JavaScript plus its own, so any of its own makes the text TypeScript.
  const ts = scores.get("ts") ?? 0;
  if (ts > 0) {
    scores.set("ts", ts + (scores.get("js") ?? 0));
    scores.delete("js");
  }
  return best(scores);
}

function best(scores: ReadonlyMap<string, number>): string {
  let top = "";
  let high = 0;
  let tie = false;
  for (const [lang, score] of scores) {
    if (score > high) {
      [top, high, tie] = [lang, score, false];
    } else if (score === high) {
      tie = true;
    }
  }
  return high < FLOOR || tie ? "" : top;
}

/** Only an object or an array counts, so a lone number or string stays plain. */
function isJson(text: string): boolean {
  const open = text.charAt(0);
  const close = text.charAt(text.length - 1);
  if (!((open === "{" && close === "}") || (open === "[" && close === "]"))) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function shebang(line: string): string {
  const m = /^#!\s*(?:\S*\/)?([\w.-]+)(?:\s+(?:-\S+\s+)*([\w.-]+))?/.exec(line);
  if (m === null) {
    return "";
  }
  // `#!/usr/bin/env python3` names its interpreter second.
  const name = m[1] === "env" ? (m[2] ?? "") : (m[1] ?? "");
  return SHEBANG.get(name.replace(/[\d.]+$/, "")) ?? SHEBANG.get(name) ?? "";
}

/** The first line past comments and the `ARG`s a `FROM` may read. */
function firstInstruction(lines: readonly string[]): string {
  return lines.find((l) => l.trim() !== "" && !l.startsWith("#") && !l.startsWith("ARG ")) ?? "";
}

const YAML_KEY = /^(?:- )?[\w.-]+:(?: |$)/;
const YAML_ITEM = /^- \S/;

/**
 * Every unindented line is a key, an item, a comment or a document marker,
 * with two keys at least, or one under a `---`; a line that reads as a
 * sentence (a capital or three words, then an end mark) ends the read, so a
 * run of "Note: ..." lines stays prose.
 */
function isYaml(lines: readonly string[]): boolean {
  let keys = 0;
  for (const line of lines) {
    if (line.trim() === "" || /^[ \t]/.test(line) || line.startsWith("#")) {
      continue;
    }
    if (/[.!?]$/.test(line) && (/^[A-Z]/.test(line) || /\s\S+\s\S+\s/.test(line))) {
      return false;
    }
    if (YAML_KEY.test(line)) {
      keys++;
    } else if (!(YAML_ITEM.test(line) || line === "---" || line === "...")) {
      return false;
    }
  }
  return keys >= 2 || (keys === 1 && lines[0] === "---");
}
