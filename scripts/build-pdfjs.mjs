import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

const outputDirectory = new URL("../public/pdfjs/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const shared = {
  bundle: true,
  format: "iife",
  minify: true,
  platform: "browser",
  target: ["safari16.4"],
};

await Promise.all([
  build({
    ...shared,
    stdin: {
      contents: `
        import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
        globalThis.pdfjsLib = pdfjsLib;
      `,
      resolveDir: process.cwd(),
      sourcefile: "tracenote-pdfjs-entry.mjs",
    },
    outfile: new URL("pdf.min.js", outputDirectory).pathname,
  }),
  build({
    ...shared,
    stdin: {
      contents: `
        import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
        globalThis.pdfjsWorker = pdfjsWorker;
      `,
      resolveDir: process.cwd(),
      sourcefile: "tracenote-pdfjs-worker-entry.mjs",
    },
    outfile: new URL("pdf.worker.min.js", outputDirectory).pathname,
  }),
]);

await writeFile(new URL("VERSION", outputDirectory), "pdfjs-dist 6.1.200\n");
