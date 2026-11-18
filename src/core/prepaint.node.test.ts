import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "esbuild";
import ts from "typescript";
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

  // An app's pre-paint allow list names a package or one of its exports, never
  // a private file, so a pre-paint module imports nothing at all, type-only
  // included, and its closure is the file alone under any bundler.
  it("imports nothing", async () => {
    const text = await readFile(join(import.meta.dirname, file), "utf8");
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node) ||
        (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) ||
        ts.isImportTypeNode(node) ||
        (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      ) {
        found.push(node.getText());
      }
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    expect(found).toEqual([]);
  });
});
