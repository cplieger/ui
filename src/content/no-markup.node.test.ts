import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

// The sinks that turn a string into markup; neither subpath may reach one, so
// no text it renders can become an element.
const BANNED =
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|DOMParser|createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe|srcdoc)\b|\bdocument\.write(?:ln)?\b/g;

const ROOTS = ["markdown", "highlight"].map((d) => resolve(import.meta.dirname, d));

/** The shipped sources: every `.ts` under the roots but tests. */
async function sources(): Promise<string[]> {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(join(entry.parentPath, entry.name));
      }
    }
  }
  return files;
}

describe("the markdown and highlight sources", () => {
  it("name no markup sink", async () => {
    const files = await sources();
    expect(
      files.map((f) =>
        relative(import.meta.dirname, f)
          .split(sep)
          .join("/"),
      ),
    ).toEqual(expect.arrayContaining(["markdown/parser.ts", "highlight/dom.ts"]));
    const hits: string[] = [];
    for (const file of files) {
      for (const m of (await readFile(file, "utf8")).matchAll(BANNED)) {
        hits.push(`${file}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it.each([
    "el.innerHTML = s",
    "el.outerHTML",
    'el.insertAdjacentHTML("beforeend", s)',
    "new DOMParser()",
    "range.createContextualFragment(s)",
    "el.setHTMLUnsafe(s)",
    "Document.parseHTMLUnsafe(s)",
    "frame.srcdoc = s",
    "document.write(s)",
    "document.writeln(s)",
  ])("would catch %s", (line) => {
    expect(line.match(BANNED)).not.toBeNull();
  });
});
