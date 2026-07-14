import { NextResponse } from "next/server";
import {
  ensureDatabase,
  getRuntimeEnv,
  mapDocument,
  type StoredDocument,
} from "@/lib/storage";

export const runtime = "edge";

type Citation = {
  sourceId: string;
  documentId: string;
  documentName: string;
  excerpt: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      documentIds?: string[];
      mode?: "ask" | "summary";
      answerLanguage?: "auto" | "zh" | "en";
      interfaceLanguage?: "zh" | "en";
    };
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }

    const db = await ensureDatabase();
    let sql =
      "SELECT id, name, mime_type, size, content, storage_key, word_count, status, created_at FROM documents";
    const ids = Array.isArray(body.documentIds) ? body.documentIds.filter(Boolean) : [];
    let query = db.prepare(sql);
    if (ids.length) {
      sql += ` WHERE id IN (${ids.map(() => "?").join(",")})`;
      query = db.prepare(sql).bind(...ids);
    }
    const result = await query.all();
    const documents = result.results.map((row) => mapDocument(row));
    if (!documents.length) {
      return NextResponse.json({ error: "请先添加至少一份资料" }, { status: 400 });
    }

    const ranked = rankSources(question, documents);
    const outputLanguage = resolveLanguage(
      question,
      body.answerLanguage,
      body.interfaceLanguage,
    );
    const citations = ranked.slice(0, 6).map((item, index) => ({
      sourceId: `S${index + 1}`,
      documentId: item.document.id,
      documentName: item.document.name,
      excerpt: item.excerpt,
    }));

    const runtimeEnv = getRuntimeEnv();
    if (runtimeEnv.OPENAI_API_KEY) {
      const ai = await answerWithOpenAI(
        question,
        ranked,
        citations,
        runtimeEnv,
        outputLanguage,
      );
      if (ai) {
        return NextResponse.json({
          answer: ai,
          citations: citations.filter((citation) => ai.includes(`[${citation.sourceId}]`)),
          mode: "ai",
        });
      }
    }

    return NextResponse.json({
      answer: buildExtractiveAnswer(
        question,
        citations,
        body.mode === "summary",
        outputLanguage,
      ),
      citations: citations.slice(0, 4),
      mode: "extractive",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析失败" },
      { status: 500 },
    );
  }
}

function rankSources(question: string, documents: StoredDocument[]) {
  const terms = tokenize(question);
  const candidates: Array<{
    document: StoredDocument;
    excerpt: string;
    score: number;
  }> = [];

  for (const document of documents) {
    const chunks = splitIntoChunks(document.content);
    for (const excerpt of chunks) {
      const normalized = excerpt.toLowerCase();
      const score = terms.reduce(
        (sum, term) => sum + (normalized.includes(term) ? Math.max(2, term.length) : 0),
        0,
      );
      candidates.push({ document, excerpt, score });
    }
  }

  return candidates.sort((a, b) => b.score - a.score || b.excerpt.length - a.excerpt.length);
}

function tokenize(text: string) {
  const words = text.toLowerCase().match(/[\u3400-\u9fff]{2,}|[a-z0-9]{2,}/g) ?? [];
  const chinese = text.match(/[\u3400-\u9fff]/g) ?? [];
  return Array.from(new Set([...words, ...chinese])).slice(0, 40);
}

function splitIntoChunks(text: string) {
  const paragraphs = text
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 35);
  const chunks = paragraphs.length ? paragraphs : [text.replace(/\s+/g, " ").trim()];
  return chunks.slice(0, 180).map((value) => value.slice(0, 900));
}

async function answerWithOpenAI(
  question: string,
  ranked: ReturnType<typeof rankSources>,
  citations: Citation[],
  runtimeEnv: ReturnType<typeof getRuntimeEnv>,
  outputLanguage: "zh" | "en",
) {
  const sourceText = citations
    .map((citation, index) => {
      const item = ranked[index];
      return `[${citation.sourceId}] ${item.document.name}\n${item.excerpt}`;
    })
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeEnv.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtimeEnv.OPENAI_MODEL || "gpt-5.6-luna",
      instructions:
        outputLanguage === "en"
          ? "You are a rigorous research assistant. Answer only from the provided sources and never add outside knowledge. Cite every factual claim with a source tag such as [S1]. If the evidence is insufficient, say so clearly. Answer in Canadian English, starting with a direct conclusion followed by concise supporting points. Never invent a source ID. You may read sources in any language, but the answer must be in English."
          : "你是一名严格的资料研究助手。只能依据提供的来源回答，不得补充外部知识。每个事实性结论后必须使用 [S1] 形式引用。证据不足时明确说明。回答使用中文，先给直接结论，再给要点。不要编造不存在的来源编号。你可以阅读任何语言的来源，但回答必须使用中文。",
      input: `用户问题：${question}\n\n可用来源：\n${sourceText}`,
      max_output_tokens: 1800,
    }),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("\n") ??
    null
  );
}

function buildExtractiveAnswer(
  question: string,
  citations: Citation[],
  isSummary: boolean,
  outputLanguage: "zh" | "en",
) {
  if (!citations.length) {
    return outputLanguage === "en"
      ? "The current sources do not contain enough evidence to answer this question."
      : "当前资料不足，无法回答这个问题。";
  }
  const intro = outputLanguage === "en"
    ? isSummary
      ? "Here are the most relevant findings extracted from the selected sources:"
      : `The following excerpts are most relevant to “${question.slice(0, 70)}”:`
    : isSummary
      ? "我从当前资料中提取出以下核心内容："
      : `根据当前资料，和“${question.slice(0, 48)}”最相关的内容如下：`;
  const bullets = citations
    .slice(0, 4)
    .map((citation) => `- ${shorten(citation.excerpt, 180)} [${citation.sourceId}]`)
    .join("\n");
  const note = outputLanguage === "en"
    ? "This is an extractive result produced in source-only mode. Connect an AI model to generate deeper cross-document synthesis."
    : "以上为严格资料模式下的原文提取结果；接入模型密钥后可进一步生成跨资料综合分析。";
  return `${intro}\n\n${bullets}\n\n${note}`;
}

function resolveLanguage(
  question: string,
  requested?: "auto" | "zh" | "en",
  interfaceLanguage?: "zh" | "en",
): "zh" | "en" {
  if (requested === "zh" || requested === "en") return requested;
  if (/[\u3400-\u9fff]/.test(question)) return "zh";
  return interfaceLanguage === "zh" ? "zh" : "en";
}

function shorten(text: string, length: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}
