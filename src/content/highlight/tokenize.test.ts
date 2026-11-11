import { describe, expect, it } from "vitest";

import { TOKEN_KINDS, runs, tokenize } from "./highlight.js";
import type { TokenKind } from "./highlight.js";

/** The coloured tokens, uncoloured text left out. */
function coloured(code: string, lang: string): [TokenKind, string][] {
  return tokenize(code, lang).flatMap((t) =>
    t.kind === null ? [] : [[t.kind, t.text] as [TokenKind, string]],
  );
}

const ofKind = (code: string, lang: string, kind: TokenKind): string[] =>
  coloured(code, lang)
    .filter(([k]) => k === kind)
    .map(([, text]) => text);

describe("tokenize per language", () => {
  it.each<[string, string, string, [TokenKind, string][]]>([
    [
      "Go: keywords, number, punctuation",
      "go",
      "func main() { return 42 }",
      [
        ["keyword", "func"],
        ["punctuation", "("],
        ["punctuation", ")"],
        ["punctuation", "{"],
        ["keyword", "return"],
        ["number", "42"],
        ["punctuation", "}"],
      ],
    ],
    [
      "TypeScript: a keyword, a string, punctuation",
      "ts",
      'const x: string = "hello";',
      [
        ["keyword", "const"],
        ["punctuation", ":"],
        ["punctuation", "="],
        ["string", '"hello"'],
        ["punctuation", ";"],
      ],
    ],
    [
      "JavaScript: a number and a line comment",
      "js",
      "let n = 3.14; // pi",
      [
        ["keyword", "let"],
        ["punctuation", "="],
        ["number", "3.14"],
        ["punctuation", ";"],
        ["comment", "// pi"],
      ],
    ],
    [
      "Python: def and a hash comment",
      "py",
      "def foo(): # comment",
      [
        ["keyword", "def"],
        ["punctuation", "("],
        ["punctuation", ")"],
        ["punctuation", ":"],
        ["comment", "# comment"],
      ],
    ],
    [
      "Shell: export, equals, a string",
      "sh",
      'export PATH="/usr/bin"',
      [
        ["keyword", "export"],
        ["punctuation", "="],
        ["string", '"/usr/bin"'],
      ],
    ],
    [
      "YAML: a key, a string, a comment",
      "yaml",
      'key: "value" # comment',
      [
        ["key", "key"],
        ["punctuation", ":"],
        ["string", '"value"'],
        ["comment", "# comment"],
      ],
    ],
    [
      "JSON: a key and a number",
      "json",
      '{"count": 10}',
      [
        ["punctuation", "{"],
        ["key", '"count"'],
        ["punctuation", ":"],
        ["number", "10"],
        ["punctuation", "}"],
      ],
    ],
    [
      "CSS: punctuation and a block comment",
      "css",
      ".cls { color: red; } /* c */",
      [
        ["punctuation", "."],
        ["punctuation", "{"],
        ["punctuation", ":"],
        ["punctuation", ";"],
        ["punctuation", "}"],
        ["comment", "/* c */"],
      ],
    ],
    [
      "Dockerfile: a comment and an instruction",
      "docker",
      "# install deps\nRUN npm ci",
      [
        ["comment", "# install deps"],
        ["keyword", "RUN"],
      ],
    ],
    [
      "TOML: a comment, equals, a number",
      "toml",
      "# config\nport = 8080",
      [
        ["comment", "# config"],
        ["punctuation", "="],
        ["number", "8080"],
      ],
    ],
    [
      "Rust: fn and let",
      "rs",
      "fn main() { let x = 5; }",
      [
        ["keyword", "fn"],
        ["punctuation", "("],
        ["punctuation", ")"],
        ["punctuation", "{"],
        ["keyword", "let"],
        ["punctuation", "="],
        ["number", "5"],
        ["punctuation", ";"],
        ["punctuation", "}"],
      ],
    ],
    [
      "Ruby: def, end and a hash comment",
      "rb",
      "def hi # greet\nend",
      [
        ["keyword", "def"],
        ["comment", "# greet"],
        ["keyword", "end"],
      ],
    ],
    [
      "C: types are keywords",
      "c",
      "int main(void) { return 0; }",
      [
        ["keyword", "int"],
        ["punctuation", "("],
        ["keyword", "void"],
        ["punctuation", ")"],
        ["punctuation", "{"],
        ["keyword", "return"],
        ["number", "0"],
        ["punctuation", ";"],
        ["punctuation", "}"],
      ],
    ],
    [
      "C++: class and namespace on top of C",
      "cpp",
      "namespace a { class B; }",
      [
        ["keyword", "namespace"],
        ["punctuation", "{"],
        ["keyword", "class"],
        ["punctuation", ";"],
        ["punctuation", "}"],
      ],
    ],
    [
      "SQL: a double-dash comment",
      "sql",
      "x = 1 -- one",
      [
        ["punctuation", "="],
        ["number", "1"],
        ["comment", "-- one"],
      ],
    ],
  ])("%s", (_desc, lang, input, want) => {
    expect(coloured(input, lang)).toEqual(want);
  });
});

describe("tokenize's output", () => {
  it("gives back the text when joined, with uncoloured runs merged", () => {
    const tokens = tokenize("a b c = 1", "go");
    expect(tokens.map((t) => t.text).join("")).toBe("a b c = 1");
    expect(tokens[0]).toEqual({ kind: null, text: "a b c " });
  });

  it("gives no token for empty text", () => {
    expect(tokenize("", "go")).toEqual([]);
  });

  it("gives one uncoloured token for an unknown language", () => {
    const input = '<script>alert("x")</script>';
    expect(tokenize(input, "unknownlang")).toEqual([{ kind: null, text: input }]);
  });

  it("leaves markdown as prose, its English words uncoloured", () => {
    expect(tokenize("if you want", "md")).toEqual([{ kind: null, text: "if you want" }]);
  });

  it("resolves its language argument as a tag, an extension or a path", () => {
    const want: [TokenKind, string][] = [["keyword", "func"]];
    expect(coloured("func", "golang")).toEqual(want);
    expect(coloured("func", "MAIN.GO")).toEqual(want);
    expect(coloured("func", "cmd/x/main.go")).toEqual(want);
  });

  it("colours a Dockerfile named by its path", () => {
    expect(coloured("RUN x", "build/Dockerfile")).toEqual([["keyword", "RUN"]]);
  });
});

describe("strings", () => {
  it("opens no string at a backtick where the language has none", () => {
    const code = "x = 1  # a `word` in a comment\ny = 2";
    expect(ofKind(code, "py", "string")).toEqual([]);
    expect(ofKind(code, "py", "number")).toEqual(["1", "2"]);
  });

  it("reads Go's backtick raw string, which takes no escapes", () => {
    expect(ofKind("s := `raw`", "go", "string")).toEqual(["`raw`"]);
    expect(ofKind("`a\\`b`", "go", "string")).toEqual(["`a\\`", "`"]);
  });

  it("reads a JavaScript template across lines, with its escapes", () => {
    expect(ofKind("`a ${b}\n\\` c`", "js", "string")).toEqual(["`a ${b}\n\\` c`"]);
  });

  it("keeps an escaped quote inside its string", () => {
    expect(ofKind(String.raw`"hello \"world\""`, "go", "string")).toEqual([
      String.raw`"hello \"world\""`,
    ]);
  });

  it("reads a single-quoted string", () => {
    expect(ofKind("'hello'", "py", "string")).toEqual(["'hello'"]);
    expect(ofKind(" 'a'", "py", "string")).toEqual(["'a'"]);
  });

  it("ends an unclosed string at its line, so the next line still colours", () => {
    expect(coloured("x = 'open\ny = 2", "js")).toEqual([
      ["punctuation", "="],
      ["string", "'open"],
      ["punctuation", "="],
      ["number", "2"],
    ]);
  });

  it("lets a shell string span lines, and takes no escape in single quotes", () => {
    expect(ofKind('echo "a\nb"', "sh", "string")).toEqual(['"a\nb"']);
    expect(ofKind("echo 'a\\' b", "sh", "string")).toEqual(["'a\\'"]);
  });

  it("reads Python's triple-quoted strings across lines", () => {
    expect(ofKind('s = """a\n"b"\n"""', "py", "string")).toEqual(['"""a\n"b"\n"""']);
    expect(ofKind("s = '''x'''", "py", "string")).toEqual(["'''x'''"]);
  });

  it("reads a Rust char literal, and leaves a lifetime as text", () => {
    expect(ofKind("let c = 'x'; let n = '\\n'; let u = '\\u{1F600}';", "rs", "string")).toEqual([
      "'x'",
      "'\\n'",
      "'\\u{1F600}'",
    ]);
    expect(ofKind("fn f<'a>(x: &'a str) {}", "rs", "string")).toEqual([]);
    expect(ofKind("let e = '😀';", "rs", "string")).toEqual(["'😀'"]);
  });

  it("reads an apostrophe inside a YAML word as text", () => {
    expect(ofKind("note: it's fine\nb: 'q'", "yaml", "string")).toEqual(["'q'"]);
  });
});

describe("numbers", () => {
  it("reads 1-2 as two numbers", () => {
    expect(ofKind("1-2", "go", "number")).toEqual(["1", "2"]);
  });

  it("binds an exponent's sign to its number", () => {
    expect(ofKind("x = 1e-5 + 2E+3", "go", "number")).toEqual(["1e-5", "2E+3"]);
  });

  it("reads radix literals", () => {
    expect(ofKind("0xFF 0b1010 0o777 0x1f_ff", "rs", "number")).toEqual([
      "0xFF",
      "0b1010",
      "0o777",
      "0x1f_ff",
    ]);
  });

  it("reads a leading dot as part of the number", () => {
    expect(ofKind(".5", "go", "number")).toEqual([".5"]);
  });

  it("takes hex digits only after 0x", () => {
    expect(tokenize("1x2", "go")).toEqual([
      { kind: "number", text: "1" },
      { kind: null, text: "x2" },
    ]);
    expect(ofKind("12abc", "go", "number")).toEqual(["12"]);
  });

  it("ends a number at whitespace", () => {
    expect(ofKind("1e x", "go", "number")).toEqual(["1e"]);
  });
});

describe("identifiers and keywords", () => {
  it.each(["A1", "Z1", "a1", "z1", "_1", "$1", "x0", "x9"])(
    "reads %s as one uncoloured identifier",
    (word) => {
      expect(tokenize(word, "go")).toEqual([{ kind: null, text: word }]);
    },
  );

  it("colours Python's and Rust's capitalised keywords", () => {
    expect(coloured("None", "py")).toEqual([["keyword", "None"]]);
    expect(coloured("Err", "rs")).toEqual([["keyword", "Err"]]);
  });

  it("finds no keyword inside a word of another script", () => {
    expect(ofKind("éif ifé if", "js", "keyword")).toEqual(["if"]);
  });

  it("does not colour a word that only an object's prototype holds", () => {
    expect(ofKind("constructor toString __proto__ hasOwnProperty", "js", "keyword")).toEqual([]);
  });

  it("matches Dockerfile instructions as written, uppercase", () => {
    expect(ofKind("FROM x\nrun y", "docker", "keyword")).toEqual(["FROM"]);
  });

  it("does not let a character outside the grammar swallow the next token", () => {
    expect(coloured("#if", "go")).toEqual([["keyword", "if"]]);
  });
});

describe("comments", () => {
  it("treats a lone slash and a star between operands as punctuation", () => {
    expect(coloured("a / b * c", "go")).toEqual([
      ["punctuation", "/"],
      ["punctuation", "*"],
    ]);
  });

  it("ends a line comment at the newline", () => {
    expect(tokenize("// c\nx", "go")).toEqual([
      { kind: "comment", text: "// c" },
      { kind: null, text: "\nx" },
    ]);
  });

  it("ends a block comment at its terminator, or runs an unclosed one to the end", () => {
    expect(ofKind("x /* c */ 1", "go", "comment")).toEqual(["/* c */"]);
    expect(ofKind("x /* oops", "go", "comment")).toEqual(["/* oops"]);
  });

  it("does not close a block comment on its own opener", () => {
    expect(ofKind("/*/ x */", "go", "comment")).toEqual(["/*/ x */"]);
  });

  it("does not treat # as a comment in Go", () => {
    expect(ofKind("# c", "go", "comment")).toEqual([]);
  });

  it("reads Python's // as floor division", () => {
    expect(coloured("a // b", "py")).toEqual([
      ["punctuation", "/"],
      ["punctuation", "/"],
    ]);
  });

  it("opens a shell comment only at a word's start", () => {
    expect(ofKind("#!/bin/sh\necho $# a#b # c", "sh", "comment")).toEqual(["#!/bin/sh", "# c"]);
    expect(ofKind("curl https://x/y", "sh", "comment")).toEqual([]);
  });

  it("keeps a YAML URL's fragment out of a comment", () => {
    expect(ofKind("url: http://a/#x # c", "yaml", "comment")).toEqual(["# c"]);
  });

  it("allows comments in JSON, as jsonc does", () => {
    expect(ofKind('{"a": 1 // one\n}', "jsonc", "comment")).toEqual(["// one"]);
  });
});

describe("keys", () => {
  it("colours a JSON key and leaves a value a string", () => {
    expect(coloured('{"a" : "b", "c": ["d"]}', "json")).toEqual([
      ["punctuation", "{"],
      ["key", '"a"'],
      ["punctuation", ":"],
      ["string", '"b"'],
      ["punctuation", ","],
      ["key", '"c"'],
      ["punctuation", ":"],
      ["punctuation", "["],
      ["string", '"d"'],
      ["punctuation", "]"],
      ["punctuation", "}"],
    ]);
  });

  it("colours JSON's literals as keywords", () => {
    expect(ofKind('{"a": true, "b": null}', "json", "keyword")).toEqual(["true", "null"]);
  });

  it("colours YAML keys after an indent and sequence markers", () => {
    const code = "name: x\n  nested: 1\n- item: y\n- - deep: z\n\"quoted key\": 2\n'single': 3";
    expect(ofKind(code, "yaml", "key")).toEqual([
      "name",
      "nested",
      "item",
      "deep",
      '"quoted key"',
      "'single'",
    ]);
    expect(ofKind("- a\n- b: c", "yaml", "punctuation")).toEqual(["-", "-", ":"]);
  });

  it("needs a space or a line end after a YAML key's colon", () => {
    expect(ofKind("a:b\nurl: http://x\nlast:", "yaml", "key")).toEqual(["url", "last"]);
  });

  it("colours no YAML key at a document marker or a comment line", () => {
    expect(ofKind("---\n# k: v\n", "yaml", "key")).toEqual([]);
  });
});

describe("markup", () => {
  it("colours tag names and attribute values, never the prose between tags", () => {
    expect(coloured('<p class="x">if you can\'t</p>', "html")).toEqual([
      ["punctuation", "<"],
      ["keyword", "p"],
      ["punctuation", "="],
      ["string", '"x"'],
      ["punctuation", ">"],
      ["punctuation", "</"],
      ["keyword", "p"],
      ["punctuation", ">"],
    ]);
  });

  it("reads comments, declarations and processing instructions", () => {
    expect(coloured('<?xml version="1.0"?><!-- c --><!DOCTYPE a>', "xml")).toEqual([
      ["punctuation", "<?"],
      ["keyword", "xml"],
      ["punctuation", "="],
      ["string", '"1.0"'],
      ["punctuation", "?"],
      ["punctuation", ">"],
      ["comment", "<!-- c -->"],
      ["punctuation", "<!"],
      ["keyword", "DOCTYPE"],
      ["punctuation", ">"],
    ]);
  });

  it("leaves a lone < as text", () => {
    expect(coloured("a < b", "html")).toEqual([]);
  });

  it("runs an unclosed comment, tag or value to the end", () => {
    expect(ofKind("<!-- open", "html", "comment")).toEqual(["<!-- open"]);
    expect(ofKind('<a href="x', "html", "string")).toEqual(['"x']);
  });

  it("reads a namespaced tag name whole", () => {
    expect(ofKind("<svg:rect/>", "svg", "keyword")).toEqual(["svg:rect"]);
  });
});

describe("diff", () => {
  it("colours whole lines, file headers before the first hunk only", () => {
    const code = [
      "diff --git a/x b/x",
      "index 1..2 100644",
      "--- a/x",
      "+++ b/x",
      "@@ -1,2 +1,2 @@ fn",
      " same",
      "-old",
      "--- a removed SQL comment",
      "+new",
      "\\ No newline at end of file",
    ].join("\n");
    expect(coloured(code, "diff")).toEqual([
      ["comment", "diff --git a/x b/x"],
      ["comment", "index 1..2 100644"],
      ["comment", "--- a/x"],
      ["comment", "+++ b/x"],
      ["keyword", "@@ -1,2 +1,2 @@ fn"],
      ["deleted", "-old"],
      ["deleted", "--- a removed SQL comment"],
      ["inserted", "+new"],
      ["comment", "\\ No newline at end of file"],
    ]);
  });

  it("colours a bare run of changed lines with no headers", () => {
    expect(coloured("-a\n+b\n", "patch")).toEqual([
      ["deleted", "-a"],
      ["inserted", "+b"],
    ]);
  });

  it("keeps each line's newline outside its token", () => {
    expect(tokenize("+a\n", "diff")).toEqual([
      { kind: "inserted", text: "+a" },
      { kind: null, text: "\n" },
    ]);
  });
});

describe("the punctuation table", () => {
  it.each([..."{}()[];,.:!&|<>=+-*/%^~?@"])("tokenizes %s as punctuation", (ch) => {
    expect(tokenize(ch, "go")).toEqual([{ kind: "punctuation", text: ch }]);
  });

  it.each([..."\\#"])("leaves %s as uncoloured text", (ch) => {
    expect(tokenize(ch, "go")).toEqual([{ kind: null, text: ch }]);
  });
});

describe("runs", () => {
  it("gives the coloured tokens' offsets and kinds", () => {
    const r = runs('x := "s" // c', "go");
    expect(r).not.toBeNull();
    expect(Array.from(r?.starts ?? [])).toEqual([2, 3, 5, 9]);
    expect(Array.from(r?.ends ?? [])).toEqual([3, 4, 8, 13]);
    expect(Array.from(r?.kinds ?? [], (k) => TOKEN_KINDS[k])).toEqual([
      "punctuation",
      "punctuation",
      "string",
      "comment",
    ]);
  });

  it("indexes the kinds in their published order", () => {
    expect(TOKEN_KINDS).toEqual([
      "keyword",
      "string",
      "comment",
      "number",
      "punctuation",
      "key",
      "inserted",
      "deleted",
    ]);
    const r = runs("+a\n-b", "diff");
    expect(Array.from(r?.kinds ?? [])).toEqual([6, 7]);
  });

  it("is null for a language with no colouring", () => {
    expect(runs("x", "md")).toBeNull();
    expect(runs("x", "")).toBeNull();
    expect(runs("x", "nonsense")).toBeNull();
  });

  it("is empty, not null, for a coloured language's empty text", () => {
    expect(Array.from(runs("", "go")?.starts ?? [-1])).toEqual([]);
  });
});
