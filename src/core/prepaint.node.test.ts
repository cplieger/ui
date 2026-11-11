import { join } from "node:path";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// A pre-paint script blocks first paint, so a bundle of what it imports
// carries code from that one module, and none a later call needs.
describe.each([
  ["theme/theme.ts", "applyTheme"],
  ["pointer/pointer.ts", "applyPointerTier"],
])("%s", (file, name) => {
  it(`bundles ${name} from its own module alone`, async () => {
    const out = await build({
      stdin: {
        contents: `import { ${name} } from ${JSON.stringify(join(import.meta.dirname, file))}; ${name}();`,
        loader: "ts",
        resolveDir: import.meta.dirname,
      },
      bundle: true,
      format: "esm",
      metafile: true,
      write: false,
      logLevel: "silent",
    });
    const inputs = Object.values(out.metafile.outputs).flatMap((o) =>
      Object.entries(o.inputs)
        .filter(([, v]) => v.bytesInOutput > 0)
        .map(([path]) => path),
    );
    expect(inputs.filter((path) => path !== "<stdin>")).toEqual([`src/core/${file}`]);
  });
});
