import { build, context } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const codeOpts = {
  entryPoints: [resolve(__dirname, "src/code/index.ts")],
  bundle: true,
  format: "iife",
  target: "es2017",
  outfile: resolve(__dirname, "dist/code.js"),
  logLevel: "info",
};

const uiOpts = {
  entryPoints: [resolve(__dirname, "src/ui/main.tsx")],
  bundle: true,
  format: "iife",
  target: "es2017",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  outfile: resolve(__dirname, "dist/ui.js"),
  logLevel: "info",
};

async function emitUiHtml() {
  const [html, js, css] = await Promise.all([
    readFile(resolve(__dirname, "src/ui/index.html"), "utf8"),
    readFile(resolve(__dirname, "dist/ui.js"), "utf8"),
    readFile(resolve(__dirname, "src/ui/index.css"), "utf8"),
  ]);
  if (js.includes("</script")) {
    throw new Error("dist/ui.js contains '</script' — would truncate the inline <script>");
  }
  // Function replacers: a plain string replacement would interpret `$&`-style
  // substitution patterns inside the minified bundle and corrupt it.
  const out = html
    .replace("/*__INLINE_CSS__*/", () => css)
    .replace("/*__INLINE_JS__*/", () => js);
  await mkdir(resolve(__dirname, "dist"), { recursive: true });
  await writeFile(resolve(__dirname, "dist/ui.html"), out);
}

if (watch) {
  const cCtx = await context(codeOpts);
  const uCtx = await context({
    ...uiOpts,
    plugins: [
      {
        name: "emit-html",
        setup(b) {
          b.onEnd(async () => {
            try { await emitUiHtml(); } catch (e) { console.error(e); }
          });
        },
      },
    ],
  });
  await Promise.all([cCtx.watch(), uCtx.watch()]);
  console.log("watching…");
} else {
  await Promise.all([build(codeOpts), build(uiOpts)]);
  await emitUiHtml();
  console.log("built dist/code.js and dist/ui.html");
}
