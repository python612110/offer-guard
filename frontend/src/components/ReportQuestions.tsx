import { useEffect, useState } from "react";
import { api, json } from "../lib/api";
import { publicReviewError } from "../lib/report";
import { Modal } from "./ui";
interface Message {
  id: string;
  question: string;
  state: string;
  answer: string;
  citations: string[];
  error: string;
}
interface Context {
  digest: string;
  question: string;
  notice: string;
  notes: string[];
  findings: {
    id: string;
    title: string;
    evidence: { original_text: string; page: number }[];
  }[];
}
export default function ReportQuestions({
  runId,
  onCitation,
}: {
  runId: string;
  onCitation: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [preview, setPreview] = useState<Context>();
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const rows = await api<Message[]>(`/reviews/${runId}/questions`);
        if (!active) return;
        setMessages(rows);
        if (rows.some((r) => r.state === "running"))
          timer = setTimeout(load, 2000);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "读取追问失败");
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runId]);
  async function prepare() {
    setBusy(true);
    setError("");
    setAuthorized(false);
    try {
      setPreview(
        await api<Context>(
          `/reviews/${runId}/question-preview`,
          json("POST", { question }),
        ),
      );
      setRequestId(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法预览问题");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!preview || !authorized) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Message>(
        `/reviews/${runId}/questions`,
        json("POST", {
          question: preview.question,
          digest: preview.digest,
          authorized: true,
          requestId,
        }),
      );
      setMessages((old) => [...old.filter((m) => m.id !== next.id), next]);
      setPreview(undefined);
      setQuestion("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "追问失败，请重新读取记录后再操作",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="report-chat no-print">
      <h3>继续问 AI · 围绕这份报告</h3>
      <p>
        可以请 AI 解释线索、梳理问题或起草 HR
        确认话术。回答仅基于本报告，不会读取其他材料。
      </p>
      <div className="chat-messages">
        {messages.map((m) => (
          <article key={m.id}>
            <div className="chat-question">
              <small>我问</small>
              <p>{m.question}</p>
            </div>
            <div className="chat-answer">
              <small>AI · 报告解释</small>
              <p>
                {m.state === "running"
                  ? "正在回答，可离开后回来查看…"
                  : m.error
                    ? publicReviewError(m.error)
                    : m.answer}
              </p>
              {m.citations.map((id) => (
                <button
                  className="text-link"
                  key={id}
                  onClick={() => onCitation(id)}
                >
                  查看引用的风险线索
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      <label>
        向 AI 追问
        <textarea
          aria-label="向 AI 追问"
          rows={2}
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="这条风险是什么意思？我可以怎样向 HR 确认？"
        />
      </label>
      <button
        className="button primary"
        disabled={
          busy ||
          !question.trim() ||
          messages.some((m) => m.state === "running")
        }
        onClick={prepare}
      >
        {busy ? "正在处理…" : "预览追问内容"}
      </button>
      {error && <p role="alert">{publicReviewError(error)}</p>}
      {preview && (
        <Modal
          title="检查并授权 AI 追问"
          onClose={() => {
            if (!busy) setPreview(undefined);
          }}
          subtitle={preview.notice}
        >
          <div className="transmission-preview">
            <h3>将发送的全部内容</h3>
            <pre>
              {JSON.stringify(
                {
                  question: preview.question,
                  findings: preview.findings,
                  notes: preview.notes,
                },
                null,
                2,
              )}
            </pre>
          </div>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            我已检查问题及报告引用，同意发送给第三方 AI 服务。
          </label>
          {error && <p role="alert">{publicReviewError(error)}</p>}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={busy || !authorized}
              onClick={send}
            >
              {busy ? "AI 正在回答…" : "授权并发送追问"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
