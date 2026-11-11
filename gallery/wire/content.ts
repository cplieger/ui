/**
 * content.ts — the Content page's cards: markdown rendered by
 * `@cplieger/ui/markdown`, each card's text named by its host's `data-markdown`.
 */

import { renderMarkdown, type RenderOptions } from "@cplieger/ui/markdown";
import { toast } from "@cplieger/ui/toast";

const PROSE = `# Release notes

The sync now **reads every season** and skips what is *already there*. The old path ~~walked the whole tree~~ is gone. Logs land in \`/var/lib/subflux/logs/2024-11-11/sync-frieren-beyond-journeys-end.log\`.
A line break ends this sentence,
and this one starts on its own line.

## What to check

- Settings, then **Libraries**
  - each library's root folder
  - its language
- The [setup guide](https://example.com/docs/setup), or https://example.com/status
- Questions to ops@example.com

3. Restart the service
4. Open the dashboard

- [x] Read the change list
- [ ] Rebuild the index

> A season with no subtitles is skipped, not failed.
> Run it again once they exist.

### The numbers

| Library | Seasons | Size |
| :--- | :---: | ---: |
| Anime | 412 | 3.1 TB |
| Films | 1,204 | 8.7 TB |

The ratio is $s / n$, and the total:

$$
\\sum_{i=1}^{n} s_i
$$

---

![The sync graph](https://example.com/graph.png)

\`\`\`sh
subflux sync --library anime
\`\`\`
`;

const CODE: Record<string, string> = {
  go: `\`\`\`go
// Sync walks one library and reports what it fetched.
func Sync(ctx context.Context, lib Library) (int, error) {
	n := 0
	for _, s := range lib.Seasons {
		if err := fetch(ctx, s); err != nil {
			return n, fmt.Errorf("season %d: %w", s.Number, err)
		}
		n++
	}
	return n, nil
}
\`\`\``,
  ts: `\`\`\`ts
export async function load(id: string): Promise<Entry | null> {
  const res = await fetch(\`/api/entries/\${id}\`);
  return res.ok ? ((await res.json()) as Entry) : null;
}
\`\`\``,
  diff: `\`\`\`diff
 retries: 3
-timeout: 10s
+timeout: 30s
 language: en
\`\`\``,
  detected: `\`\`\`
def ranked(releases):
    """Best first, by score then downloads."""
    return sorted(releases, key=lambda r: (-r.score, -r.downloads))
\`\`\``,
  unknown: `\`\`\`zig
const std = @import("std");
pub fn main() void {
    std.debug.print("hello\\n", .{});
}
\`\`\``,
  long: `\`\`\`sh
docker run --rm --name subflux -p 8080:8080 -v /srv/subflux/config:/config -v /srv/media:/media:ro -e TZ=Europe/Paris -e SUBFLUX_LOG_LEVEL=debug ghcr.io/cplieger/subflux:latest
\`\`\``,
  action: `\`\`\`sh
subflux sync --library anime --dry-run
\`\`\``,
};

const TABLE = `| Release | Group | Episode | Language | Format | Frame rate | Downloads | Size | Added | File | Subtitles |
| --- | --- | :---: | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| Frieren S01E04 | Arid | 4 | English | ASS | 23.976 | 412 | 1.4 GB | 2023-10-20 | \`Sousou.no.Frieren.S01E04.1080p.BluRay.HEVC.FLAC-Arid.mkv\` | \`Sousou.no.Frieren.S01E04.en.forced.ass\` |
| Frieren S01E04 | Okay-Subs | 4 | English | SRT | 23.976 | 96 | 1.3 GB | 2023-10-21 | \`Frieren.Beyond.Journeys.End.S01E04.1080p.WEB-DL.AAC-OkaySubs.mkv\` | \`Frieren.Beyond.Journeys.End.S01E04.en.srt\` |
| Frieren S01E04 | SubsPlease | 4 | English, Portuguese | ASS | 23.976 | 3,018 | 1.4 GB | 2023-10-20 | \`Sousou.no.Frieren.S01E04.1080p.WEB.H264-SubsPlease.mkv\` | \`Sousou.no.Frieren.S01E04.en.pt-BR.ass\` |`;

// Each safety case shows its text as a code block, then what it renders.
const SAFETY: Record<string, string> = {
  refused: "[Open the settings](javascript:alert(document.cookie))",
  withheld:
    "[See the report](https://collect.example.net/r?d=c2Vzc2lvbj1hYmNkZWYwMTIzNDU2Nzg5O3VzZXI9Y2hyaXN0b3BoZTt0b2tlbj1naHBfMTIzNDU2Nzg5MA)",
  image: "![The sync graph](https://example.com/graph.png)",
  html: '<img src="x" onerror="alert(1)"> and <script>alert(1)</script> stay as they were typed.',
};

const TEXTS = new Map<string, string>([
  ["prose", PROSE],
  ["cut", PROSE],
  ["image-load", "The sync graph for the last ten runs:\n\n![The sync graph](media/graph.svg)"],
  ["table", TABLE],
  ...Object.entries(CODE).map(([k, v]): [string, string] => [`code-${k}`, v]),
  ...Object.entries(SAFETY).map(([k, v]): [string, string] => [
    `safety-${k}`,
    `\`\`\`md\n${v}\n\`\`\`\n\n${v}`,
  ]),
]);

const LIVE = `## Paste an answer here

It renders **as you type**, with \`inline code\`, [links](https://example.com) and:

\`\`\`py
print("a code block")
\`\`\`
`;

const runButton = (text: string): HTMLButtonElement => {
  const button = document.createElement("button");
  button.className = "cp-button";
  button.type = "button";
  button.dataset["variant"] = "quiet";
  button.dataset["size"] = "sm";
  const icon = document.createElement("span");
  icon.className = "cp-icon";
  icon.dataset["cpIcon"] = "play";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, "Run");
  button.addEventListener("click", () => {
    toast({ title: "Started", body: text.trim() });
  });
  return button;
};

for (const host of document.querySelectorAll<HTMLElement>("[data-markdown]")) {
  const text = TEXTS.get(host.dataset["markdown"] ?? "");
  if (text === undefined) {
    continue;
  }
  const key = host.dataset["markdown"];
  const options: RenderOptions = {
    headingLevel: host.dataset["level"] === "4" ? 4 : 2,
    ...(key === "cut" ? { maxBytes: 640 } : {}),
    ...(key === "image-load" ? { images: "load", base: location.href } : {}),
    ...(key === "code-action"
      ? {
          hooks: {
            code: (n, block) => {
              if (n.closed) {
                block.querySelector('[data-part="actions"]')?.prepend(runButton(n.text));
              }
              return undefined;
            },
          },
        }
      : {}),
  };
  renderMarkdown(host, text, options);
}

// The live card renders again on each frame the text changed in, letting go
// of the last render's observers first.
for (const area of document.querySelectorAll<HTMLTextAreaElement>("textarea[data-markdown-live]")) {
  const out = document.getElementById(area.dataset["markdownLive"] ?? "");
  if (out === null) {
    continue;
  }
  area.value = LIVE;
  let render = new AbortController();
  let frame = 0;
  const draw = (): void => {
    frame = 0;
    render.abort();
    render = new AbortController();
    out.replaceChildren();
    renderMarkdown(out, area.value, { headingLevel: 3, signal: render.signal });
  };
  area.addEventListener("input", () => {
    frame ||= requestAnimationFrame(draw);
  });
  draw();
}
