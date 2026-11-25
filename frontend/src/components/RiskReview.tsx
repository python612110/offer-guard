import { useEffect, useState } from "react";
import { LoaderCircle, ScanText } from "lucide-react";
import { api, json } from "../lib/api";
import { useStore } from "../store";
import { Modal, Tag } from "./ui";
import { Link } from "react-router-dom";
import { publicReviewError } from "../lib/report";
import { downloadReportPdf } from "../lib/reportPdf";
import ReportQuestions from "./ReportQuestions";

interface Finding {
  risk_id: string;
  risk_level: string;
  title: string;
  triggered_rule: string;
  explanation: string;
  suggestion: string;
  status: string;
  evidence: { original_text: string; page: number }[];
  knowledge_evidence: {
    rule_id: string;
    legal_reference: string;
    text: string;
    source: string;
  }[];
}
interface Run {
  currentPolicy?: boolean;
  id: string;
  state: "queued" | "running" | "completed" | "failed";
  error: string;
  attempts: number;
  createdAt: string;
  report: {
    findings: Finding[];
    review_notes: string[];
    coverage?: {
      id: string;
      name: string;
      version: string;
      state: string;
      reason: string;
      source: string;
    }[];
  } | null;
}
interface Preview {
  digest: string;
  clauses: { id: string; page: number; text: string }[];
  notes: string[];
  privacy: string;
  limits: string;
}

const reportScope =
  "仅审查当前版本的可读文字。未发现线索不等于没有风险；请结合原件、附件及现行规定核实。";

export default function RiskReview({
  versionId,
  caseId,
  onEvidence,
}: {
  versionId: string;
  caseId: string;
  onEvidence: (page: number, text: string) => void;
}) {
  const [exporting, setExporting] = useState<string>();
  const [exportError, setExportError] = useState("");
  const store = useStore();
  const [runs, setRuns] = useState<Run[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(store.mode === "account");
  const [saving, setSaving] = useState("");
  const [filter, setFilter] = useState("全部");
  const run = runs[0];
  const processing = run?.state === "queued" || run?.state === "running";
  const completed = run?.state === "completed" && run.currentPolicy !== false;
  useEffect(() => {
    if (store.mode !== "account") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await api<Run[]>(`/versions/${versionId}/reviews`);
        if (!active) return;
        setRuns(data);
        setError("");
        if (data.some((r) => r.state === "queued" || r.state === "running"))
          timer = setTimeout(load, 1500);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "报告读取失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [versionId, store.mode, processing]);

  async function openPreview() {
    setBusy(true);
    setError("");
    setAuthorized(false);
    try {
      setPreview(await api<Preview>(`/versions/${versionId}/review-preview`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法生成传输预览");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!preview || !authorized) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Run>(
        `/versions/${versionId}/reviews`,
        json("POST", {
          digest: preview.digest,
          authorized: true,
          retry: run?.state === "failed",
        }),
      );
      setRuns((old) => [next, ...old.filter((r) => r.id !== next.id)]);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "审查提交失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {store.mode !== "account" ? (
        <p className="parse-note">
          请登录账号后使用 AI 审查。本设备材料不会自动上传。
        </p>
      ) : (
        <>
          {error && (
            <p role="alert" className="parse-note">
              {publicReviewError(error)}
              <button
                className="text-link"
                onClick={() => {
                  setLoading(true);
                  api<Run[]>(`/versions/${versionId}/reviews`)
                    .then(setRuns)
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                重新读取
              </button>
            </p>
          )}
          {loading && (
            <p>
              <LoaderCircle className="spin" size={16} /> 正在读取报告
            </p>
          )}
          {processing && (
            <p role="status" className="parse-note">
              <LoaderCircle className="spin" size={17} />{" "}
              {run.state === "queued"
                ? "已入队，等待审查"
                : "智能模型正在检查当前版本"}
              。可以离开页面，结果会保存到此版本。
            </p>
          )}
          {run?.state === "failed" && (
            <p role="alert" className="parse-note">
              {publicReviewError(run.error)}（已尝试 {run.attempts} 次）
            </p>
          )}
          {!processing && !completed && (
            <button
              className="button primary"
              disabled={busy || loading || (run?.attempts || 0) >= 3}
              onClick={openPreview}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ScanText size={17} />
              )}
              {run?.currentPolicy === false
                ? "按当前规则重新审查"
                : run?.state === "failed"
                  ? "预览并授权重试"
                  : "预览并开始 AI 审查"}
            </button>
          )}
          {!run && !loading && (
            <p className="parse-note">
              发送前请检查脱敏文本并确认授权。扫描件需先提供可读文字。
            </p>
          )}
          {runs
            .filter((r) => r.state === "completed" && r.report)
            .map((r) => (
              <div key={r.id} className="risk-report">
                <h3>当前材料版本的审查结果</h3>
                <small>{new Date(r.createdAt).toLocaleString("zh-CN")}</small>
                <div className="report-actions no-print">
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={!!exporting}
                    onClick={async () => {
                      const report = r.report!;
                      const version = store.data.versions.find(
                        (v) => v.id === versionId,
                      );
                      const item = store.data.cases.find(
                        (c) => c.id === caseId,
                      );
                      const metadata = [
                        [item?.company, item?.role].filter(Boolean).join(" · "),
                        `${version?.filename || "材料"} · 第 ${version?.number || 1} 版`,
                        `报告编号：${r.id} · ${new Date(r.createdAt).toLocaleString("zh-CN")}`,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      setExporting(r.id);
                      setExportError("");
                      try {
                        await downloadReportPdf(
                          `${item?.company || "求职"}_风险报告_第${version?.number || 1}版`,
                          metadata,
                          [
                            {
                              heading: "审查范围",
                              body: [
                                reportScope,
                                ...(r.currentPolicy === false
                                  ? ["旧报告仅覆盖薪资、试用期和社保。"]
                                  : []),
                                report.findings.length
                                  ? `共 ${report.findings.length} 项风险线索，均需人工核实。`
                                  : "本次执行范围内未发现可定位的风险线索。",
                              ].join("\n"),
                            },
                            ...(report.findings.length
                              ? [{ heading: "风险明细", body: "" }]
                              : []),
                            ...report.findings.map((f, i) => ({
                              heading: `${i + 1}. ${publicReviewError(f.title)}`,
                              risk: `风险等级：${f.risk_level}  ·  状态：${f.status}`,
                              body: [
                                `风险说明：${publicReviewError(f.explanation)}`,
                                ...f.evidence.map(
                                  (e) =>
                                    `合同原文（第 ${e.page} 页）：${e.original_text}`,
                                ),
                                `核实建议：${publicReviewError(f.suggestion)}`,
                              ].join("\n"),
                            })),
                          ],
                        );
                      } catch {
                        setExportError("PDF 生成失败，请重试。");
                      } finally {
                        setExporting(undefined);
                      }
                    }}
                  >
                    {exporting === r.id ? "正在生成 PDF…" : "下载 PDF 报告"}
                  </button>
                  <Link
                    className="button secondary small"
                    to={`/app/reviews/${versionId}?view=report`}
                  >
                    专注阅读
                  </Link>
                </div>
                {exportError && <p role="alert">{exportError}</p>}
                {r.currentPolicy === false && (
                  <p className="parse-note">
                    旧报告仅覆盖薪资、试用期和社保，可按当前规则重新审查。
                  </p>
                )}
                {r.report!.coverage?.length ? (
                  <details className="coverage-details">
                    <summary>
                      本次审查范围 ·{" "}
                      {
                        r.report!.coverage.filter((c) => c.state === "已检查")
                          .length
                      }{" "}
                      类已检查
                    </summary>
                    {r.report!.coverage.map((c) => (
                      <p key={c.id}>
                        {c.name} · {c.state === "未进入" ? "未检查" : c.state}
                      </p>
                    ))}
                  </details>
                ) : null}
                <p className="report-scope">{reportScope}</p>
                {!r.report!.findings.length && (
                  <p>
                    本次执行范围内未发现可定位的风险线索。请继续核对原件、附件及未检查项目。
                  </p>
                )}
                <div
                  className="report-filters no-print"
                  aria-label="筛选风险线索"
                >
                  {["全部", "高风险", "待核实"].map((t) => (
                    <button
                      aria-pressed={filter === t}
                      key={t}
                      onClick={() => setFilter(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p>
                  共 {r.report!.findings.length} 项线索 ·{" "}
                  {
                    r.report!.findings.filter((f) => f.risk_level === "高")
                      .length
                  }{" "}
                  项高风险线索
                </p>
                {r.report!.findings.map((f) => (
                  <article
                    id={`finding-${f.risk_id}`}
                    className={`risk-card ${filter === "全部" || (filter === "高风险" ? f.risk_level === "高" : f.risk_level !== "高") ? "" : "filtered-out"}`}
                    key={f.risk_id}
                  >
                    <div>
                      <Tag tone={f.risk_level === "高" ? "amber" : undefined}>
                        {f.risk_level === "高" ? "高风险线索" : "待核实"}
                      </Tag>{" "}
                      <small>{f.triggered_rule}</small>
                    </div>
                    <h3>{f.title}</h3>
                    <p>{f.explanation}</p>
                    {f.evidence.map((e, i) => (
                      <button
                        className="risk-evidence"
                        key={i}
                        onClick={() => onEvidence(e.page, e.original_text)}
                      >
                        <small>第 {e.page} 页 · 点击定位原文</small>
                        <blockquote>{e.original_text}</blockquote>
                      </button>
                    ))}
                    <p>{f.suggestion}</p>
                    <details>
                      <summary>查看审查依据</summary>
                      {f.knowledge_evidence.map((k) => (
                        <div key={k.rule_id}>
                          <p>{k.legal_reference}</p>
                          <p>{k.text}</p>
                          <small>{k.source}</small>
                        </div>
                      ))}
                    </details>
                    <button
                      className="button secondary small no-print"
                      disabled={!!saving}
                      onClick={async () => {
                        setSaving(f.risk_id);
                        try {
                          await store.addTodo(
                            caseId,
                            `${f.title}（${f.triggered_rule}）：${f.suggestion}`,
                          );
                          store.notify("已保存到待确认事项");
                        } catch {
                          store.notify("保存失败，请重试");
                        } finally {
                          setSaving("");
                        }
                      }}
                    >
                      {saving === f.risk_id ? "正在保存" : "保存为待确认问题"}
                    </button>
                  </article>
                ))}
                <ReportQuestions
                  runId={r.id}
                  onCitation={(id) => {
                    setFilter("全部");
                    window.setTimeout(
                      () =>
                        document
                          .getElementById(`finding-${id}`)
                          ?.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                          }),
                      50,
                    );
                  }}
                />
              </div>
            ))}
        </>
      )}
      {preview && (
        <Modal
          title="授权本版本的 AI 审查"
          subtitle="授权后，下方脱敏文本将发送给第三方 AI 服务。原文件、照片、签名和账号资料不会发送。"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <p>{preview.privacy}</p>
          <div className="transmission-preview" aria-label="即将发送的脱敏文本">
            {preview.clauses.map((c) => (
              <div key={c.id}>
                <small>
                  第 {c.page} 页 · {c.id}
                </small>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <p className="parse-note">
            同时发送材料类别和用于分析的审查规则与指令。{preview.limits}
          </p>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            我已检查传输内容，同意发送给第三方 AI 服务并生成待核实报告。
          </label>
          {error && <p role="alert">{publicReviewError(error)}</p>}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={!authorized || busy}
              onClick={start}
            >
              {busy ? "正在提交" : "授权并开始审查"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
