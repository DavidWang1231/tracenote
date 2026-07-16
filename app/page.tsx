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
  Languages,
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

type UiLanguage = "zh" | "en";
type AnswerLanguage = "auto" | "zh" | "en";

const COPY = {
  zh: {
    openLibrary: "打开资料库", viewSources: "查看来源", close: "关闭",
    newProject: "新建研究项目", workspace: "研究工作区", allSources: "全部资料",
    webSupplement: "联网补充", off: "关闭", currentProject: "当前项目",
    projectName: "我的研究资料", noSources: "尚未添加资料", sourceCount: (n: number) => `${n} 份资料`,
    strictMode: "严格资料模式", strictHint: "仅依据你选择的资料回答",
    addSources: "添加资料", loadingLibrary: "正在打开资料库…", sourcesReady: "资料已就绪",
    readyCopy: (selected: number, words: string) => `当前选中 ${selected} 份资料，共约 ${words} 字。我只会依据这些资料回答，并在每个关键结论后标记来源。`,
    suggestions: ["总结所有资料的核心观点", "找出资料之间的矛盾", "提取关键数据与时间线"],
    you: "你", assistant: "溯源助手", aiAnalysis: "AI 综合分析", localSummary: "本地提取摘要",
    checking: "正在核对资料与引用…", askPlaceholder: "针对所选资料提问…", selectedSources: (n: number) => `${n} 份资料`,
    newline: "Shift + Enter 换行", sourcesAndCitations: "资料与引用", sourceCheck: "来源检查",
    searchSources: "搜索资料", projectSources: "本项目资料", selectedRatio: (a: number, b: number) => `${a}/${b} 已选择`,
    currentCitation: "当前引用", citationProof: "此回答依据上方原文片段生成",
    citationEmptyTitle: "引用会显示在这里", citationEmptyCopy: "提出问题后，点击回答中的来源编号即可检查原文。",
    offlineNote: "联网搜索已关闭。系统不会把外部信息混入当前研究。",
    emptyEyebrow: "从你的资料开始", emptyTitle: "把散落的信息，变成可追溯的结论",
    emptyCopy: "上传资料后，我可以总结重点、对比多份文件，并让每个结论都回到原文。",
    upload: "选择资料上传", uploading: "正在处理资料", examples: "或使用示例资料体验",
    limits: "单个文件最大 20 MB · 默认不联网", interfaceLanguage: "界面语言",
    answerLanguage: "回答语言", auto: "自动", chinese: "中文", english: "English",
    added: (n: number) => `已添加 ${n} 份资料，正在建立摘要`, chooseSmall: "请选择 20 MB 以内的支持文件",
    chooseOne: "请至少选择一份资料", summaryPrompt: "请总结这份资料的核心观点、关键数据和需要注意的限制。",
    drop: "松开即可添加资料", deleteLabel: (name: string) => `删除 ${name}`,
    selectLabel: (name: string, selected: boolean) => `${selected ? "取消选择" : "选择"} ${name}`,
    libraryError: "无法读取资料库", uploadFail: (name: string) => `${name} 上传失败`, processFail: "资料处理失败",
    deleteFail: "删除失败", analyzeFail: "分析失败", mainNav: "主导航", enabled: "已开启",
    closeNotice: "关闭通知", send: "发送", pageLabel: (n: number) => `【第 ${n} 页】`, unsupported: (ext: string) => `暂不支持 ${ext} 格式`,
  },
  en: {
    openLibrary: "Open library", viewSources: "View sources", close: "Close",
    newProject: "New research project", workspace: "Research workspace", allSources: "All sources",
    webSupplement: "Web supplement", off: "Off", currentProject: "Current project",
    projectName: "My research library", noSources: "No sources yet", sourceCount: (n: number) => `${n} source${n === 1 ? "" : "s"}`,
    strictMode: "Source-only mode", strictHint: "Answers only from selected sources",
    addSources: "Add sources", loadingLibrary: "Opening your library…", sourcesReady: "Your sources are ready",
    readyCopy: (selected: number, words: string) => `${selected} source${selected === 1 ? " is" : "s are"} selected, with about ${words} words. Every factual claim will point back to the source material.`,
    suggestions: ["Summarize the core findings", "Find contradictions across sources", "Extract key data and a timeline"],
    you: "You", assistant: "TraceNote", aiAnalysis: "AI synthesis", localSummary: "Extractive summary",
    checking: "Checking evidence and citations…", askPlaceholder: "Ask a question about the selected sources…", selectedSources: (n: number) => `${n} source${n === 1 ? "" : "s"}`,
    newline: "Shift + Enter for a new line", sourcesAndCitations: "Sources & citations", sourceCheck: "Evidence inspector",
    searchSources: "Search sources", projectSources: "Project sources", selectedRatio: (a: number, b: number) => `${a}/${b} selected`,
    currentCitation: "Current citation", citationProof: "This answer is grounded in the excerpt above",
    citationEmptyTitle: "Citations will appear here", citationEmptyCopy: "Ask a question, then select a source tag to inspect the supporting excerpt.",
    offlineNote: "Web search is off. External information will not be mixed into this research.",
    emptyEyebrow: "Start with your sources", emptyTitle: "Turn scattered documents into verifiable insight",
    emptyCopy: "Upload your material to summarize key points, compare sources, and trace every conclusion back to the original.",
    upload: "Choose files", uploading: "Processing sources", examples: "Or explore with sample sources",
    limits: "20 MB per file · Web search off by default", interfaceLanguage: "Interface language",
    answerLanguage: "Answer language", auto: "Auto", chinese: "中文", english: "English",
    added: (n: number) => `${n} source${n === 1 ? "" : "s"} added. Building a summary now.`, chooseSmall: "Choose a supported file under 20 MB",
    chooseOne: "Select at least one source", summaryPrompt: "Summarize this source's main findings, key data, and important limitations.",
    drop: "Drop to add sources", deleteLabel: (name: string) => `Delete ${name}`,
    selectLabel: (name: string, selected: boolean) => `${selected ? "Deselect" : "Select"} ${name}`,
    libraryError: "Could not open the source library", uploadFail: (name: string) => `${name} could not be uploaded`, processFail: "The source could not be processed",
    deleteFail: "Could not delete this source", analyzeFail: "The analysis could not be completed", mainNav: "Main navigation", enabled: "Enabled",
    closeNotice: "Dismiss notification", send: "Send", pageLabel: (n: number) => `[Page ${n}]`, unsupported: (ext: string) => `${ext} files are not supported yet`,
  },
} as const;

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

const EXAMPLE_FILES_EN = [
  {
    name: "2026-user-research-summary.md",
    content: `# Research summary\n\nThis study included 18 independent researchers and knowledge workers. Participants read an average of 11 long documents per week. Seventy-two percent said the hardest part was not reading, but finding the original evidence behind a conclusion later.\n\n## Key findings\n\nMost participants used a mix of cloud drives, note-taking tools, and chat assistants. Thirteen participants explicitly asked for every summary to link back to the original text. Answers without a clear source were usually checked manually.\n\n## Product opportunity\n\nSource-only mode should be enabled by default. Claims should display a source tag, and selecting it should open the supporting excerpt. When evidence is insufficient, the product should say so instead of filling the gap with unverified information.`,
  },
  {
    name: "product-scope-notes.txt",
    content: `The first release only uses documents actively provided by the user and does not search the web by default. Initial formats include PDF, DOCX, TXT, Markdown, CSV, and JSON. The file-size limit is 20 MB.\n\nThe MVP focuses on three jobs: single-document summaries, cross-document questions, and citation inspection. Audio, video, presentation files, and advanced table extraction are planned for later releases.\n\nSuccess metrics include citation engagement, follow-up questions, and whether users complete the same research task in less time.`,
  },
];

export default function Home() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("zh");
  const [answerLanguage, setAnswerLanguage] = useState<AnswerLanguage>("auto");
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
  const t = COPY[uiLanguage];

  useEffect(() => {
    void loadDocuments();
    const savedUi = window.localStorage.getItem("tracenote-ui-language");
    const savedAnswer = window.localStorage.getItem("tracenote-answer-language");
    if (savedUi === "zh" || savedUi === "en") setUiLanguage(savedUi);
    if (savedAnswer === "auto" || savedAnswer === "zh" || savedAnswer === "en") {
      setAnswerLanguage(savedAnswer);
    }
  }, []);

  function changeUiLanguage(language: UiLanguage) {
    setUiLanguage(language);
    window.localStorage.setItem("tracenote-ui-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en-CA";
  }

  function changeAnswerLanguage(language: AnswerLanguage) {
    setAnswerLanguage(language);
    window.localStorage.setItem("tracenote-answer-language", language);
  }

  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents");
      const data = (await response.json()) as { documents?: DocumentItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || t.libraryError);
      const next = data.documents ?? [];
      setDocuments(next);
      setSelectedIds((current) => (current.length ? current : next.map((item) => item.id)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.libraryError);
    } finally {
      setLoading(false);
    }
  }

  async function handleFiles(files: File[]) {
    const validFiles = files.filter((file) => file.size <= 20 * 1024 * 1024);
    if (!validFiles.length) {
      setNotice(t.chooseSmall);
      return;
    }
    setUploading(true);
    setNotice(null);
    const uploaded: DocumentItem[] = [];

    try {
      for (const file of validFiles) {
        const text = await extractText(file, uiLanguage);
        const form = new FormData();
        form.append("file", file);
        form.append("text", text);
        const response = await fetch("/api/documents", { method: "POST", body: form });
        const data = (await response.json()) as { document?: DocumentItem; error?: string };
        if (!response.ok || !data.document) throw new Error(data.error || t.uploadFail(file.name));
        uploaded.push(data.document);
      }

      setDocuments((current) => [...uploaded, ...current]);
      setSelectedIds((current) => Array.from(new Set([...current, ...uploaded.map((item) => item.id)])));
      setNotice(t.added(uploaded.length));
      if (uploaded.length === 1) {
        await askQuestion(t.summaryPrompt, [uploaded[0].id], "summary");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.processFail);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function seedExamples() {
    const examples = uiLanguage === "en" ? EXAMPLE_FILES_EN : EXAMPLE_FILES;
    const files = examples.map(
      (example) => new File([example.content], example.name, { type: "text/plain" }),
    );
    await handleFiles(files);
  }

  async function deleteDocument(id: string) {
    try {
      const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(t.deleteFail);
      setDocuments((current) => current.filter((item) => item.id !== id));
      setSelectedIds((current) => current.filter((item) => item !== id));
      if (selectedCitation?.documentId === id) setSelectedCitation(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.deleteFail);
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
      setNotice(t.chooseOne);
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
        body: JSON.stringify({
          question: clean,
          documentIds: ids,
          mode,
          answerLanguage,
          interfaceLanguage: uiLanguage,
        }),
      });
      const data = (await response.json()) as {
        answer?: string;
        citations?: Citation[];
        mode?: "ai" | "extractive";
        error?: string;
      };
      if (!response.ok || !data.answer) throw new Error(data.error || t.analyzeFail);
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
      setNotice(error instanceof Error ? error.message : t.analyzeFail);
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
        <button className="icon-button" onClick={() => setMobileSidebar(true)} aria-label={t.openLibrary}>
          <Menu size={19} />
        </button>
        <Brand compact language={uiLanguage} />
        <button className="icon-button" onClick={() => setMobileSources(true)} aria-label={t.viewSources}>
          <BookOpen size={19} />
        </button>
      </header>

      <aside className={`sidebar ${mobileSidebar ? "mobile-open" : ""}`}>
        <div className="sidebar-top">
          <Brand language={uiLanguage} />
          <button className="mobile-close" onClick={() => setMobileSidebar(false)} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <button className="new-project-button">
          <Plus size={17} />
          {t.newProject}
        </button>

        <nav className="sidebar-nav" aria-label={t.mainNav}>
          <button className="nav-item active">
            <MessageSquareText size={17} />
            {t.workspace}
          </button>
          <button className="nav-item">
            <Library size={17} />
            {t.allSources}
            <span>{documents.length}</span>
          </button>
          <button className="nav-item">
            <Globe2 size={17} />
            {t.webSupplement}
            <em>{t.off}</em>
          </button>
        </nav>

        <div className="section-heading">
          <span>{t.currentProject}</span>
          <MoreHorizontal size={16} />
        </div>
        <div className="project-card">
          <div className="project-icon"><FolderOpen size={18} /></div>
          <div>
            <strong>{t.projectName}</strong>
            <span>{documents.length ? t.sourceCount(documents.length) : t.noSources}</span>
          </div>
        </div>

        <div className="privacy-card">
          <ShieldCheck size={18} />
          <div>
            <strong>{t.strictMode}</strong>
            <span>{t.strictHint}</span>
          </div>
          <div className="status-dot" aria-label={t.enabled} />
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
            <p className="eyebrow">{t.workspace}</p>
            <h1>{t.projectName}</h1>
          </div>
          <div className="workspace-actions">
            <div className="mode-pill"><ShieldCheck size={15} /> {t.strictMode} <ChevronDown size={14} /></div>
            <div className="language-switch" aria-label={t.interfaceLanguage}>
              <Languages size={15} />
              <button className={uiLanguage === "zh" ? "active" : ""} onClick={() => changeUiLanguage("zh")}>中</button>
              <button className={uiLanguage === "en" ? "active" : ""} onClick={() => changeUiLanguage("en")}>EN</button>
            </div>
            <label className="upload-button">
              <Upload size={16} />
              {t.addSources}
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
            <button onClick={() => setNotice(null)} aria-label={t.closeNotice}><X size={14} /></button>
          </div>
        )}

        <div className="conversation">
          {loading ? (
            <div className="loading-state"><LoaderCircle className="spin" size={24} /> {t.loadingLibrary}</div>
          ) : documents.length === 0 ? (
            <EmptyState
              copy={t}
              uploading={uploading}
              onUpload={() => fileInput.current?.click()}
              onExamples={() => void seedExamples()}
            />
          ) : (
            <>
              <div className="welcome-block">
                <div className="assistant-mark"><Sparkles size={19} /></div>
                <div>
                  <h2>{t.sourcesReady}</h2>
                  <p>
                    {t.readyCopy(selectedDocuments.length, formatNumber(totalWords, uiLanguage))}
                  </p>
                  <div className="suggestion-row">
                    {t.suggestions.map((item) => (
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
                      <strong>{message.role === "user" ? t.you : t.assistant}</strong>
                      {message.mode && (
                        <span>{message.mode === "ai" ? t.aiAnalysis : t.localSummary}</span>
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
                  <span>{t.checking}</span>
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
              placeholder={t.askPlaceholder}
              rows={2}
            />
            <div className="composer-footer">
              <button type="button" className="context-button">
                <FileText size={14} /> {t.selectedSources(selectedIds.length)}
              </button>
              <label className="answer-language-select">
                <span>{t.answerLanguage}</span>
                <select value={answerLanguage} onChange={(event) => changeAnswerLanguage(event.target.value as AnswerLanguage)}>
                  <option value="auto">{t.auto}</option>
                  <option value="zh">{t.chinese}</option>
                  <option value="en">{t.english}</option>
                </select>
              </label>
              <span>{t.newline}</span>
              <button className="send-button" type="submit" disabled={!question.trim() || asking} aria-label={t.send}>
                {asking ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}
              </button>
            </div>
          </form>
        )}

        {dragging && <div className="drop-overlay"><Upload size={28} /> {t.drop}</div>}
      </section>

      <aside className={`sources-panel ${mobileSources ? "mobile-open" : ""}`}>
        <div className="sources-header">
          <div>
            <p className="eyebrow">{t.sourcesAndCitations}</p>
            <h2>{t.sourceCheck}</h2>
          </div>
          <button className="mobile-close" onClick={() => setMobileSources(false)} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <div className="search-box"><Search size={15} /><input placeholder={t.searchSources} /></div>

        <div className="documents-list">
          <div className="list-heading">
            <span>{t.projectSources}</span>
            <span>{t.selectedRatio(selectedIds.length, documents.length)}</span>
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
                  aria-label={t.selectLabel(document.name, selected)}
                >
                  {selected && <Check size={12} />}
                </button>
                <div className="file-icon"><File size={16} /></div>
                <div className="document-info">
                  <strong title={document.name}>{document.name}</strong>
                  <span>{formatFileSize(document.size)} · {formatNumber(document.wordCount, uiLanguage)} {uiLanguage === "zh" ? "字" : "words"}</span>
                </div>
                <button className="delete-button" onClick={() => void deleteDocument(document.id)} aria-label={t.deleteLabel(document.name)}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="citation-preview">
          {selectedCitation ? (
            <>
              <div className="citation-label"><span>{selectedCitation.sourceId}</span> {t.currentCitation}</div>
              <h3>{selectedCitation.documentName}</h3>
              <blockquote>{selectedCitation.excerpt}</blockquote>
              <p><ShieldCheck size={14} /> {t.citationProof}</p>
            </>
          ) : (
            <div className="citation-empty">
              <BookOpen size={22} />
              <strong>{t.citationEmptyTitle}</strong>
              <span>{t.citationEmptyCopy}</span>
            </div>
          )}
        </div>

        <div className="scope-note">
          <ShieldCheck size={15} />
          <span>{t.offlineNote}</span>
        </div>
      </aside>
    </main>
  );
}

function Brand({ compact = false, language }: { compact?: boolean; language: UiLanguage }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <div className="brand-mark"><BookOpen size={18} /></div>
      <div><strong>{language === "zh" ? "溯源" : "TraceNote"}</strong>{!compact && <span>{language === "zh" ? "TraceNote" : "Research with evidence"}</span>}</div>
    </div>
  );
}

function EmptyState({
  copy,
  uploading,
  onUpload,
  onExamples,
}: {
  copy: (typeof COPY)[UiLanguage];
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
      <p className="eyebrow">{copy.emptyEyebrow}</p>
      <h2>{copy.emptyTitle}</h2>
      <p className="empty-copy">
        {copy.emptyCopy}
      </p>
      <button className="primary-action" onClick={onUpload} disabled={uploading}>
        {uploading ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
        {uploading ? copy.uploading : copy.upload}
      </button>
      <button className="example-action" onClick={onExamples} disabled={uploading}>
        {copy.examples}
      </button>
      <div className="supported-formats">
        <span>PDF</span><span>DOCX</span><span>TXT</span><span>MD</span><span>CSV</span><span>JSON</span>
      </div>
      <small>{copy.limits}</small>
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

async function extractText(file: File, language: UiLanguage): Promise<string> {
  const copy = COPY[language];
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
    try {
      // PDF.js' default build targets the newest browsers and uses APIs that
      // older Safari releases do not provide. The official legacy build ships
      // the required compatibility layer while keeping the same parsing API.
      // Load its worker handler on the main thread as well: this avoids Safari
      // failures when a module Worker is blocked or cannot initialize.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      const pdf = await loadingTask.promise;
      const pages: string[] = [];

      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .trim();
          pages.push(`${copy.pageLabel(pageNumber)}\n${text}`);
          page.cleanup();
        }
      } finally {
        await loadingTask.destroy();
      }

      const extracted = pages.join("\n\n").trim();
      if (!extracted) {
        throw new Error(
          language === "zh"
            ? "这份 PDF 没有可提取的文字；如果它是扫描件，需要先进行 OCR。"
            : "This PDF has no extractable text. Scanned documents need OCR first.",
        );
      }
      return extracted;
    } catch (error) {
      if (error instanceof Error && /没有可提取|no extractable text/i.test(error.message)) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        language === "zh"
          ? `Safari 无法读取 PDF。技术信息：${detail.slice(0, 180)}`
          : `Safari could not read the PDF. Technical detail: ${detail.slice(0, 180)}`,
        { cause: error },
      );
    }
  }
  throw new Error(copy.unsupported(extension?.toUpperCase() || (language === "zh" ? "该" : "this")));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(value: number, language: UiLanguage) {
  return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-CA", {
    notation: value > 9999 ? "compact" : "standard",
  }).format(value);
}
