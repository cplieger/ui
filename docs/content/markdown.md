# markdown

`@cplieger/ui/markdown`

Markdown that a person did not write, such as an agent's answer or a message body, rendered as the design language's prose. Code blocks are coloured by [highlight](highlight.md) and carry Copy, and wide tables scroll in their own box. No text can produce HTML or script, a navigation to a scheme outside `http:`, `https:` and `mailto:`, or an image fetch the app did not ask for.

```html
<div class="cp-prose" id="answer"></div>
```

```ts
import { createMarkdownStream, renderMarkdown } from "@cplieger/ui/markdown";

renderMarkdown(answer, message.body, { headingLevel: 4, signal: view.signal });

const stream = createMarkdownStream(answer, { base: document.baseURI, signal: view.signal });
events.addEventListener("delta", (e) => stream.write(e.data));
events.addEventListener("done", () => stream.end());
```

- `renderMarkdown` and a stream render after what the host holds. To render again, empty the host first.
- Load the stylesheet, `@cplieger/ui/css/system`, with the `fonts/` and `icons/` folders beside it as the package ships them: it styles the prose, draws the code block's Copy and check icons from `icons/svg/copy.svg` and `check.svg`, and colours the code. Without it the code block shows its Copy button with two empty icons.
- Put `.cp-prose` on the host. The renderer sets no class inside it beyond the code block's and the table region's, so the stylesheet styles every element from outside.
- The markup carries no `style` attribute, so it renders under a `style-src 'self'` policy.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `base` | none | What a relative destination resolves against. Without it, a relative destination is refused. Pass `document.baseURI` to keep the page's own links. |
| `urls` | none | `(url, raw, kind)` runs after the gate for every `href` and `src`, `kind` being `"href"` or `"src"`. Return `false` to refuse. It cannot admit what the gate refused. |
| `withhold` | `payloadShaped` | Which links that leave the page's origin render without `href`, as [Withheld links](#withheld-links) describes. `false` turns it off. |
| `images` | `"link"` | `"link"` renders an image as a link to its source. `"load"` renders an `img`. |
| `hooks` | none | The app's own elements, as [Hooks](#hooks) describes. |
| `maxBytes` | 1 MiB | The text read, in UTF-8 bytes, across every write of a stream. Past it the text is cut at a code point, and one line at the cut says so. |
| `signal` | none | Aborting it lets go of the overflow observers. In a stream it also drops what is queued and runs no further hook; a later write is ignored. |
| `highlight` | on | `false` leaves code blocks uncoloured. |
| `headingLevel` | `1` | The element `#` renders as, 1 to 6. Deeper headings shift by the same amount and stop at `h6`, so text inside a page's own `h3` can start at `h4`. |

A `headingLevel` or `maxBytes` out of range throws a `RangeError`, and a `base` that is not a URL a `TypeError`.

## What renders

| Markdown | Element |
| --- | --- |
| paragraph, heading, blockquote, rule, line break | `p`, `h1` to `h6`, `blockquote`, `hr`, `br` |
| emphasis, strong, strike, inline code | `em`, `strong`, `del`, `code` |
| list, task | `ul`, or `ol` with `start`; a task's box is a disabled `input type="checkbox"` named "Task item" |
| table | `div.cp-table-scroll > table`, each cell's alignment in `data-align="start"`, `"center"` or `"end"`; every body row has the header's cell count, padded with empty cells or cut |
| link, bare URL, email | `a` |
| image | `a`, or `img` in `"load"` mode |
| equation | `code` with `data-math="inline"` or `"block"`, the TeX as its text |
| fenced or indented code | the code block; a fence is three or more backticks or tildes |

Raw HTML in the text is shown as text. A character reference is decoded once, HTML 4.01's named set, and never read again as markup.

### The code block

```html
<div class="cp-code" data-variant="block">
  <div data-part="bar">
    <span data-part="lang">Go</span>
    <div data-part="actions"><button class="cp-button cp-copy" type="button" data-variant="quiet" data-size="sm">…Copy</button></div>
  </div>
  <pre><code class="language-go">…</code></pre>
  <span class="cp-help" hidden></span>
</div>
```

- The block is built when the fence opens, and its text streams into `code`. It is coloured once, when the fence closes or at the end.
- An indented fence's indent is taken off each of its lines, so the code and what Copy copies are the code as written. A fence in a list item or a blockquote stays in it, across blank lines in the item.
- The fence's language is the first word of its info string, kept only if it matches `[A-Za-z0-9_+.#-]{1,32}`. The label is the language's name, such as "TypeScript" for `ts`, or the tag as written when the highlighter does not know it. A fence with no tag is coloured and labelled by [`detectLanguage`](highlight.md#detection), and stays plain when detection is unsure.
- Copy is [copy](../forms/copy.md) on the block's code. Its hint is inside the block, so a hook that replaces the block takes it too.
- Add an app's buttons to `[data-part="actions"]`, each a `.cp-button` with `data-variant="quiet"` and `data-size="sm"`, from the `code` hook.
- Long lines scroll instead of wrapping, since a wrapped command reads as two. The `pre` takes a tab stop only while it overflows.

### The table region

A table sits in a `div.cp-table-scroll` that scrolls it inside its own box. While the table overflows, the region carries `role="region"`, `aria-label="Table"` and `tabindex="0"`, since Safari makes no scroller focusable on its own. All three come off when the table fits.

## Safety

- Every `href` and `src` goes through the gate before anything resolves it. The gate strips surrounding whitespace and every C0 control, then admits `http:`, `https:` and `mailto:`, and reads `//host/x` as `https:`.
- A relative destination is admitted only with `base`, and only when no segment of it is `.` or `..`, written plainly, percent-encoded or with backslashes. The element gets the URL the gate checked. A relative destination keeps its own text when the document's base resolves it to the same URL.
- A refused destination gets no `href` and no `src`, so the link's words are plain text. `.cp-prose` styles an `a` without `href` as body text, so it never looks live.
- Links get `rel="noopener noreferrer nofollow"`. Every `http:` or `https:` link opens in a new tab, unless it only moves within the page it is on, so a click never loses a live feed or an unsent draft. A fragment that `base` or a `<base>` element sends to another document opens a new tab too.
- No path in either subpath turns a string into markup, and a test fails on any.
- Parsing takes time in line with the text's length, whatever its shape.
- Send `X-DNS-Prefetch-Control: off` with a page that renders agent text, since a browser may resolve a link's host before any click.

### Withheld links

A link can carry data out in its address, and a person who clicks it sends that data. `withhold` judges each `http:` or `https:` link that leaves the page's origin. A relative, same-origin or `mailto:` link is never withheld. A matched link renders with no `href`, marked `data-cp-withheld`, and shows its destination after its words in a `[data-part="dest"]`, so the person can read it and copy it.

The default, `payloadShaped(url)`, is exported. It flags a query and fragment, or a user name and password, holding 200 characters, 21 percent escapes in a row, a base64 run of 40 characters or a credential such as an AWS key id, a GitHub token or a private key header. It flags a host over 100 characters, a host holding a credential, or a label of 32 letters and digits with a digit among them, the shape of data encoded into a DNS name. It does not read the path, where commit hashes and long names are ordinary. It is a heuristic: it catches the common shapes and promises nothing beyond them. Pass your own predicate for a stricter rule.

### Images

- In `"link"` mode an image is a link to its source, named by its alt text, or by the source's host and path when alt is empty.
- In `"load"` mode the gate, `urls`, `withhold` and the `image` hook decide before the `img` gets a `src`, so an image a hook replaces is never fetched. The `img` gets its `src` when the hook keeps it, returns it or returns a wrapper holding it. A kept `img` has `referrerpolicy="no-referrer"` and `loading="lazy"`. A source `urls` refuses as `"src"` renders the link form, its `href` checked again as `"href"`. A withheld source renders the withheld link form.
- A source the gate refuses renders its alt text, or "Image", as plain text.

## Hooks

```ts
renderMarkdown(answer, text, {
  hooks: {
    link: (n) => (isFilePath(n.raw) ? fileLink(n.raw) : undefined),
    code: (n, block) => {
      if (n.lang === "sh" && n.closed) {
        block.querySelector('[data-part="actions"]')?.append(runButton(n.text));
      }
    },
    math: (n, el) => mathElement(n.tex, n.display),
  },
});
```

| Hook | It gets | Then |
| --- | --- | --- |
| `link` | `{ url, raw, title, withheld }`, the `a` | `url` is the gated URL, or `null` when refused. `raw` is the destination as written, decoded once. |
| `image` | `{ url, raw, alt, title }`, the link form or the `img` without `src` | Return your own `img` for another `src`. |
| `code` | `{ lang, text, closed }`, the `.cp-code` | `lang` is the tag as written. `closed` is false for a fence the text never closed. |
| `math` | `{ tex, display }`, the `code[data-math]` | |
| `block` | each completed top-level block | Runs after that block's own hook, with what the hook left. |

- A hook returns nothing to keep the element, or a node that takes its place. To wrap, return a new element holding the one you got. What a hook returns is your code and goes in as it is.
- The element is attached to its parent when its hook runs. Inner hooks run before `block`. A hook may move or replace nodes itself and return nothing.
- `renderMarkdown` and a stream's `end()` close every open token and run its hooks, so the last block is decorated too.

## Streaming

`createMarkdownStream(host, options)` returns `{ write, flush, end }` and takes three more options:

| Option | Default | What it does |
| --- | --- | --- |
| `flushIntervalMs` | `200` | How long a write waits before it is parsed. `0` parses on write. |
| `text` | none | `(parent, node)` runs for each text node, attached as `parent`'s last child, inside code and math too, such as for a fade or a caret. What it returns takes the node's place. |
| `moved` | none | `(el)` runs before an inline token the text never closed gives its children back to its parent, so a fade or a caret on them can follow. |
| `onSlice` | none | `(host)` runs after each slice is parsed. |

- What is queued is parsed in slices of 4096 characters, one task each, so a large flush never holds a frame. `flush()` parses the first slice at once.
- Emitted content never changes, and a completed block is never rendered again.
- `end()` parses what is queued, closes every token and shows the truncation line if `maxBytes` cut the text. A second `end()` does nothing.
- A hook may call `write` or `end`. A write is queued after the text being parsed, and an `end` runs once that text is parsed. Inside `end()` too, what a hook writes as the last block closes is parsed before `end()` returns.
- A hook that throws ends its slice there, and the rest of that slice is dropped. The next write is parsed as usual.
- A hook that throws inside `end()` ends the stream with what was rendered, and the error reaches the caller of `end()`. Later writes and `end()` calls do nothing.

## In a worker

The parser and `createRecorder` take no DOM. A worker parses and posts each batch of operations, and the page replays them into one sink. The sink gates every operation it gets, so the safety rules hold whatever sends them.

```ts
// worker.ts
import { createParser, createRecorder } from "@cplieger/ui/markdown";
import type { Op } from "@cplieger/ui/markdown";

const ops: Op[] = [];
const parser = createParser(createRecorder(ops));
self.onmessage = (e: MessageEvent<string | null>) => {
  if (e.data === null) {
    parser.end();
  } else {
    parser.write(e.data);
  }
  self.postMessage({ ops: ops.splice(0), done: e.data === null });
};
```

```ts
// page.ts
import { createDomSink, replay } from "@cplieger/ui/markdown";
import type { Op } from "@cplieger/ui/markdown";

const sink = createDomSink(answer, { base: document.baseURI, signal: view.signal });
worker.onmessage = (e: MessageEvent<{ ops: Op[]; done: boolean }>) => {
  replay(e.data.ops, sink);
  if (e.data.done) {
    sink.end();
  }
};
worker.postMessage(chunk); // each chunk as it arrives, then null
```

- A link's `href` is read when the link closes, so a batch may end anywhere.
- `createDomSink` does not apply `maxBytes`: cut the text in the worker before it reaches the parser.
- `replay` skips an operation of any other shape.
