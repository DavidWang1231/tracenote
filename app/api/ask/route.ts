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
  kind: "document" | "web";
  url?: string;
  sourceLabel?: string;
};

type WikipediaSearchPage = {
  id?: number;
  key?: string;
  title?: string;
  excerpt?: string;
  description?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      documentIds?: string[];
      mode?: "ask" | "summary";
      answerLanguage?: "auto" | "zh" | "en";
      interfaceLanguage?: "zh" | "en";
      webSupplement?: boolean;
    };
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }

    const db = await ensureDatabase();
    const sql =
      "SELECT id, name, mime_type, size, content, storage_key, word_count, status, created_at FROM documents";
    const ids = Array.isArray(body.documentIds) ? body.documentIds.filter(Boolean) : [];
    const result = await db.prepare(sql).all();
    const allDocuments = result.results.map((row) => mapDocument(row));
    const selectedIds = new Set(ids);
    const documents = ids.length
      ? allDocuments.filter((document) => selectedIds.has(document.id))
      : allDocuments;
    if (!documents.length) {
      return NextResponse.json({ error: "请先添加至少一份资料" }, { status: 400 });
    }

    const ranked = rankSources(question, documents);
    const outputLanguage = resolveLanguage(
      question,
      body.answerLanguage,
      body.interfaceLanguage,
    );
    const isSummary =
      body.mode === "summary" ||
      /总结|概括|核心|要点|介绍|简历|履历|这份资料|这个人|summary|summarize|key findings|overview|profile|resume|cv\b/i.test(question);
    const directEvidence = ranked.filter((item) => item.score > 0);
    const usedFallback = !isSummary && directEvidence.length === 0;
    const evidence = (isSummary || usedFallback ? ranked : directEvidence).slice(0, 6);
    const documentCitations: Citation[] = evidence.map((item, index) => ({
      sourceId: `S${index + 1}`,
      documentId: item.document.id,
      documentName: item.document.name,
      excerpt: item.excerpt,
      kind: "document",
    }));
    const webCitations = body.webSupplement
      ? await searchWikipedia(question, outputLanguage)
      : [];
    const citations = [...documentCitations, ...webCitations];

    const runtimeEnv = getRuntimeEnv();
    if (runtimeEnv.OPENAI_API_KEY) {
      const ai = await answerWithOpenAI(
        question,
        citations,
        runtimeEnv,
        outputLanguage,
      );
      if (ai) {
        return NextResponse.json({
          answer: ai,
          citations: citations.filter((citation) => ai.includes(`[${citation.sourceId}]`)),
          mode: "ai",
          webSupplement: webCitations.length > 0,
        });
      }
    }

    return NextResponse.json({
      answer: buildExtractiveAnswer(
        question,
        documentCitations,
        webCitations,
        isSummary,
        usedFallback,
        outputLanguage,
      ),
      citations: [...documentCitations.slice(0, 4), ...webCitations],
      mode: "extractive",
      webSupplement: webCitations.length > 0,
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
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is",
    "it", "of", "on", "or", "that", "the", "this", "to", "was", "were", "what", "when",
    "where", "which", "who", "why", "with",
    "一个", "一下", "什么", "介绍", "关于", "可以", "如何", "是否", "这个", "这些", "那个",
  ]);
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9+'’.-]*/g) ?? [];
  const chineseSequences = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  const chineseBigrams = chineseSequences.flatMap((sequence) =>
    Array.from({ length: Math.max(0, sequence.length - 1) }, (_value, index) =>
      sequence.slice(index, index + 2),
    ),
  );
  const expanded = expandQueryTerms(normalized);
  return Array.from(new Set([...latin, ...chineseBigrams, ...expanded]))
    .filter((word) => word.length > 1 && !stopWords.has(word))
    .slice(0, 80);
}

function expandQueryTerms(text: string) {
  const groups: Array<{ pattern: RegExp; terms: string[] }> = [
    {
      pattern: /工作|经历|经验|实习|任职|就业|职业|职位|work|experience|employment|job|role|intern|co-?op/i,
      terms: ["experience", "employment", "work", "job", "role", "intern", "internship", "co-op", "engineer", "technician"],
    },
    {
      pattern: /教育|学历|学校|大学|学院|专业|课程|education|school|university|college|degree|course/i,
      terms: ["education", "university", "college", "school", "degree", "diploma", "course", "major"],
    },
    {
      pattern: /技能|技术|工具|能力|擅长|软件|硬件|编程|skill|technical|tool|software|hardware|programming/i,
      terms: ["skills", "technical", "technology", "tools", "software", "hardware", "programming", "proficient"],
    },
    {
      pattern: /项目|作品|研究|设计|开发|制造|project|research|design|develop|build|built/i,
      terms: ["project", "research", "design", "developed", "built", "created", "implemented"],
    },
    {
      pattern: /成果|成就|奖项|贡献|影响|achievement|award|impact|result/i,
      terms: ["achievement", "award", "result", "impact", "improved", "increased", "reduced"],
    },
    {
      pattern: /简历|履历|候选人|个人|这个人|背景|介绍|resume|cv\b|profile|background|about/i,
      terms: ["profile", "summary", "objective", "experience", "education", "skills", "projects"],
    },
    {
      pattern: /适合|匹配|申请|岗位|招聘|求职|优势|资质|加拿大|fit|apply|position|qualification|candidate/i,
      terms: ["qualification", "candidate", "experience", "education", "skills", "project", "co-op", "internship"],
    },
  ];

  return groups.flatMap((group) => group.pattern.test(text) ? group.terms : []);
}

function splitIntoChunks(text: string) {
  const paragraphs = text
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 8);
  const chunks = paragraphs.length ? paragraphs : [text.replace(/\s+/g, " ").trim()];
  return chunks.slice(0, 180).map((value) => value.slice(0, 900));
}

async function answerWithOpenAI(
  question: string,
  citations: Citation[],
  runtimeEnv: ReturnType<typeof getRuntimeEnv>,
  outputLanguage: "zh" | "en",
) {
  const sourceText = citations
    .map((citation) => `[${citation.sourceId}] ${citation.documentName}\n${citation.excerpt}`)
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
  documentCitations: Citation[],
  webCitations: Citation[],
  isSummary: boolean,
  usedFallback: boolean,
  outputLanguage: "zh" | "en",
) {
  const citations = [...documentCitations, ...webCitations];
  if (!citations.length) {
    return outputLanguage === "en"
      ? "The current sources do not contain enough evidence to answer this question."
      : "当前资料不足，无法回答这个问题。";
  }
  const intro = outputLanguage === "en"
    ? usedFallback
      ? "I could not find an exact keyword match. To avoid inventing an answer, here are the closest passages from the selected sources:"
      : isSummary
      ? "Here are the most relevant findings extracted from the selected sources:"
      : `The following excerpts are most relevant to “${question.slice(0, 70)}”:`
    : usedFallback
      ? "资料中没有找到完全一致的关键词。为了避免编造，下面列出最接近的原文片段供你核对："
      : isSummary
      ? "我从当前资料中提取出以下核心内容："
      : `根据当前资料，和“${question.slice(0, 48)}”最相关的内容如下：`;
  const documentBullets = documentCitations
    .slice(0, 4)
    .map((citation) => `- ${shorten(citation.excerpt, 180)} [${citation.sourceId}]`)
    .join("\n");
  const webHeading = outputLanguage === "en"
    ? "Supplemental public results from Wikipedia:"
    : "Wikipedia 公开资料补充：";
  const webBullets = webCitations
    .map((citation) =>
      `- ${citation.documentName}${outputLanguage === "zh" ? "：" : ": "}${shorten(citation.excerpt, 180)} [${citation.sourceId}]`,
    )
    .join("\n");
  const note = outputLanguage === "en"
    ? webCitations.length
      ? "This free result uses extractive retrieval. Uploaded sources and public web results are labeled separately so you can verify each passage."
      : usedFallback
        ? "This free source-only mode does not use the web. For a tighter match, include a job title, skill, school, or project name that appears in the source."
        : "This free source-only result uses extractive retrieval. Every passage is quoted from your selected uploads."
    : webCitations.length
      ? "以上为免费的提取式检索结果；上传资料与公开网页来源已分别标注，便于逐条核对。"
      : usedFallback
        ? "这是免费的严格资料检索，不会联网。若想提高匹配度，可以在问题中加入资料里出现的职位、技能、学校或项目名称。"
        : "以上为免费的严格资料检索结果；每段内容均直接摘自你选择的上传资料。";
  return [
    intro,
    documentBullets,
    webBullets ? `${webHeading}\n${webBullets}` : "",
    note,
  ].filter(Boolean).join("\n\n");
}

async function searchWikipedia(
  question: string,
  outputLanguage: "zh" | "en",
): Promise<Citation[]> {
  const query = question.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!query) return [];
  const languages = outputLanguage === "zh" ? (["zh", "en"] as const) : (["en", "zh"] as const);

  const results = await Promise.all(
    languages.map(async (language) => {
      const endpoint = new URL(`https://${language}.wikipedia.org/w/rest.php/v1/search/page`);
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("limit", "2");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(endpoint, {
          headers: {
            Accept: "application/json",
            "User-Agent": "TraceNote/1.0 (https://github.com/DavidWang1231/tracenote)",
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          console.warn(`Wikipedia ${language} search returned ${response.status}`);
          return [];
        }
        const data = (await response.json()) as { pages?: WikipediaSearchPage[] };
        return (data.pages ?? []).map((page) => ({ language, page }));
      } catch (error) {
        console.warn(
          `Wikipedia ${language} search failed:`,
          error instanceof Error ? error.message : "unknown error",
        );
        return [];
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  return results
    .flat()
    .filter(({ page }) => page.key && page.title)
    .slice(0, 4)
    .map(({ language, page }, index) => {
      const sourceLabel = language === "zh" ? "中文维基百科" : "English Wikipedia";
      const excerpt = cleanWikipediaText(
        [page.description, page.excerpt]
          .filter(Boolean)
          .join(language === "zh" ? "。 " : ". "),
      );
      return {
        sourceId: `W${index + 1}`,
        documentId: `wikipedia:${language}:${page.id ?? page.key}`,
        documentName: `${page.title} · ${sourceLabel}`,
        excerpt: excerpt || (language === "zh" ? "请打开原文查看相关内容。" : "Open the article to review the result."),
        kind: "web" as const,
        url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.key ?? "")}`,
        sourceLabel,
      };
    });
}

function cleanWikipediaText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 650);
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
