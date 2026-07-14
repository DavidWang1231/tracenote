"use client";

import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  File,
  FileText,
  FolderOpen,
  Globe2,
  Library,
  LoaderCircle,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type DocumentItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  wordCount: number;
  status: string;
  createdAt: string;
};

type Citation = {
  sourceId: string;
  documentId: string;
  documentName: string;
  excerpt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  mode?: "ai" | "extractive";
};

const EXAMPLE_FILES = [
  {
    name: "2026-用户研究摘要.md",
    content: `# 研究摘要\n\n本轮访谈覆盖 18 名独立研究者与知识工作者。受访者平均每周阅读 11 份长文档，其中 72% 的人表示，最耗时的工作不是阅读本身，而是重新找到某个结论的原始出处。\n\n## 核心发现\n\n多数受访者会同时使用云盘、笔记工具和聊天机器人，但资料在不同工具间反复复制。13 名受访者明确表示，他们需要每条总结都能回到原文。对于没有明确来源的回答，用户通常会重新人工核对。\n\n## 产品机会\n\n默认启用严格资料模式；结论旁展示来源编号；点击后打开原文片段。用户希望系统在证据不足时直接说明，而不是补充未经验证的信息。`,
  },
  {
    name: "产品范围讨论.txt",
    content: `产品第一阶段只支持用户主动添加的资料，不默认联网。首批文件类型包括 PDF、DOCX、TXT、Markdown、CSV 和 JSON。单个文件上限暂定 20 MB。\n\n第一版优先完成三个任务：单份资料摘要、多份资料综合问答、引用原文检查。音频、视频、PPT 和复杂表格解析放在后续版本。\n\n判断产品是否有效的关键指标包括：用户是否点击引用、是否继续追问，以及完成同一研究任务所需时间是否下降。`,
  },
];

export default function Home() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [mobileSources, setMobileSources] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents");
      const data = (await response.json()) as { documents?: DocumentItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "无法读取资料库");
      const next = data.documents ?? [];
      setDocuments(next);
      setSelectedIds((current) => (current.length ? current : next.map((item) => item.id)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取资料库");
    } finally {
      setLoading(false);
    }
  }

  async function handleFiles(files: File[]) {
    const validFiles = files.filter((file) => file.size <= 20 * 1024 * 1024);
    if (!validFiles.length) {
      setNotice("请选择 20 MB 以内的支持文件");
      return;
    }
    setUploading(true);
    setNotice(null);
    const uploaded: DocumentItem[] = [];

    try {
      for (const file of validFiles) {
        const text = await extractText(file);
        const form = new FormData();
        form.append("file", file);
        form.append("text", text);
        const response = await fetch("/api/documents", { method: "POST", body: form });
        const data = (await response.json()) as { document?: DocumentItem; error?: string };
        if (!response.ok || !data.document) throw new Error(data.error || `${file.name} 上传失败`);
        uploaded.push(data.document);
      }

      setDocuments((current) => [...uploaded, ...current]);
      setSelectedIds((current) => Array.from(new Set([...current, ...uploaded.map((item) => item.id)])));
      setNotice(`已添加 ${uploaded.length} 份资料，正在建立摘要`);
      if (uploaded.length === 1) {
        await askQuestion("请总结这份资料的核心观点、关键数据和需要注意的限制。", [uploaded[0].id], "summary");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "资料处理失败");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function seedExamples() {
    const files = EXAMPLE_FILES.map(
      (example) => new File([example.content], example.name, { type: "text/plain" }),
    );
    await handleFiles(files);
  }

  async function deleteDocument(id: string) {
    try {
      const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("删除失败");
      setDocuments((current) => current.filter((item) => item.id !== id));
      setSelectedIds((current) => current.filter((item) => item !== id));
      if (selectedCitation?.documentId === id) setSelectedCitation(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function askQuestion(
    value: string,
    overrideIds?: string[],
    mode: "ask" | "summary" = "ask",
  ) {
    const clean = value.trim();
    if (!clean || asking) return;
    const ids = overrideIds ?? selectedIds;
    if (!ids.length) {
      setNotice("请至少选择一份资料");
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setAsking(true);
    setNotice(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: clean, documentIds: ids, mode }),
      });
      const data = (await response.json()) as {
        answer?: string;
        citations?: Citation[];
        mode?: "ai" | "extractive";
        error?: string;
      };
      if (!response.ok || !data.answer) throw new Error(data.error || "分析失败");
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        citations: data.citations ?? [],
        mode: data.mode,
      };
      setMessages((current) => [...current, assistantMessage]);
      if (data.citations?.[0]) setSelectedCitation(data.citations[0]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAsking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void askQuestion(question);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  }

  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedIds.includes(document.id)),
    [documents, selectedIds],
  );
  const totalWords = useMemo(
    () => selectedDocuments.reduce((sum, item) => sum + item.wordCount, 0),
    [selectedDocuments],
  );

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMobileSidebar(true)} aria-label="打开资料库">
          <Menu size={19} />
        </button>
        <Brand compact />
        <button className="icon-button" onClick={() => setMobileSources(true)} aria-label="查看来源">
          <BookOpen size={19} />
        </button>
      </header>

      <aside className={`sidebar ${mobileSidebar ? "mobile-open" : ""}`}>
        <div className="sidebar-top">
          <Brand />
          <button className="mobile-close" onClick={() => setMobileSidebar(false)} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <button className="new-project-button">
          <Plus size={17} />
          新建研究项目
        </button>

        <nav className="sidebar-nav" aria-label="主导航">
          <button className="nav-item active">
            <MessageSquareText size={17} />
            研究工作区
          </button>
          <button className="nav-item">
            <Library size={17} />
            全部资料
            <span>{documents.length}</span>
          </button>
          <button className="nav-item">
            <Globe2 size={17} />
            联网补充
            <em>关闭</em>
          </button>
        </nav>

        <div className="section-heading">
          <span>当前项目</span>
          <MoreHorizontal size={16} />
        </div>
        <div className="project-card">
          <div className="project-icon"><FolderOpen size={18} /></div>
          <div>
            <strong>我的研究资料</strong>
            <span>{documents.length ? `${documents.length} 份资料` : "尚未添加资料"}</span>
          </div>
        </div>

        <div className="privacy-card">
          <ShieldCheck size={18} />
          <div>
            <strong>严格资料模式</strong>
            <span>仅依据你选择的资料回答</span>
          </div>
          <div className="status-dot" aria-label="已开启" />
        </div>
      </aside>

      <section
        className={`workspace ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="workspace-header">
          <div>
            <p className="eyebrow">研究工作区</p>
            <h1>我的研究资料</h1>
          </div>
          <div className="workspace-actions">
            <div className="mode-pill"><ShieldCheck size={15} /> 严格资料模式 <ChevronDown size={14} /></div>
            <label className="upload-button">
              <Upload size={16} />
              添加资料
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json"
                onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>
        </div>

        {notice && (
          <div className="notice" role="status">
            <Sparkles size={15} />
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="关闭通知"><X size={14} /></button>
          </div>
        )}

        <div className="conversation">
          {loading ? (
            <div className="loading-state"><LoaderCircle className="spin" size={24} /> 正在打开资料库…</div>
          ) : documents.length === 0 ? (
            <EmptyState
              uploading={uploading}
              onUpload={() => fileInput.current?.click()}
              onExamples={() => void seedExamples()}
            />
          ) : (
            <>
              <div className="welcome-block">
                <div className="assistant-mark"><Sparkles size={19} /></div>
                <div>
                  <h2>资料已就绪</h2>
                  <p>
                    当前选中 {selectedDocuments.length} 份资料，共约 {formatNumber(totalWords)} 字。
                    我只会依据这些资料回答，并在每个关键结论后标记来源。
                  </p>
                  <div className="suggestion-row">
                    {["总结所有资料的核心观点", "找出资料之间的矛盾", "提取关键数据与时间线"].map((item) => (
                      <button key={item} onClick={() => void askQuestion(item)}>{item}</button>
                    ))}
                  </div>
                </div>
              </div>

              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  {message.role === "assistant" && <div className="assistant-mark small"><Sparkles size={15} /></div>}
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.role === "user" ? "你" : "溯源助手"}</strong>
                      {message.mode && (
                        <span>{message.mode === "ai" ? "AI 综合分析" : "本地提取摘要"}</span>
                      )}
                    </div>
                    <div className="message-content">
                      {renderMessage(message, (citation) => {
                        setSelectedCitation(citation);
                        setMobileSources(true);
                      })}
                    </div>
                    {!!message.citations?.length && (
                      <div className="source-chips">
                        {message.citations.map((citation) => (
                          <button
                            key={`${message.id}-${citation.sourceId}`}
                            onClick={() => {
                              setSelectedCitation(citation);
                              setMobileSources(true);
                            }}
                          >
                            <FileText size={13} /> {citation.sourceId} · {citation.documentName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}

              {asking && (
                <div className="thinking-row">
                  <div className="assistant-mark small"><LoaderCircle className="spin" size={15} /></div>
                  <span>正在核对资料与引用…</span>
                </div>
              )}
            </>
          )}
        </div>

        {documents.length > 0 && (
          <form className="composer" onSubmit={submit}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (question.trim()) void askQuestion(question);
                }
              }}
              placeholder="针对所选资料提问…"
              rows={2}
            />
            <div className="composer-footer">
              <button type="button" className="context-button">
                <FileText size={14} /> {selectedIds.length} 份资料
              </button>
              <span>Shift + Enter 换行</span>
              <button className="send-button" type="submit" disabled={!question.trim() || asking} aria-label="发送">
                {asking ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}
              </button>
            </div>
          </form>
        )}

        {dragging && <div className="drop-overlay"><Upload size={28} /> 松开即可添加资料</div>}
      </section>

      <aside className={`sources-panel ${mobileSources ? "mobile-open" : ""}`}>
        <div className="sources-header">
          <div>
            <p className="eyebrow">资料与引用</p>
            <h2>来源检查</h2>
          </div>
          <button className="mobile-close" onClick={() => setMobileSources(false)} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="search-box"><Search size={15} /><input placeholder="搜索资料" /></div>

        <div className="documents-list">
          <div className="list-heading">
            <span>本项目资料</span>
            <span>{selectedIds.length}/{documents.length} 已选择</span>
          </div>
          {documents.map((document) => {
            const selected = selectedIds.includes(document.id);
            return (
              <div className={`document-row ${selected ? "selected" : ""}`} key={document.id}>
                <button
                  className="check-button"
                  onClick={() =>
                    setSelectedIds((current) =>
                      current.includes(document.id)
                        ? current.filter((id) => id !== document.id)
                        : [...current, document.id],
                    )
                  }
                  aria-label={selected ? `取消选择 ${document.name}` : `选择 ${document.name}`}
                >
                  {selected && <Check size={12} />}
                </button>
                <div className="file-icon"><File size={16} /></div>
                <div className="document-info">
                  <strong title={document.name}>{document.name}</strong>
                  <span>{formatFileSize(document.size)} · {formatNumber(document.wordCount)} 字</span>
                </div>
                <button className="delete-button" onClick={() => void deleteDocument(document.id)} aria-label={`删除 ${document.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="citation-preview">
          {selectedCitation ? (
            <>
              <div className="citation-label"><span>{selectedCitation.sourceId}</span> 当前引用</div>
              <h3>{selectedCitation.documentName}</h3>
              <blockquote>{selectedCitation.excerpt}</blockquote>
              <p><ShieldCheck size={14} /> 此回答依据上方原文片段生成</p>
            </>
          ) : (
            <div className="citation-empty">
              <BookOpen size={22} />
              <strong>引用会显示在这里</strong>
              <span>提出问题后，点击回答中的来源编号即可检查原文。</span>
            </div>
          )}
        </div>

        <div className="scope-note">
          <ShieldCheck size={15} />
          <span>联网搜索已关闭。系统不会把外部信息混入当前研究。</span>
        </div>
      </aside>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <div className="brand-mark"><BookOpen size={18} /></div>
      <div><strong>溯源</strong>{!compact && <span>TraceNote</span>}</div>
    </div>
  );
}

function EmptyState({
  uploading,
  onUpload,
  onExamples,
}: {
  uploading: boolean;
  onUpload: () => void;
  onExamples: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-visual">
        <div className="paper paper-one"><FileText size={23} /></div>
        <div className="paper paper-two"><BookOpen size={23} /></div>
        <div className="spark spark-one" />
        <div className="spark spark-two" />
      </div>
      <p className="eyebrow">从你的资料开始</p>
      <h2>把散落的信息，变成可追溯的结论</h2>
      <p className="empty-copy">
        上传资料后，我可以总结重点、对比多份文件，并让每个结论都回到原文。
      </p>
      <button className="primary-action" onClick={onUpload} disabled={uploading}>
        {uploading ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
        {uploading ? "正在处理资料" : "选择资料上传"}
      </button>
      <button className="example-action" onClick={onExamples} disabled={uploading}>
        或使用示例资料体验
      </button>
      <div className="supported-formats">
        <span>PDF</span><span>DOCX</span><span>TXT</span><span>MD</span><span>CSV</span><span>JSON</span>
      </div>
      <small>单个文件最大 20 MB · 默认不联网</small>
    </div>
  );
}

function renderMessage(message: ChatMessage, onCitation: (citation: Citation) => void) {
  const citations = new Map((message.citations ?? []).map((item) => [item.sourceId, item]));
  return message.content.split("\n").map((line, lineIndex) => (
    <p key={`${message.id}-${lineIndex}`}>
      {line.split(/(\[S\d+\])/g).map((part, partIndex) => {
        const id = part.match(/^\[(S\d+)\]$/)?.[1];
        const citation = id ? citations.get(id) : undefined;
        return citation ? (
          <button className="inline-citation" key={`${part}-${partIndex}`} onClick={() => onCitation(citation)}>
            {citation.sourceId}
          </button>
        ) : (
          <span key={`${part}-${partIndex}`}>{part}</span>
        );
      })}
    </p>
  ));
}

async function extractText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["txt", "md", "markdown", "csv", "json"].includes(extension ?? "")) {
    return file.text();
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      pages.push(`【第 ${pageNumber} 页】\n${text}`);
    }
    return pages.join("\n\n");
  }
  throw new Error(`暂不支持 ${extension?.toUpperCase() || "该"} 格式`);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}
