import { NextResponse } from "next/server";
import {
  ensureDatabase,
  getRuntimeEnv,
  mapDocument,
  publicDocument,
} from "@/lib/storage";

export const runtime = "edge";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_LENGTH = 600_000;

export async function GET() {
  try {
    const db = await ensureDatabase();
    const result = await db
      .prepare(
        "SELECT id, name, mime_type, size, content, storage_key, word_count, status, created_at FROM documents ORDER BY created_at DESC",
      )
      .all();
    return NextResponse.json({
      documents: result.results.map((row) => publicDocument(mapDocument(row))),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法读取资料库" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const extractedText = form.get("text");

    if (!(file instanceof File) || typeof extractedText !== "string") {
      return NextResponse.json({ error: "缺少文件或解析内容" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "单个文件不能超过 20 MB" }, { status: 400 });
    }

    const content = extractedText.replace(/\u0000/g, "").trim().slice(0, MAX_TEXT_LENGTH);
    if (!content) {
      return NextResponse.json({ error: "没有从文件中识别到可用文字" }, { status: 400 });
    }

    const db = await ensureDatabase();
    const runtimeEnv = getRuntimeEnv();
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120);
    const storageKey = `documents/${id}/${safeName || "document"}`;
    const createdAt = new Date().toISOString();
    const wordCount = countWords(content);

    if (runtimeEnv.DOCS) {
      await runtimeEnv.DOCS.put(storageKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { originalName: file.name },
      });
    }

    await db
      .prepare(
        `INSERT INTO documents
        (id, name, mime_type, size, content, storage_key, word_count, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
      )
      .bind(
        id,
        file.name,
        file.type || "application/octet-stream",
        file.size,
        content,
        runtimeEnv.DOCS ? storageKey : null,
        wordCount,
        createdAt,
      )
      .run();

    return NextResponse.json(
      {
        document: {
          id,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          wordCount,
          status: "ready",
          createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少资料 ID" }, { status: 400 });

    const db = await ensureDatabase();
    const found = await db
      .prepare("SELECT storage_key FROM documents WHERE id = ?")
      .bind(id)
      .first<{ storage_key: string | null }>();

    if (found?.storage_key) await getRuntimeEnv().DOCS?.delete(found.storage_key);
    await db.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 },
    );
  }
}

function countWords(text: string): number {
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const han = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return latin + han;
}
