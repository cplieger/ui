import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

import { buildGallery } from "./build.js";

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".vtt": "text/vtt",
  ".webm": "video/webm",
};

export interface Served {
  readonly origin: string;
  /** Every path asked for that had no file. */
  readonly missing: ReadonlySet<string>;
  close(): Promise<void>;
}

/** Serves `dir` on a free local port. `/framed/<page>` answers a page that
 *  frames `<page>.html` the way a preview tab does. */
async function serve(dir: string): Promise<Served> {
  const missing = new Set<string>();
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    // Sandboxed, so at an opaque origin, where reading a stylesheet's rules throws.
    const framed = /^\/framed\/([\w-]+)$/.exec(path);
    if (framed !== null) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<link rel="icon" href="data:,"><iframe sandbox="allow-scripts" src="/${framed[1] ?? ""}.html"></iframe>`,
      );
      return;
    }
    // normalize() of a rooted path cannot climb above it, so the join stays under dir.
    const file = join(dir, normalize(decodeURIComponent(path)));
    readFile(file).then(
      (body) => {
        // An opaque-origin page fetches its module script and fonts by CORS.
        res.writeHead(200, {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          "access-control-allow-origin": "*",
        });
        res.end(body);
      },
      () => {
        missing.add(path);
        res.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return {
    origin: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    missing,
    close: () =>
      new Promise<void>((ok) =>
        server.close(() => {
          ok();
        }),
      ),
  };
}

/** Builds the gallery into a temporary folder and serves it; `close` removes the folder. */
export async function serveGallery(): Promise<Served> {
  const out = await mkdtemp(join(tmpdir(), "ui-gallery-"));
  await buildGallery(out);
  const served = await serve(out);
  return {
    ...served,
    close: async () => {
      await served.close();
      await rm(out, { recursive: true, force: true });
    },
  };
}
