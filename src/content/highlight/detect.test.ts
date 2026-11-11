import { describe, expect, it } from "vitest";

import { costRatio } from "../test-helpers/cost-ratio.js";
import { detectLanguage, resolveLanguage } from "./highlight.js";

describe("detectLanguage reads a language from its first lines", () => {
  it.each<[string, string, string]>([
    ["a shell shebang", "#!/bin/bash\nset -e\nmain", "sh"],
    ["an env shebang with a version", "#!/usr/bin/env python3\nprint(1)", "py"],
    ["an env shebang with a flag", "#!/usr/bin/env -S deno run\nconsole.log(1)", "ts"],
    ["a node shebang", "#!/usr/bin/env node\nx()", "js"],
    ["a ruby shebang", "#!/usr/bin/ruby\nputs 1", "rb"],
    ["Go's package and func", 'package main\n\nfunc main() {\n\tfmt.Println("hi")\n}', "go"],
    ["a Go method", "func (s *Server) Close() error {\n\treturn nil\n}", "go"],
    ["a Go struct", "type Config struct {\n\tName string\n}", "go"],
    ["a Go generic func", "func Map[T any](xs []T) []T {\n\treturn xs\n}", "go"],
    ["Python's def and closing colon", "def greet(name):\n    return name", "py"],
    ["a Python def with a return type", "def f(x: int) -> int:\n    return x", "py"],
    ["a Python class", "class Point:\n    x: int\n    y: int", "py"],
    ["Python imports", "import os\nfrom pathlib import Path\n\nos.getcwd()", "py"],
    [
      "Rust's fn and let mut",
      'fn main() {\n    let mut v = vec![1];\n    println!("{}", v[0]);\n}',
      "rs",
    ],
    ["a Rust use and impl", "use std::fmt;\n\nimpl fmt::Display for P {}", "rs"],
    ["JavaScript's const and arrow", "const add = (a, b) => a + b;\nconsole.log(add(1, 2));", "js"],
    ["a JavaScript import", 'import { x } from "./x.js";\nexport default x;', "js"],
    ["a CommonJS require", 'const fs = require("fs");', "js"],
    [
      "a TypeScript interface",
      "interface User {\n  name: string;\n}\nconst u: User = load();",
      "ts",
    ],
    ["a TypeScript type alias", 'type Mode = "a" | "b";\nexport const m: Mode = "a";', "ts"],
    ["typed parameters", "export function f(n: number): void {\n  return;\n}", "ts"],
    ["shell prompts", "$ npm install\n$ npm test", "sh"],
    ["shell commands", "cd /srv/app\ngit pull --rebase\nmake build && make install", "sh"],
    ["a pipeline", "cat log.txt | grep error | wc -l", "sh"],
    ["a Dockerfile", "FROM golang:1.27 AS build\nWORKDIR /src\nRUN go build ./...", "docker"],
    ["a Dockerfile with an ARG first", "ARG GO=1.27\nFROM golang:${GO}\nCOPY . .", "docker"],
    ["a Dockerfile under a comment", "# syntax=docker/dockerfile:1\nFROM alpine:3.22", "docker"],
    ["a JSON object", '{\n  "name": "ui",\n  "version": "1.0.0"\n}', "json"],
    ["a JSON array", '[1, 2, {"a": null}]', "json"],
    ["YAML keys", "name: ci\non:\n  push:\n    branches: [main]", "yaml"],
    ["a YAML document", "---\nservices:\n  web:\n    image: caddy", "yaml"],
    ["a YAML sequence of maps", "- name: a\n  value: 1\n- name: b\n  value: 2", "yaml"],
    ["a unified diff", "--- a/x.go\n+++ b/x.go\n@@ -1,2 +1,2 @@\n-a\n+b", "diff"],
    ["a git diff", "diff --git a/x b/x\nindex 1..2 100644", "diff"],
    ["a bare hunk", "@@ -10,3 +10,4 @@ func f() {\n context\n+added", "diff"],
  ])("detects %s", (_name, code, lang) => {
    expect(detectLanguage(code)).toBe(lang);
  });

  it("gives a key every other function takes", () => {
    for (const code of ["package main", "def f():\n  pass", "$ ls", '{"a":1}', "- a: 1\n- b: 2"]) {
      const lang = detectLanguage(code);
      expect(resolveLanguage(lang)).toBe(lang);
    }
  });
});

describe("detectLanguage stays below its floor", () => {
  it.each<[string, string]>([
    ["empty text", ""],
    ["blank lines", "\n  \n\t\n"],
    ["one word", "hello"],
    ["a number", "42"],
    ["a JSON string", '"just a string"'],
    [
      "a prose paragraph",
      "The build failed because the package was missing.\nFor example, import the module from the package first.\nThen run the function again and check the result.",
    ],
    [
      "prose with labels",
      "Note: the cache is cleared on every deploy.\nTip: run it twice if the first pass times out.",
    ],
    [
      "prose with code words",
      "If you define a const, let the function return it.\nmake sure the tests pass.",
    ],
    ["a sentence ending in a colon", "Run these steps in order:"],
    ["a path list", "src/main.go\nsrc/server/http.go\ninternal/store/db.go\nREADME.md"],
    [
      "a dashed path list",
      "- src/content/markdown/parser.ts\n- src/content/highlight/detect.ts\n- docs/content/markdown.md",
    ],
    ["a numbered path list", "1. cmd/app/main.go\n2. internal/config.go"],
    ["a markdown table", "| Name | Size |\n|------|-----:|\n| a.go | 12 |\n| b.go | 40 |"],
    [
      "a table of commands",
      "| Command | Use |\n|---|---|\n| cat a | sort | uniq |\n| ls -la | grep x |",
    ],
    ["a tree listing", ".\n├── go.mod\n└── main.go"],
    ["one Python import", "import os"],
    ["one weak shell line", "git status"],
    ["equal scores for two languages", "package main\ndef f():"],
    ["an unbalanced brace", "{ not json"],
  ])("gives nothing for %s", (_name, code) => {
    expect(detectLanguage(code)).toBe("");
  });

  it("reads only the first lines", () => {
    expect(detectLanguage("plain words\n".repeat(60) + "package main\nfunc main() {}")).toBe("");
  });
});

describe("detectLanguage runs in time linear in its input", () => {
  it.each<[string, (n: number) => string]>([
    ["one long line", (n) => "a".repeat(n)],
    ["one long def line", (n) => "def f(" + ")".repeat(n)],
    ["one long command line", (n) => "git " + "a ".repeat(n / 2)],
    ["many lines", (n) => "x: 1\n".repeat(n / 5)],
    ["an unclosed JSON object", (n) => "{" + '"a":1,'.repeat(n / 6) + "}"],
  ])("detects %s", (_name, generate) => {
    const work = (code: string): void => {
      detectLanguage(code);
    };
    // Sixteen times the input costs about sixteen times the work when linear; the bound sits at 16^1.5.
    expect(costRatio(work, generate(4 * 1024), generate(64 * 1024))).toBeLessThan(64);
  });
});
