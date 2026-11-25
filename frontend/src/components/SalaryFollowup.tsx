import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { CaseRecord, MaterialVersion, SalaryFollowupInput } from "../types";
import { useStore } from "../store";
import SelectField from "./SelectField";

const labels = {
  track: "待确认问题",
  reply: "HR 回复",
  confirmed: "人工确认已写明",
  unresolved: "仍未写明",
};

export default function SalaryFollowup({
  record,
  contracts,
  versions,
}: {
  record: CaseRecord;
  contracts: MaterialVersion[];
  versions: MaterialVersion[];
}) {
  const store = useStore();
  const steps = record.payload.salaryFollowup ?? [];
  const latest = steps.at(-1);
  const hasReply = steps.some((step) => step.kind === "reply");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [pick, setPick] = useState("");
  const [result, setResult] = useState<"confirmed" | "unresolved">("unresolved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contract = contracts.find((v) => v.id === pick) ?? contracts[0];
  const currentConfirmation = latest?.kind === "confirmed" &&
    contracts.some((v) => v.id === latest.versionId);
  const status = currentConfirmation ? "当前合同已人工确认"
    : !hasReply ? "待 HR 回复"
    : latest?.kind === "confirmed" ? "合同版本已变更，待复核"
    : latest?.kind === "unresolved" && latest.versionId === contract?.id ? "当前合同仍未写明"
    : contract ? "有当前合同可复核" : "HR 已回复，待补充新版";

  async function save(input: SalaryFollowupInput) {
    setBusy(true);
    setError("");
    try {
      await store.saveSalaryFollowup(record.id, steps.length, input);
      if (input.kind === "reply") setDraft("");
      else setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function submitReply(e: FormEvent) {
    e.preventDefault();
    if (draft.trim()) void save({ kind: "reply", note: draft });
  }

  return (
    <div className="salary-followup">
      {!latest ? (
        <button className="button secondary small" disabled={busy} onClick={() =>
          void save({ kind: "track", note: record.payload.reason })}>
          追踪这条薪资问题
        </button>
      ) : (
        <>
          <strong className="salary-followup-status" data-confirmed={currentConfirmation}>{status}</strong>
          <ol aria-label="薪资复核时间线">
            {steps.map((step, index) => {
              const version = versions.find((v) => v.id === step.versionId);
              return (
                <li key={index}>
                  <strong>{labels[step.kind]}</strong>
                  <p>{step.note}</p>
                  {version ? (
                    <Link to={`/app/reviews/${version.id}?tab=overview`}>
                      {version.filename} · 第 {version.number} 版
                    </Link>
                  ) : step.versionId ? <small>引用的版本已删除</small> : null}
                </li>
              );
            })}
          </ol>
          <details open={hasReply ? undefined : true}>
            <summary>{hasReply ? "补充 HR 回复" : "记录 HR 回复"}</summary>
            <form className="form" onSubmit={submitReply}>
              <label>
                HR 回复原话
                <textarea rows={2} maxLength={2000} required value={draft} onChange={(e) => setDraft(e.target.value)} />
              </label>
              <button className="button secondary small" disabled={busy || !draft.trim()}>保存 HR 回复</button>
            </form>
          </details>
          {hasReply && contract && !currentConfirmation && (
            <details>
              <summary>复核当前合同</summary>
              <form className="form" onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) void save({ kind: result, note, versionId: contract.id });
              }}>
                <SelectField showLabel label="复核的合同版本" value={contract.id} onChange={setPick}
                  options={contracts.map((v) => ({ value: v.id, label: `${v.filename} · 第 ${v.number} 版` }))} />
                <Link className="text-link" to={`/app/reviews/${contract.id}?tab=overview`}>打开合同概览与原文</Link>
                <SelectField showLabel label="人工复核结果" value={result}
                  onChange={(value) => setResult(value === "confirmed" ? "confirmed" : "unresolved")}
                  options={[{ value: "unresolved", label: "仍未写明" }, { value: "confirmed", label: "已写明" }]} />
                <label>
                  复核依据
                  <textarea rows={2} maxLength={2000} required placeholder="写下具体条款，或说明还有哪里没写清楚" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <button className="button primary small" disabled={busy || !note.trim()}>保存人工复核</button>
              </form>
            </details>
          )}
          {hasReply && !contract && (
            <Link className="text-link" to={`/app/cases/${record.caseId}`}>补充新版劳动合同</Link>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
