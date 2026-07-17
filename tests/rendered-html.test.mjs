import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("configures the TraceNote research workspace", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);

  assert.match(layout, /title: "溯源 · 资料研究助手"/);
  assert.match(page, /严格资料模式/);
  assert.match(page, /公开资料补充/);
  assert.match(page, /免费 · 仅依据所选资料回答/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps source-only mode free and labels public web results", async () => {
  const [page, askRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type ResearchScope = "sources" \| "web"/);
  assert.match(page, /tracenote-research-scope/);
  assert.match(page, /不消耗 AI 额度/);
  assert.match(page, /资料 \+ Wikipedia/);
  assert.match(page, /上传文件不会发送/);
  assert.match(askRoute, /webSupplement\?: boolean/);
  assert.match(askRoute, /w\/rest\.php\/v1\/search\/page/);
  assert.match(askRoute, /sourceId: `W\$\{index \+ 1\}`/);
  assert.match(askRoute, /kind: "web" as const/);
  assert.match(askRoute, /value\.length > 8/);
});

test("ships Safari-compatible PDF.js assets", async () => {
  await Promise.all([
    access(new URL("../public/pdfjs/pdf.min.js", import.meta.url)),
    access(new URL("../public/pdfjs/pdf.worker.min.js", import.meta.url)),
  ]);
});
