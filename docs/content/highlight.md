# highlight

`@cplieger/ui/highlight`

Source text coloured by language. The tokenizer, language resolution and detection take no DOM and run in a worker. `highlightInto` writes the tokens into an element as text nodes inside spans, so no text in the source can become an element. [markdown](markdown.md) calls it for each code block, and a file view or a diff can call it alone.

```html
<pre><code id="file"></code></pre>
```

```ts
import { highlightInto, resolveLanguage } from "@cplieger/ui/highlight";

highlightInto(fileCode, source, resolveLanguage("src/main.go"));
highlightInto(rowCode, line, "ts", { marks: [{ start: 6, end: 11 }], markClass: "changed" });
```

## API

| Function | What it does |
| --- | --- |
| `tokenize(code, lang)` | Splits `code` into `{ kind, text }` tokens, `kind` being `null` for uncoloured text. The texts joined give back `code`. |
| `runs(code, lang)` | The coloured tokens as offsets: `starts`, `ends` and `kinds`, each kind an index into `TOKEN_KINDS`. `null` for a language with no colouring. A row renderer colours any slice with them without tokenizing again. |
| `resolveLanguage(hint)` | The language a fence tag (`golang`), an extension (`rs`) or a path (`build/Dockerfile`) names, as a key the other functions take. `""` when nothing matches. |
| `languageName(lang)` | The language's display name, such as "TypeScript" for `ts`. `""` when none. |
| `detectLanguage(code)` | The language untagged code reads as, or `""`, as [Detection](#detection) describes. |
| `highlightInto(el, code, lang, options)` | Replaces `el`'s children with `code`, each coloured token in a `span[data-token]`. |

- Every function that takes `lang` resolves it first, so `"go"`, `"golang"` and `"main.go"` agree. An unknown or empty `lang` gives uncoloured text.
- `TOKEN_KINDS` is `keyword`, `string`, `comment`, `number`, `punctuation`, `key`, `inserted` and `deleted`, in that order.
- `marks` are half-open ranges of offsets, ascending and not overlapping, such as a diff's changed words. A token a mark's edge crosses is split, each piece keeping its kind. A marked piece is a `span[data-mark]`, with `markClass` as its class when given. Empty ranges are ignored.
- `highlightInto` builds with the element's own document, so it can colour an element in another frame.

## Languages

| Key | Name | Also named |
| --- | --- | --- |
| `go` | Go | `golang`, `mod` |
| `ts` | TypeScript | `typescript`, `tsx`, `mts`, `cts` |
| `js` | JavaScript | `javascript`, `jsx`, `mjs`, `cjs`, `node` |
| `py` | Python | `python`, `python3`, `py3` |
| `sh` | Shell | `shell`, `bash`, `zsh`, `ksh` |
| `rs` | Rust | `rust` |
| `rb` | Ruby | `ruby` |
| `c` | C | `h` |
| `cpp` | C++ | `c++`, `cplusplus`, `cc`, `cxx`, `hpp`, `hh`, `hxx` |
| `docker` | Dockerfile | `dockerfile`, `containerfile`, and a file named `Dockerfile`, `Dockerfile.*` or `Containerfile` |
| `php`, `java`, `toml`, `css`, `sql` | PHP, Java, TOML, CSS, SQL | |
| `xml` | XML | `svg`, `xsd`, `xsl`, `plist` |
| `html` | HTML | `htm`, `xhtml` |
| `json` | JSON | `jsonc`, `json5`, `geojson` |
| `yaml` | YAML | `yml` |
| `diff` | Diff | `patch` |
| `md` | Markdown | `markdown`, `mdx`, left uncoloured |

- Each language takes its own comments: `//` and `/* */` where it has them, `#` in Python, shell, Ruby, YAML, TOML, Dockerfile and PHP, and `--` in SQL. A URL in a shell or YAML block stays text.
- A quoted string ends at its line unless the language lets it span lines, so one apostrophe colours one line, never the rest of the block.
- HTML and XML colour tag names, attribute values and comments, and leave the text between tags alone.
- A diff colours each added line as `inserted` and each removed line as `deleted`, keeping its `+` or `-`. JSON and YAML keys are `key`.
- A lookup by name is own-property only, so a hint such as `constructor` names nothing.

## Detection

`detectLanguage` reads the first 40 lines and scores each language by the shapes its lines take: a shebang, `package` and `func`, `def` with a closing colon, `fn` and `let mut`, `=>` and `const`, a `$` prompt, `FROM` then `RUN`, `---` and `key:` lines, `@@` and `+++`. A whole text that parses as a JSON object or array is JSON. A language needs a score of 3, and two languages tied give `""`, since a wrong colour is worse than none. Prose, a list of paths and a markdown table are never detected as code.

## Colours

The stylesheet, `@cplieger/ui/css/system`, colours `[data-token]` inside `.cp`, a `.cp-code` block, `.cp-prose`, or any element with the `.cp-syntax` class, such as a file view or a diff row in a page that has not opted into `.cp`, with the `--cp-syntax-*` roles in [Colour](../design-colour.md#syntax-colours). A keyword is in medium weight and a comment in italic, so neither leans on colour alone. In forced colours every token takes the system's text colour.
