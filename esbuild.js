/* esbuild.js */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = new Set(process.argv.slice(2));
const production = args.has("--production");
const watch = args.has("--watch");
const analyze = args.has("--analyze");
const clean = !args.has("--no-clean");

const root = __dirname;
const entry = path.join(root, "src", "extension.ts");
const outFile = path.join(root, "dist", "extension.js");
const outDir = path.dirname(outFile);

function rimrafDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) rimrafDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

/**
 * @type {import('esbuild').Plugin}
 */
const problemMatcherPlugin = {
  name: "problem-matcher",
  setup(build) {
    build.onStart(() => {
      if (watch) console.log("[watch] build started");
    });

    build.onEnd((result) => {
      const { errors, warnings } = result;

      for (const w of warnings) {
        const loc = w.location;
        if (loc) {
          console.warn(`⚠️  ${w.text}\n   ${loc.file}:${loc.line}:${loc.column}`);
        } else {
          console.warn(`⚠️  ${w.text}`);
        }
      }

      for (const e of errors) {
        const loc = e.location;
        if (loc) {
          console.error(`✘ ${e.text}\n   ${loc.file}:${loc.line}:${loc.column}`);
        } else {
          console.error(`✘ ${e.text}`);
        }
      }

      if (errors.length === 0 && watch) console.log("[watch] build finished ✅");
      if (errors.length > 0 && watch) console.log("[watch] build finished ❌");
    });
  },
};

async function main() {
  if (clean && !watch) {
    // limpa dist só em build “normal” (não no watch)
    if (fs.existsSync(outDir)) rimrafDir(outDir);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const buildOptions = /** @type {import('esbuild').BuildOptions} */ ({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node16",
    sourcemap: production ? false : "inline",
    minify: production,
    legalComments: "none",
    sourcesContent: false,
    metafile: analyze,
    external: ["vscode"],

    define: {
      "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
    },

    banner: {
      js: `"use strict";`,
    },

    logLevel: "silent",
    plugins: [problemMatcherPlugin],
  });

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("[watch] watching…");
    return;
  }

  const result = await esbuild.build(buildOptions);

  if (analyze && result.metafile) {
    const txt = await esbuild.analyzeMetafile(result.metafile, { verbose: true });
    fs.writeFileSync(path.join(outDir, "bundle-analyze.txt"), txt, "utf8");
    console.log("📦 analyze salvo em dist/bundle-analyze.txt");
  }

  console.log("✅ build OK:", path.relative(root, outFile));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
