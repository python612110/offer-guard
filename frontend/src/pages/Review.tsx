import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  ScanText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useStore } from "../store";
import { Empty, Modal, Tag } from "../components/ui";
import { UploadModal } from "../components/forms";
import { downloadBlob, formatSize } from "../lib/storage";
import type {
  Annotation,
  MarkColor,
  MaterialVersion,
  TextAnchor,
} from "../types";
import { fetchBlob } from "../lib/api";
import RiskReview from "../components/RiskReview";
import CaseFlow from "../components/CaseFlow";
import SelectField from "../components/SelectField";
import ContractOverview from "../components/ContractOverview";
import OriginalTextAction from "../components/OriginalTextAction";
import WordPreview from "../components/WordPreview";
import { matchAnchor } from "../lib/documentSelection";

function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
function renderMarkedText(text: string, notes: Annotation[]) {
  const spans = notes.flatMap(({ anchor }) => {
    const start = text.indexOf(anchor.quote);
    return start < 0
      ? []
      : [
          {
            start,
            end: start + anchor.quote.length,
            color: anchor.color || "yellow",
          },
        ];
  });
  const edges = [
    ...new Set([
      0,
      text.length,
      ...spans.flatMap(({ start, end }) => [start, end]),
    ]),
  ].sort((a, b) => a - b);
  return edges.slice(0, -1).map((start, i) => {
    const color = spans.find(
      (span) => span.start <= start && span.end > start,
    )?.color;
    return (
      <span key={start} className={color ? `doc-mark-${color}` : undefined}>
        {text.slice(start, edges[i + 1])}
      </span>
    );
  });
}
function PdfPage({
  version,
  page,
  notes,
}: {
  version: MaterialVersion;
  page: number;
  notes: Annotation[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = container.current!;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setLoading(true);
    setError("");
    async function render() {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).href;
      if (!version.blob) throw new Error("原件尚未加载。");
      const bytes = new Uint8Array(await version.blob.arrayBuffer());
      if (cancelled) return;
      const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
      cleanup = () => {
        void task.destroy();
      };
      const pdf = await task.promise;
      if (cancelled) return;
      const pdfPage = await pdf.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({
        scale: Math.min(Math.max(160, width) / base.width, 1.6),
      });
      const element = canvas.current;
      if (!element || cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = viewport.width * ratio;
      element.height = viewport.height * ratio;
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      const frame = surface.current!;
      frame.style.width = `${viewport.width}px`;
      frame.style.height = `${viewport.height}px`;
      frame.style.setProperty(
        "--scale-factor",
        String(viewport.scale * viewport.userUnit),
      );
      const textLayer = layer.current!;
      textLayer.replaceChildren();
      const overlay = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: textLayer,
        viewport,
      });
      cleanup = () => {
        overlay.cancel();
        void task.destroy();
      };
      const context = element.getContext("2d");
      if (!context) throw new Error("浏览器无法显示 PDF。");
      await Promise.all([
        overlay.render(),
        pdfPage.render({
          canvasContext: context,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        }).promise,
      ]);
      if (!cancelled) setLoading(false);
    }
    render().catch((e) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "无法显示 PDF 原件");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [version.blob, page, width]);
  return (
    <div ref={container} className="pdf-page">
      {loading && (
        <div className="pdf-loading">
          <LoaderCircle className="spin" size={21} />
          正在打开原件
        </div>
      )}
      {error && (
        <Empty
          title="无法预览这份 PDF"
          description="请下载原件查看，或尝试上传可读版本。"
        />
      )}
      <div
        ref={surface}
        className="pdf-surface"
        hidden={!!error}
        data-pdf-surface
      >
        <canvas ref={canvas} />
        <div className="pdf-marks" aria-hidden="true">
          {notes.flatMap(({ id, anchor }) =>
            (anchor.pdfRects || []).map((rect, i) => (
              <i
                key={`${id}-${i}`}
                className={`doc-mark-${anchor.color || "yellow"}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              />
            )),
          )}
        </div>
        <div ref={layer} className="pdf-text-layer" />
      </div>
    </div>
  );
}
export default function Review() {
  const { versionId } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const focus = params.get("view") === "report";
  const savedVersion = store.data.versions.find((v) => v.id === versionId);
  const [remoteFile, setRemoteFile] = useState<{
    id: string;
    blob: Blob;
  } | null>(null);
  const [fileError, setFileError] = useState("");
  const [retry, setRetry] = useState(0);
  const remoteBlob =
    remoteFile?.id === savedVersion?.id ? remoteFile?.blob : undefined;
  const version = useMemo(
    () =>
      savedVersion
        ? { ...savedVersion, blob: savedVersion.blob || remoteBlob }
        : undefined,
    [savedVersion, remoteBlob],
  );
  useEffect(() => {
    let active = true;
    setFileError("");
    if (savedVersion?.fileUrl && !savedVersion.blob) {
      fetchBlob(savedVersion.fileUrl)
        .then((blob) => {
          if (active) setRemoteFile({ id: savedVersion.id, blob });
        })
        .catch((error) => {
          if (active) setFileError(error.message);
        });
    }
    return () => {
      active = false;
    };
  }, [savedVersion?.id, savedVersion?.fileUrl, retry]);
  const material = store.data.materials.find(
    (m) => m.id === version?.materialId,
  );
  const item = store.data.cases.find((c) => c.id === version?.caseId);
  const url = useBlobUrl(version?.blob);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState("原件");
  const [tab, setTab] = useState(() =>
    params.get("tab") === "overview" ? "合同概览" : "风险审查",
  );
  const [quote, setQuote] = useState("");
  const [anchor, setAnchor] = useState<TextAnchor>();
  const [textAction, setTextAction] = useState<"note" | "ask">();
  const [question, setQuestion] = useState("");
  const [upload, setUpload] = useState(false);
  const [remove, setRemove] = useState(false);
  const [split, setSplit] = useState(60);
  const [readerFocus, setReaderFocus] = useState(false);
  useEffect(() => {
    if (!readerFocus) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]"))
        setReaderFocus(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [readerFocus]);
  const [busy, setBusy] = useState(false);
  const reader = useRef<HTMLDivElement>(null);
  const panelContent = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const requestedTab = params.get("tab");
  const sourcePage = params.get("sourcePage");
  const sourceLine = params.get("sourceLine");
  useEffect(() => {
    if (focus) setTab("风险审查");
    else if (requestedTab === "overview") setTab("合同概览");
  }, [versionId, requestedTab, focus]);
  useEffect(() => {
    panelContent.current?.scrollTo(0, 0);
  }, [tab, versionId]);
  useEffect(() => {
    setPage(1);
    setQuote("");
    setQuestion("");
    setAnchor(undefined);
    setTextAction(undefined);
  }, [versionId]);
  useEffect(() => {
    if (!sourcePage || sourceLine === null || !/^\d+$/.test(sourceLine)) return;
    const source = savedVersion?.pages.find((entry) => String(entry.number) === sourcePage);
    const line = source?.text.split(/\n+/)[Number(sourceLine)]?.trim();
    if (!source || !line) return;
    setMode("文字");
    setPage(source.number);
    setQuote(line);
    const frame = requestAnimationFrame(() =>
      reader.current?.querySelector(".evidence-highlight")?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [savedVersion, sourcePage, sourceLine]);
  if (!version || !material || !item)
    return (
      <div className="page">
        <Empty
          title="没有找到这份材料"
          description="请从求职事项中选择已保存的材料。"
          action={
            <Link className="button primary" to="/app/reviews">
              返回材料审查
            </Link>
          }
        />
      </div>
    );
  const isPdf = version.filename.toLowerCase().endsWith(".pdf");
  const isWord = /\.docx$/i.test(version.filename);
  const isImage = /\.(png|jpe?g|webp)$/i.test(version.filename);
  const textPage = version.pages.find((p) => p.number === page);
  const visualDocument = mode === "原件" && (isPdf || isWord);
  const pageNotes = store.data.annotations.filter(
    (entry) => entry.versionId === version.id && entry.anchor.page === page,
  );
  const versions = store.data.versions
    .filter((v) => v.materialId === material.id)
    .sort((a, b) => b.number - a.number);
  const pending = store.data.todos.filter(
    (t) => t.caseId === item.id && !t.done,
  );
  function showEvidence(targetPage: number, text: string) {
    if (focus) setParams({});
    setPage(targetPage);
    setMode("文字");
    setQuote(text);
    window.setTimeout(
      () =>
        reader.current?.querySelector(".evidence-highlight")?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        }),
      50,
    );
  }
  function captureSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const text = selection.toString().trim();
    if (
      !text ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !reader.current?.contains(selection.anchorNode) ||
      !reader.current.contains(selection.focusNode)
    )
      return;
    if (text.length > 800) {
      store.notify("请选择最多 800 字的原文。");
      return;
    }
    const surface = reader.current.querySelector(
      "[data-pdf-surface], [data-word-surface]",
    );
    if (
      surface?.contains(selection.anchorNode) &&
      surface.contains(selection.focusNode)
    ) {
      const blockOf = (node: Node) =>
        (node instanceof Element
          ? node
          : node.parentElement
        )?.closest<HTMLElement>("[data-word-paragraph]");
      const block = blockOf(selection.anchorNode);
      const ranged =
        block && block === blockOf(selection.focusNode)
          ? {
              page,
              paragraph: Number(block.dataset.wordParagraph),
              quote:
                matchAnchor(
                  textPage?.text.split(/\n+/).filter((p) => p.trim())[
                    Number(block.dataset.wordParagraph)
                  ] || "",
                  page,
                  text,
                )?.quote || "",
            }
          : matchAnchor(textPage?.text || "", page, text);
      if (!ranged?.quote) {
        store.notify(
          "这段文字无法唯一定位，请试着选择同一段内的完整短句，或切换到「文字」。",
        );
        return;
      }
      if (isPdf) {
        const bounds = surface.getBoundingClientRect();
        ranged.pdfRects = Array.from(selection.getRangeAt(0).getClientRects())
          .flatMap((rect) => {
            const left = Math.max(bounds.left, rect.left),
              top = Math.max(bounds.top, rect.top);
            const right = Math.min(bounds.right, rect.right),
              bottom = Math.min(bounds.bottom, rect.bottom);
            return right > left && bottom > top
              ? [
                  {
                    x: (left - bounds.left) / bounds.width,
                    y: (top - bounds.top) / bounds.height,
                    width: (right - left) / bounds.width,
                    height: (bottom - top) / bounds.height,
                  },
                ]
              : [];
          })
          .slice(0, 80);
      }
      setAnchor(ranged);
      return;
    }
    const paragraphOf = (node: Node | null) =>
      (node instanceof Element ? node : node?.parentElement)?.closest(
        "[data-text-paragraph]",
      );
    const paragraph = paragraphOf(selection.anchorNode);
    if (!paragraph || !reader.current?.contains(paragraph) || !text) return;
    if (paragraph !== paragraphOf(selection.focusNode) || text.length > 800) {
      store.notify("请选择同一段内、最多 800 字的原文。");
      return;
    }
    if (!paragraph.textContent?.includes(text)) return;
    setAnchor({
      page,
      paragraph: Number((paragraph as HTMLElement).dataset.textParagraph),
      quote: text,
    });
  }
  async function saveMark(color: MarkColor, target: TextAnchor) {
    if (busy) return;
    setBusy(true);
    try {
      await store.addAnnotation(version!.id, target, "", color);
      setAnchor(undefined);
      window.getSelection()?.removeAllRanges();
      store.notify(color === "yellow" ? "已标黄" : "已标红");
    } catch {
      store.notify("标记未保存，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const actionButtons = (target: TextAnchor) => (
    <div className="clause-actions">
      <button
        className="button secondary small doc-mark-yellow"
        disabled={busy}
        onClick={() => void saveMark("yellow", target)}
      >
        标黄
      </button>
      <button
        className="button secondary small doc-mark-red"
        disabled={busy}
        onClick={() => void saveMark("red", target)}
      >
        标红
      </button>
      <button
        className="button secondary small"
        onClick={() => setTextAction("note")}
      >
        写批注
      </button>
      <button
        className="button secondary small"
        onClick={() => setTextAction("ask")}
      >
        问 AI
      </button>
      {!readerFocus && (
        <button
          className="text-link"
          onClick={() => {
            setQuote(target.quote);
            setTab("待确认");
          }}
        >
          记为待确认
        </button>
      )}
    </div>
  );
  function removeAnnotation(id: string) {
    if (window.confirm("删除这条批注或标记？")) {
      void store
        .deleteAnnotation(id)
        .catch(() => store.notify("未能删除，请重试。"));
    }
  }
  function renderAnnotations(items: Annotation[]) {
    return items
      .filter(({ note }) => note.trim())
      .map(({ id, anchor: mark, note }) => (
        <aside className="inline-annotation" key={id}>
          <div className="annotation-note">
            <strong>批注</strong> {note}
          </div>
          <button
            type="button"
            className="text-link"
            aria-label={`删除批注：${mark.quote}`}
            onClick={() => removeAnnotation(id)}
          >
            删除
          </button>
        </aside>
      ));
  }
  function renderMarkControls(items: Annotation[]) {
    const marks = items.filter(
      ({ note, anchor: mark }) => !note.trim() && mark.color,
    );
    if (!marks.length) return null;
    return (
      <details className="mark-controls">
        <summary>管理颜色标记（{marks.length}）</summary>
        <ul>
          {marks.map(({ id, anchor: mark }) => (
            <li key={id}>
              <span
                className={`mark-swatch doc-mark-${mark.color}`}
                aria-label={mark.color === "red" ? "红色" : "黄色"}
                role="img"
              />
              <span>{mark.quote}</span>
              <button
                type="button"
                className="text-link"
                onClick={() => removeAnnotation(id)}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      </details>
    );
  }
  async function addQuestion(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    try {
      await store.addTodo(
        item!.id,
        `${quote ? `关于所选条款：${quote.slice(0, 100)}；` : ""}${question.trim()}`,
      );
      setQuestion("");
      setQuote("");
      store.notify("问题已保存到该事项的待确认列表");
    } catch {
      store.notify("保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`review-page ${focus ? "report-focus" : ""}`}>
      <div className="review-header">
        <div>
          <Link className="back-link" to={`/app/cases/${item.id}`}>
            <ArrowLeft size={16} />
            {item.company}
          </Link>
          <h1>{material.title}</h1>
          <span>
            {item.role} <b>·</b> <Tag>{material.type}</Tag>
          </span>
        </div>
        <div className="review-header-actions">
          <SelectField
            compact
            label="选择文件版本"
            icon={<History size={15} aria-hidden="true" />}
            value={version.id}
            onChange={(id) => navigate(`/app/reviews/${id}`)}
            options={versions.map((v) => ({
              value: v.id,
              label: `第 ${v.number} 版 · ${material.currentVersionId === v.id ? "当前" : "历史"}`,
            }))}
          />
          <button
            className="button secondary small"
            disabled={!version.blob}
            onClick={() => {
              if (version.blob) downloadBlob(version.blob, version.filename);
            }}
          >
            <Download size={16} />
            下载原件
          </button>
          <button
            className="button primary small"
            onClick={() => setUpload(true)}
          >
            <Upload size={16} />
            上传新版本
          </button>
        </div>
      </div>
      <CaseFlow caseId={item.id} active={1} />
      <div className="report-view-bar no-print">
        <button
          className="button secondary small"
          onClick={() => {
            setParams(focus ? {} : { view: "report" });
            setTab("风险审查");
          }}
        >
          {focus ? "返回原文与报告" : "展开报告阅读"}
        </button>
        <Link className="text-link" to={`/app/consistency?caseId=${item.id}`}>
          下一步：核对多份材料 <ChevronRight size={16} />
        </Link>
      </div>
      {version.id !== material.currentVersionId && (
        <div className="historical-banner">
          <History size={16} />
          正在查看历史版本。
          <Link to={`/app/reviews/${material.currentVersionId}`}>
            打开当前版本
          </Link>
        </div>
      )}
      <div
        ref={workspace}
        className={`review-workspace${readerFocus ? " reader-focus" : ""}`}
        style={{ "--reader-width": `${split}%` } as React.CSSProperties}
      >
        <section className="document-panel">
          <div className="document-toolbar">
            <div>
              <FileText size={16} />
              <strong>材料原文</strong>
            </div>
            <button
              className="button secondary small"
              onClick={() => setReaderFocus(!readerFocus)}
            >
              {readerFocus ? "退出专注" : "专注阅读"}
            </button>
            <div className="document-view-toggle">
              {["原件", "文字"].map((m) => (
                <button
                  key={m}
                  className={mode === m ? "active" : ""}
                  onClick={() => {
                    setMode(m);
                    setQuote("");
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              className="icon-button danger-hover"
              aria-label="删除材料及所有版本"
              onClick={() => setRemove(true)}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {visualDocument && (
            <div className="visual-document-tools">
              {anchor?.page === page ? (
                actionButtons(anchor)
              ) : (
                <small>在预览中选字即可标记、批注或问 AI</small>
              )}
              {pageNotes.some(({ note }) => note.trim()) && (
                <details>
                  <summary>
                    本页批注（
                    {pageNotes.filter(({ note }) => note.trim()).length}）
                  </summary>
                  <div className="visual-notes">
                    {renderAnnotations(pageNotes)}
                  </div>
                </details>
              )}
              {renderMarkControls(pageNotes)}
            </div>
          )}
          <div
            ref={reader}
            className="document-scroll"
            onPointerUp={captureSelection}
            onKeyUp={captureSelection}
          >
            {mode === "原件" && !version.blob ? (
              <Empty
                title={fileError || "正在读取原件"}
                description={
                  fileError
                    ? "请重试或重新登录。"
                    : "原文件通过账号权限校验后加载。"
                }
                action={
                  fileError ? (
                    <button
                      className="button secondary"
                      onClick={() => setRetry(retry + 1)}
                    >
                      重试
                    </button>
                  ) : undefined
                }
              />
            ) : mode === "原件" && isPdf ? (
              <PdfPage version={version} page={page} notes={pageNotes} />
            ) : mode === "原件" && isWord && version.blob ? (
              <WordPreview
                key={version.id}
                blob={version.blob}
                source={textPage?.text || ""}
                notes={pageNotes}
              />
            ) : mode === "原件" && isImage ? (
              <img
                className="original-image"
                src={url}
                alt={version.filename}
              />
            ) : textPage?.text.trim() ? (
              <article className="text-document">
                <div className="text-document-label">
                  {mode === "原件" ? "正文阅读" : "解析文字 · 请对照原件确认"}
                </div>
                <h2>{version.filename.replace(/\.[^.]+$/, "")}</h2>
                <p className="annotation-hint">
                  选中一句原文，或点击段落旁的按钮，就能批注或问 AI。
                </p>
                <div className="text-document-content">
                  {textPage.text
                    .split(/\n+/)
                    .filter((t) => t.trim())
                    .map((text, i) => {
                      const notes = store.data.annotations.filter(
                        (annotation) =>
                          annotation.versionId === version.id &&
                          annotation.anchor.page === page &&
                          annotation.anchor.paragraph === i,
                      );
                      const active =
                        anchor?.page === page && anchor.paragraph === i
                          ? anchor
                          : undefined;
                      return (
                        <div
                          className={`text-clause${notes.some(({ note }) => note.trim()) ? " has-annotations" : ""}`}
                          key={i}
                        >
                          <div className="text-clause-row">
                            <p
                              data-text-paragraph={i}
                              className={
                                quote && text.includes(quote)
                                  ? "evidence-highlight"
                                  : ""
                              }
                            >
                              {notes.length
                                ? renderMarkedText(text, notes)
                                : text}
                            </p>
                            <button
                              type="button"
                              className="icon-button clause-action"
                              aria-label={`操作第 ${i + 1} 段`}
                              aria-expanded={!!active}
                              onClick={() => {
                                if (text.trim().length > 800 && !active) {
                                  store.notify(
                                    "这一段较长，请选中其中一句再操作。",
                                  );
                                  return;
                                }
                                setAnchor(
                                  active
                                    ? undefined
                                    : {
                                        page,
                                        paragraph: i,
                                        quote: text.trim(),
                                      },
                                );
                              }}
                            >
                              <MessageSquareText size={15} />
                            </button>
                          </div>
                          {active && (
                            <>
                              {actionButtons(active)}
                              {renderMarkControls(notes)}
                            </>
                          )}
                          {renderAnnotations(notes)}
                        </div>
                      );
                    })}
                </div>
                <div className="document-page-note">第 {page} 页</div>
              </article>
            ) : (
              <Empty
                title="这份材料暂时没有可读文字"
                description="扫描件和图片需要 OCR。你仍然可以查看或下载原件。"
                action={
                  isImage || isPdf ? (
                    <button
                      className="button secondary"
                      onClick={() => setMode("原件")}
                    >
                      查看原件
                    </button>
                  ) : (
                    <button
                      className="button secondary"
                      onClick={() =>
                        version.blob &&
                        downloadBlob(version.blob, version.filename)
                      }
                    >
                      下载原文件
                    </button>
                  )
                }
              />
            )}
          </div>
          {textAction && anchor && (
            <OriginalTextAction
              key={version.id}
              versionId={version.id}
              anchor={anchor}
              action={textAction}
              close={() => setTextAction(undefined)}
            />
          )}
          <div className="document-footer">
            <span>
              {formatSize(version.size)}
              {mode === "原件" &&
                !isImage &&
                !isPdf &&
                !isWord &&
                " · 正文视图，排版请下载原文件查看"}
            </span>
            {version.pages.length > 1 && (
              <div className="page-controls">
                <button
                  className="icon-button"
                  aria-label="上一页"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {page} / {version.pages.length}
                </span>
                <button
                  className="icon-button"
                  aria-label="下一页"
                  disabled={page === version.pages.length}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            )}
          </div>
        </section>
        <div
          className="reader-divider"
          role="separator"
          aria-label="调整文档与审查面板宽度"
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit(Math.max(30, split - 3));
            if (e.key === "ArrowRight") setSplit(Math.min(72, split + 3));
          }}
          onPointerDown={(e) => {
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            const move = (event: PointerEvent) => {
              const bounds = workspace.current?.getBoundingClientRect();
              if (bounds)
                setSplit(
                  Math.min(
                    72,
                    Math.max(
                      30,
                      ((event.clientX - bounds.left) / bounds.width) * 100,
                    ),
                  ),
                );
            };
            const finish = () => {
              target.removeEventListener("pointermove", move);
              target.removeEventListener("pointerup", finish);
              target.removeEventListener("pointercancel", finish);
            };
            target.addEventListener("pointermove", move);
            target.addEventListener("pointerup", finish);
            target.addEventListener("pointercancel", finish);
          }}
        >
          <i />
        </div>
        <aside className="review-panel">
          <div className="review-panel-title">
            <span className="assistant-symbol">
              <ScanText size={21} />
            </span>
            <div>
              <h2>签约审查助手</h2>
              <small>从原文出发，逐项确认</small>
            </div>
            <span className="assistant-dot" />
          </div>
          <div className="review-tabs">
            {["合同概览", "风险审查", "材料信息", "待确认"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(t);
                  if (focus && t !== "风险审查")
                    setParams(t === "合同概览" ? { tab: "overview" } : {});
                  else if (!focus)
                    setParams(t === "合同概览" ? { tab: "overview" } : {}, {
                      replace: true,
                    });
                }}
              >
                {t}
                {t === "待确认" && pending.length > 0 && (
                  <b>{pending.length}</b>
                )}
              </button>
            ))}
          </div>
          <div className="review-panel-content" ref={panelContent}>
            {quote && (
              <div className="selected-evidence">
                <div>
                  <FileText size={14} />
                  已选原文
                  <button
                    className="icon-button"
                    aria-label="取消选择原文"
                    onClick={() => setQuote("")}
                  >
                    <X size={14} />
                  </button>
                </div>
                <blockquote>{quote}</blockquote>
                <button
                  className="text-link no-print"
                  onClick={() => setTab("待确认")}
                >
                  根据这段原文记录问题
                </button>
              </div>
            )}
            {tab === "合同概览" && (
              <ContractOverview version={version} onEvidence={showEvidence} />
            )}
            {tab === "风险审查" && (
              <RiskReview
                key={version.id}
                versionId={version.id}
                caseId={item.id}
                onEvidence={showEvidence}
              />
            )}
            {tab === "材料信息" && (
              <>
                <h3 className="review-section-heading">当前文件</h3>
                <dl className="material-info">
                  <div>
                    <dt>所属企业</dt>
                    <dd>{item.company}</dd>
                  </div>
                  <div>
                    <dt>应聘岗位</dt>
                    <dd>{item.role}</dd>
                  </div>
                  <div>
                    <dt>材料分类</dt>
                    <dd>{material.type}</dd>
                  </div>
                  <div>
                    <dt>文件版本</dt>
                    <dd>第 {version.number} 版</dd>
                  </div>
                  <div>
                    <dt>保存时间</dt>
                    <dd>
                      {new Date(version.createdAt).toLocaleString("zh-CN")}
                    </dd>
                  </div>
                  <div>
                    <dt>正文状态</dt>
                    <dd>
                      {version.parseState === "readable"
                        ? "有可读文字"
                        : "待文字识别"}
                    </dd>
                  </div>
                </dl>
                {version.parseNote && (
                  <div className="parse-note">{version.parseNote}</div>
                )}
              </>
            )}
            {tab === "待确认" && (
              <>
                <form className="review-composer" onSubmit={addQuestion}>
                  <label htmlFor="review-question">
                    <MessageSquareText size={16} />
                    记录待确认问题
                  </label>
                  <textarea
                    id="review-question"
                    value={question}
                    maxLength={500}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={2}
                    placeholder="例如：绩效工资的发放条件是什么？"
                  />
                  <div>
                    <span>
                      {quote ? "已关联所选条款" : "保存到当前求职事项"}
                    </span>
                    <button
                      className="button primary small"
                      disabled={!question.trim() || busy}
                    >
                      {busy ? "正在保存…" : "保存待确认问题"}
                    </button>
                  </div>
                </form>
                <h3 className="review-section-heading">这个事项的待确认问题</h3>
                {pending.length ? (
                  <div className="review-pending-list">
                    {pending.map((t) => (
                      <div key={t.id}>
                        <ListChecks size={17} />
                        <p>{t.title}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={<MessageSquareText size={25} />}
                    title="把疑问记录下来"
                    description="你保存的问题会关联到当前企业事项。"
                  />
                )}
                <Link
                  className="text-link"
                  to={`/app/cases/${item.id}?tab=HR%20沟通`}
                >
                  查看事项与沟通记录 <ChevronRight size={15} />
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>
      {upload && (
        <UploadModal
          caseId={item.id}
          materialId={material.id}
          materialType={material.type}
          onClose={() => setUpload(false)}
        />
      )}
      {remove && (
        <Modal
          title="删除这份材料？"
          subtitle={`原文件和全部历史版本都会从${store.mode === "account" ? "账号工作区" : "本设备"}删除。待办与沟通记录仍保留在事项中。`}
          onClose={() => {
            if (!busy) setRemove(false);
          }}
        >
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setRemove(false)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await store.deleteMaterial(material.id);
                  navigate(`/app/cases/${item.id}`);
                  store.notify("材料及历史版本已删除");
                } catch {
                  store.notify("删除失败，请重试。");
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在删除" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
