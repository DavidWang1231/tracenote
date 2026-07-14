import { env } from "cloudflare:workers";

export type StoredDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  storageKey: string | null;
  wordCount: number;
  status: string;
  createdAt: string;
};

type RuntimeEnv = {
  DB?: D1Database;
  DOCS?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export async function ensureDatabase(): Promise<D1Database> {
  const db = getRuntimeEnv().DB;
  if (!db) throw new Error("资料数据库尚未连接");

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      content TEXT NOT NULL,
      storage_key TEXT,
      word_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC)",
    ),
  ]);

  return db;
}

export function mapDocument(row: Record<string, unknown>): StoredDocument {
  return {
    id: String(row.id),
    name: String(row.name),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    content: String(row.content ?? ""),
    storageKey: row.storage_key ? String(row.storage_key) : null,
    wordCount: Number(row.word_count ?? 0),
    status: String(row.status ?? "ready"),
    createdAt: String(row.created_at),
  };
}

export function publicDocument(document: StoredDocument) {
  const { content: _content, storageKey: _storageKey, ...safe } = document;
  return safe;
}
