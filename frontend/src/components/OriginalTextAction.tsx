import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import type { TextAnchor } from "../types";
import { api, json } from "../lib/api";
import { publicReviewError } from "../lib/report";
import { Modal } from "./ui";

interface Preview {
  digest: string;
  question: string;
  text: string;
  context: { page: number; paragraph: number; text: string }[];
  history: Turn[];
}

type Turn = { question: string; answer: string };
const scopes = [
  ["selection", "仅选段"],
  ["nearby", "前后文"],
  ["document", "当前版本全文"],
] as const;

export default function OriginalTextAction({
  versionId,
  anchor,
  action,
  close,
}: {
  versionId: string;
  anchor: TextAnchor;
  action: "note" | "ask";
  close: () => void;
}) {
  const store = useStore();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [authorized, setAuthorized] = useState(false);
  const [answer, setAnswer] = useState("");
  const [scope, setScope] = useState<(typeof scopes)[number][0]>("nearby");
  const [history, setHistory] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const note = action === "note";
  const path = `/versions/${versionId}/excerpt`;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !input.trim() || (preview && !authorized)) return;
    setBusy(true);
    setError("");
    try {
      if (note) {
        await store.addAnnotation(versionId, anchor, input.trim());
        close();
      } else {
        const body = { anchor, question: input.trim(), scope, history };
        if (!preview) {
          setPreview(await api<Preview>(`${path}-preview`, json("POST", body)));
        } else {
          const result = await api<{ answer: string }>(
            `${path}-answer`,
            json("POST", {
              ...body,
              digest: preview.digest,
              authorized,
            }),
          );
          setAnswer(result.answer);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? publicReviewError(err.message)
          : "操作未完成，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      className="original-text-modal"
      title={note ? "写原文批注" : "针对原文问 AI"}
      subtitle={
        note
          ? "批注仅保存在当前材料版本，不会发送给 AI。"
          : "无需先审查。可以结合前后文或全文，发送前由你确认。"
      }
      onClose={() => {
        if (!busy) close();
      }}
    >
      <div className="excerpt-dialog">
        {!preview && <blockquote>{anchor.quote}</blockquote>}
        {!note && store.mode !== "account" ? (
          <p>
            本设备工作区可以写批注。使用 AI
            需在账号工作区打开材料；本设备的合同不会自动上传。{" "}
            <Link className="text-link" to="/login">
              前往登录
            </Link>
          </p>
        ) : answer ? (
          <div className="excerpt-answer">
            <p>
              <strong>你的问题：</strong>
              {preview?.question}
            </p>
            <h3>AI 回答</h3>
            <p>{answer}</p>
            <p>
              <small>最近三轮可用于本次连续追问；关闭弹窗后不保留。</small>
            </p>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setHistory((turns) =>
                  [...turns, { question: input.trim(), answer }].slice(-3),
                );
                setPreview(undefined);
                setAuthorized(false);
                setAnswer("");
                setInput("");
              }}
            >
              继续追问
            </button>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            {preview ? (
              <>
                <p>
                  请核对以下脱敏内容。自动脱敏可能遗漏，确认后会发送给第三方 AI
                  服务，并计入每日调用额度。
                </p>
                <blockquote>
                  <strong>选段：</strong>
                  {preview.text}
                  <br />
                  <strong>问题：</strong>
                  {preview.question}
                </blockquote>
                {preview.context.length > 0 && (
                  <details open className="excerpt-context-preview">
                    <summary>
                      {scope === "document"
                        ? "本次发送的可读正文"
                        : "本次发送的前后文"}
                      （{preview.context.length} 段）
                    </summary>
                    <blockquote>
                      {preview.context.map(({ page, paragraph, text }) => (
                        <div key={`${page}-${paragraph}`}>
                          <small>
                            第 {page} 页 · 第 {paragraph} 段
                          </small>
                          <br />
                          {text}
                        </div>
                      ))}
                    </blockquote>
                  </details>
                )}
                {preview.history.length > 0 && (
                  <details open className="excerpt-context-preview">
                    <summary>
                      本次发送的前序问答（{preview.history.length} 轮）
                    </summary>
                    <blockquote>
                      {preview.history.map((turn, i) => (
                        <div key={i}>
                          问：{turn.question}
                          <br />
                          答：{turn.answer}
                        </div>
                      ))}
                    </blockquote>
                  </details>
                )}
                <label className="excerpt-consent">
                  <input
                    type="checkbox"
                    checked={authorized}
                    disabled={busy}
                    onChange={(e) => setAuthorized(e.target.checked)}
                  />
                  我已核对内容并同意发送
                </label>
              </>
            ) : (
              <>
                {!note && (
                  <fieldset className="excerpt-scope">
                    <legend>回答范围</legend>
                    <div>
                      {scopes.map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="excerptScope"
                            checked={scope === value}
                            onChange={() => setScope(value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <small>
                      {scope === "document"
                        ? "仅包含当前版本的可读正文，不含其他材料或批注。"
                        : scope === "nearby"
                          ? "附上选段附近的条款；只选了标题、想问整份合同时，请选择全文。"
                          : "本次不附加其他条款。"}
                      {history.length > 0 &&
                        ` 另附最近 ${history.length} 轮问答。`}
                    </small>
                  </fieldset>
                )}
                <label>
                  {note ? "批注内容" : "你的问题"}
                  <textarea
                    rows={2}
                    maxLength={note ? 2000 : 1000}
                    value={input}
                    required
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      note
                        ? "例如：签约前向 HR 确认这项约定。"
                        : "例如：这段话对试用期工资是怎么约定的？"
                    }
                  />
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="excerpt-actions">
              {preview && (
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => {
                    setPreview(undefined);
                    setAuthorized(false);
                    setError("");
                  }}
                >
                  返回修改
                </button>
              )}
              <button
                className="button primary small"
                disabled={busy || !input.trim() || (!!preview && !authorized)}
              >
                {busy
                  ? preview
                    ? "正在回答…"
                    : "处理中…"
                  : note
                    ? "保存批注"
                    : preview
                      ? "授权并提问"
                      : "预览发送内容"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
