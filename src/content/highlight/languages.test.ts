import { describe, expect, it } from "vitest";

import { languageName, resolveLanguage, runs, tokenize } from "./highlight.js";

describe("resolveLanguage", () => {
  it.each([
    // Fence tags and their aliases.
    ["go", "go"],
    ["golang", "go"],
    ["javascript", "js"],
    ["typescript", "ts"],
    ["python", "py"],
    ["shell", "sh"],
    ["bash", "sh"],
    ["zsh", "sh"],
    ["rust", "rs"],
    ["ruby", "rb"],
    ["c", "c"],
    ["c++", "cpp"],
    ["cplusplus", "cpp"],
    ["docker", "docker"],
    ["dockerfile", "docker"],
    ["Dockerfile", "docker"],
    ["php", "php"],
    ["java", "java"],
    ["toml", "toml"],
    ["xml", "xml"],
    ["html", "html"],
    ["css", "css"],
    ["sql", "sql"],
    ["json", "json"],
    ["jsonc", "json"],
    ["yaml", "yaml"],
    ["yml", "yaml"],
    ["diff", "diff"],
    ["patch", "diff"],
    ["markdown", "md"],
    ["  Go  ", "go"],
    ["TypeScript", "ts"],
    ["", ""],
    ["nonexistent", ""],
    ["text", ""],
  ])("resolves the tag %j to %j", (hint, want) => {
    expect(resolveLanguage(hint)).toBe(want);
  });

  it.each([
    ["main.go", "go"],
    ["app.ts", "ts"],
    ["app.tsx", "ts"],
    ["index.js", "js"],
    ["index.jsx", "js"],
    ["index.mjs", "js"],
    ["script.py", "py"],
    ["run.sh", "sh"],
    ["config.yaml", "yaml"],
    ["config.yml", "yaml"],
    ["data.json", "json"],
    ["style.css", "css"],
    ["page.html", "html"],
    ["page.htm", "html"],
    ["config.toml", "toml"],
    ["lib.rs", "rs"],
    ["main.c", "c"],
    ["main.h", "c"],
    ["main.cpp", "cpp"],
    ["App.java", "java"],
    ["script.rb", "rb"],
    ["index.php", "php"],
    ["query.sql", "sql"],
    ["MAIN.GO", "go"],
    ["internal/git/exec.go", "go"],
    ["/workspace/app/static-src/diff.ts", "ts"],
    ["C:\\src\\main.rs", "rs"],
    ["unknown.xyz", ""],
    ["notes/todo.zzz", ""],
    [".gitignore", ""],
    ["v1.2/README", ""],
  ])("resolves the path %j to %j", (hint, want) => {
    expect(resolveLanguage(hint)).toBe(want);
  });

  it.each([
    ["Dockerfile", "docker"],
    ["build/Dockerfile", "docker"],
    ["Dockerfile.prod", "docker"],
    ["deploy/Containerfile", "docker"],
    ["app.dockerfile", "docker"],
  ])("resolves %j by its basename to %j", (hint, want) => {
    expect(resolveLanguage(hint)).toBe(want);
  });
});

describe("languageName", () => {
  it.each([
    ["go", "Go"],
    ["ts", "TypeScript"],
    ["javascript", "JavaScript"],
    ["py", "Python"],
    ["bash", "Shell"],
    ["rust", "Rust"],
    ["rb", "Ruby"],
    ["c", "C"],
    ["c++", "C++"],
    ["Dockerfile", "Dockerfile"],
    ["php", "PHP"],
    ["java", "Java"],
    ["toml", "TOML"],
    ["xml", "XML"],
    ["html", "HTML"],
    ["css", "CSS"],
    ["sql", "SQL"],
    ["json", "JSON"],
    ["yml", "YAML"],
    ["diff", "Diff"],
    ["md", "Markdown"],
    ["src/main.go", "Go"],
    ["nonsense", ""],
    ["", ""],
  ])("names %j %j", (hint, want) => {
    expect(languageName(hint)).toBe(want);
  });
});

describe("lookups read only the table's own entries", () => {
  const inherited = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

  it.each(inherited)("resolves %j, and a file with it as extension, to nothing", (name) => {
    expect(resolveLanguage(name)).toBe("");
    expect(resolveLanguage(`a.${name}`)).toBe("");
    expect(languageName(name)).toBe("");
  });

  it.each(inherited)("colours nothing in a language named %j", (name) => {
    expect(tokenize("func x", name)).toEqual([{ kind: null, text: "func x" }]);
    expect(runs("func x", name)).toBeNull();
  });
});
