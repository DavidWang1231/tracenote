import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    content: text("content").notNull(),
    storageKey: text("storage_key"),
    wordCount: integer("word_count").notNull().default(0),
    status: text("status").notNull().default("ready"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("documents_created_at_idx").on(table.createdAt)],
);
