import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { Empty, PageTitle, Tag } from "../components/ui";
import CaseFlow from "../components/CaseFlow";
import SelectField from "../components/SelectField";
import { NewCaseModal } from "../components/forms";
import { comparisonGuidance } from "../lib/comparisonGuidance";
import SalaryFollowup from "../components/SalaryFollowup";
import { exportText } from "../lib/report";

const topics = [
  ["薪资待遇", /薪资|工资|月薪|年薪|绩效|奖金|报酬/],
  ["工作地点与岗位", /地点|城市|岗位|职位|调岗|办公|工作内容/],
  ["合同与试用期限", /期限|试用|转正|生效|报到|入职日期/],
  ["社会保险", /社保|社会保险|五险|公积金|参保/],
  ["工时与休假", /工时|工作时间|加班|休假|休息|调休|工作日/],
  ["违约、培训与竞业", /违约|赔偿|培训|服务期|竞业|押金/],
] as const;

function useCaseSelection() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const id = params.get("caseId") || store.data.cases[0]?.id || "";
  const item = store.data.cases.find((c) => c.id === id);
  return { store, id, item, select: (caseId: string) => setParams({ caseId }) };
}

function Selector({
  id,
  select,
}: {
  id: string;
  select: (id: string) => void;
}) {
  const { data } = useStore();
  return (
    <div className="case-selector">
      <SelectField
        showLabel
        label="当前企业与岗位"
        value={id}
        onChange={select}
        options={data.cases.map((c) => ({
          value: c.id,
          label: `${c.company} · ${c.role}`,
        }))}
      />
    </div>
  );
}

function MissingCase() {
  return (
    <Empty
      title="先创建一个求职事项"
      description="材料、核对与决定会保存在同一企业和岗位下。"
      action={
        <Link className="button primary" to="/app">
          前往工作台
        </Link>
      }
    />
  );
}

export function Consistency() {
  const selection = useCaseSelection();
  return <ConsistencyContent key={selection.id} {...selection} />;
}

function ConsistencyContent({
  store,
  id,
  item,
  select,
}: ReturnType<typeof useCaseSelection>) {
  const [create, setCreate] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [topic, setTopic] = useState("薪资待遇");
  const [status, setStatus] = useState("待核实");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const materials = store.data.materials.filter((m) => m.caseId === id);
  const allVersions = store.data.versions.filter((v) => v.caseId === id);
  const current = materials.map((m) => m.currentVersionId);
  const selectedIds = chosen === null ? current : chosen;
  const versions = allVersions.filter((v) => selectedIds.includes(v.id));
  const onlyVersion = versions.length === 1 ? versions[0] : undefined;
  const [, pattern] = topics.find(([label]) => label === topic) ?? topics[0];
  const evidence = versions.map((version) => ({
    version,
    hits: version.pages.flatMap((p) =>
      p.text
        .split(/\n+/)
        .map((text, line) => ({ page: p.number, line, text: text.trim() }))
        .filter(({ text }) => pattern.test(text)),
    ),
  }));
  const guidance = Object.entries(comparisonGuidance).find(
    ([, value]) => value.topic === topic,
  );
  const records = store.data.records.filter(
    (r) => r.caseId === id && r.kind === "comparison",
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await store.saveRecord(id, "comparison", {
        topic,
        status,
        reason: reason.trim(),
        versionIds: versions.map((v) => v.id),
      });
      setReason("");
      store.notify("核对结论及引用版本已保存");
    } catch (e) {
      store.notify(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page comparison-page">
      <PageTitle
        eyebrow="CROSS-DOCUMENT CHECK"
        title="核对承诺有没有写进合同"
        description="把 Offer、劳动合同或修订版放在一起，从薪资、岗位、试用期等关键约定开始。"
      />
      {!item ? (
        <>
          <Empty
            title="添加你的第一份材料"
            description="先为这个企业和岗位创建一个事项。有两份材料可以并排核对；只有一份合同，也可以先看概览。"
            action={
              <button className="button primary" onClick={() => setCreate(true)}>
                创建求职事项
              </button>
            }
          />
          {create && <NewCaseModal onClose={() => setCreate(false)} />}
        </>
      ) : (
        <>
          <Selector
            id={id}
            select={select}
          />
          <CaseFlow caseId={id} active={2} />
          <section className="panel">
            <div className="workflow-heading">
              <h2>选择材料与版本</h2>
              <span>{versions.length} 项已选</span>
            </div>
            <div className="version-picks">
              {allVersions.map((v) => (
                <label key={v.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(v.id)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...selectedIds, v.id]
                          : selectedIds.filter((k) => k !== v.id),
                      )
                    }
                  />
                  <span>
                    <strong>{v.filename}</strong>
                    <small>
                      第 {v.number} 版 ·{" "}
                      {current.includes(v.id) ? "当前版本" : "历史版本"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            {versions.length < 2 && (
              <div className="workflow-hint">
                <span>至少选择两份材料或两个版本，即可并排核对。</span>
                {onlyVersion && (
                  <Link className="text-link" to={`/app/reviews/${onlyVersion.id}?tab=overview`}>
                    先看这份材料的概览
                  </Link>
                )}
                <Link className="text-link" to={`/app/cases/${id}`}>
                  补充材料
                </Link>
              </div>
            )}
          </section>
          {versions.length >= 2 && (
            <section className="panel">
              <h2>关键约定 · 原文对照</h2>
              <div className="comparison-topics" role="group" aria-label="对照主题">
                {topics.map(([label]) => (
                  <button key={label} type="button" aria-pressed={topic === label} onClick={() => setTopic(label)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="workflow-caption">
                以下按主题词筛选原文，不自动判定一致或违约。「未找到」不代表没有约定。
              </p>
              <div className="comparison-scroll" tabIndex={0} role="region" aria-label="所选版本的原文对照">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>主题</th>
                      {versions.map((v) => (
                        <th key={v.id}>
                          <Link to={`/app/reviews/${v.id}`}>
                            {materials.find((material) => material.id === v.materialId)?.type} · 第 {v.number} 版
                          </Link>
                          <small>{v.filename}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{topic}</th>
                      {evidence.map(({ version: v, hits }) => (
                        <td key={v.id}>
                          {hits.length ? (
                            hits.map((hit) => (
                              <Link
                                className="comparison-quote"
                                to={`/app/reviews/${v.id}?sourcePage=${hit.page}&sourceLine=${hit.line}`}
                                key={`${hit.page}:${hit.line}`}
                              >
                                <small>第 {hit.page} 页</small>
                                <blockquote>{hit.text}</blockquote>
                              </Link>
                            ))
                          ) : (
                            <p className="muted">
                              {v.pages.some((p) => p.text.trim())
                                ? "未找到相关文字 · 请核实全文"
                                : "未读到正文 · 请查看原件"}
                            </p>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {guidance && (
                <div className="comparison-guidance">
                  <strong>可以这样向 HR 确认</strong>
                  <p>{guidance[1].question}</p>
                  <Link
                    className="button secondary small"
                    to={`/app/cases/${id}?tab=${encodeURIComponent("HR 沟通")}&draft=${guidance[0]}`}
                  >
                    带着这个问题去沟通
                  </Link>
                  <small>HR 的回复单独记录；是否已写进正式合同，仍需对照签字版。</small>
                </div>
              )}
            </section>
          )}
          <div className="workflow-columns">
            <section className="panel">
              <h2>保存我的核对</h2>
              <form className="form" onSubmit={submit}>
                <SelectField
                  showLabel
                  label="核对主题"
                  value={topic}
                  onChange={setTopic}
                  options={topics.map(([label]) => label)}
                />
                <SelectField
                  showLabel
                  label="人工核对状态"
                  value={status}
                  onChange={setStatus}
                  options={["待核实", "口径一致", "存在差异", "无法核验"]}
                />
                <label>
                  判断依据或仍需确认的问题
                  <textarea
                    required
                    maxLength={3000}
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="例如：确认 Offer 的年薪是否含奖金"
                  />
                </label>
                <button
                  className="button primary"
                  disabled={busy || versions.length < 2}
                >
                  保存核对及版本快照
                </button>
              </form>
            </section>
            <section className="panel">
              <h2>核对历史</h2>
              {records.length ? (
                records.map((r) => (
                  <article className="record-card" key={r.id}>
                    <Tag>
                      {r.payload.topic} · {r.payload.status}
                    </Tag>
                    <p>{r.payload.reason}</p>
                    <small>
                      {new Date(r.createdAt).toLocaleString("zh-CN")} · 人工记录
                    </small>
                    <div>
                      {r.payload.versionIds.map((v) => (
                        <Link key={v} to={`/app/reviews/${v}`}>
                          {allVersions.find((i) => i.id === v)?.filename ||
                            "已删除的材料版本"}{" "}
                          · 查看{" "}
                        </Link>
                      ))}
                    </div>
                    {r.payload.versionIds.some((v) => !current.includes(v)) && (
                      <p className="parse-note">
                        引用中包含历史或已删除版本，当前材料更新后请重新核对。
                      </p>
                    )}
                    {r.payload.topic === "薪资待遇" && (
                      <SalaryFollowup
                        record={r}
                        versions={allVersions}
                        contracts={allVersions.filter(
                          (v) =>
                            !r.payload.versionIds.includes(v.id) &&
                            materials.some((m) => m.type === "劳动合同" && m.currentVersionId === v.id),
                        )}
                      />
                    )}
                  </article>
                ))
              ) : (
                <p className="workflow-empty">
                  保存核对后，结论和引用版本会显示在这里。
                </p>
              )}
            </section>
          </div>
          <div className="next-action">
            <Link
              className="button primary"
              to={`/app/cases/${id}?tab=HR%20沟通`}
            >
              下一步：向 HR 确认并保存回复
            </Link>
            <Link
              className="button secondary"
              to={`/app/decision?caseId=${id}`}
            >
              查看待确认与我的决定
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function Decision() {
  const { store, id, item, select } = useCaseSelection();
  const [status, setStatus] = useState("继续沟通");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const todos = store.data.todos.filter((t) => t.caseId === id);
  const communications = store.data.communications.filter(
    (c) => c.caseId === id,
  );
  const comparisons = store.data.records.filter(
    (r) => r.caseId === id && r.kind === "comparison",
  );
  const decisions = store.data.records.filter(
    (r) => r.caseId === id && r.kind === "decision",
  );
  const versions = store.data.materials
    .filter((m) => m.caseId === id)
    .map((m) => m.currentVersionId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await store.saveRecord(id, "decision", {
        topic: "我的签约决定",
        status,
        reason: reason.trim(),
        versionIds: versions,
      });
      setReason("");
      store.notify("决定与当前材料版本已保存到档案");
    } catch (e) {
      store.notify(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page decision-page">
      <PageTitle
        eyebrow="YOUR DECISION"
        title="看清剩余问题，保存自己的决定。"
        description="结合原文审查、人工核对和 HR 回复作出判断。这里记录你的决定及理由，不自动生成签约结论。"
      />
      {!item ? (
        <MissingCase />
      ) : (
        <>
          <Selector
            id={id}
            select={(next) => {
              select(next);
              setReason("");
            }}
          />
          <CaseFlow caseId={id} active={4} />
          <div className="decision-summary">
            <div>
              <strong>{todos.filter((t) => !t.done).length}</strong>
              <span>问题仍待确认</span>
            </div>
            <div>
              <strong>{comparisons.length}</strong>
              <span>人工核对记录</span>
            </div>
            <div>
              <strong>{communications.filter((c) => c.reply).length}</strong>
              <span>已记录 HR 回复</span>
            </div>
          </div>
          <div className="workflow-columns">
            <div className="workflow-stack">
              <section className="panel">
                <h2>签约前待确认</h2>
                <p className="workflow-caption">
                  勾选仅记录确认进度，不代表风险已消除。
                </p>
                {todos.length ? (
                  todos.map((t) => (
                    <label
                      className={`decision-check${t.done ? " is-done" : ""}`}
                      key={t.id}
                    >
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() =>
                          store
                            .toggleTodo(t.id)
                            .catch(() => store.notify("保存失败"))
                        }
                      />
                      <span>{t.title}</span>
                    </label>
                  ))
                ) : (
                  <p className="workflow-empty">尚未添加待确认问题。</p>
                )}
                <Link
                  className="text-link"
                  to={`/app/cases/${id}?tab=待确认事项`}
                >
                  补充待确认问题
                </Link>
              </section>
              <section className="panel">
                <h2>最近核对与回复</h2>
                {!comparisons.length && !communications.length && (
                  <p className="workflow-empty">尚未保存核对记录或 HR 回复。</p>
                )}
                {comparisons.slice(0, 3).map((r) => (
                  <article className="record-card" key={r.id}>
                    <Tag>
                      {r.payload.topic} · {r.payload.status}
                    </Tag>
                    <p>{r.payload.reason}</p>
                  </article>
                ))}
                {communications.slice(0, 3).map((c) => (
                  <article className="record-card" key={c.id}>
                    <p>问题：{c.question}</p>
                    <p>HR 回复：{c.reply || "待回复"}</p>
                  </article>
                ))}
                <Link
                  className="text-link"
                  to={`/app/cases/${id}?tab=HR%20沟通`}
                >
                  继续沟通 / 上传修订材料复审
                </Link>
              </section>
            </div>
            <div className="workflow-stack">
              <section className="panel">
                <h2>我的决定</h2>
                <form className="form" onSubmit={submit}>
                  <SelectField
                    showLabel
                    label="接下来"
                    value={status}
                    onChange={setStatus}
                    options={["继续沟通", "准备签约", "放弃"]}
                  />
                  <label>
                    决定理由与保留条件
                    <textarea
                      required
                      maxLength={3000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="简要记录决定的理由和保留条件"
                    />
                  </label>
                  {todos.some((t) => !t.done) && (
                    <p className="workflow-hint">
                      仍有 {todos.filter((t) => !t.done).length}{" "}
                      个问题待确认，保存决定时会保留这些事项。
                    </p>
                  )}
                  <button className="button primary" disabled={busy}>
                    保存我的决定
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>决定历史</h2>
                {!decisions.length && (
                  <p className="workflow-empty">
                    保存决定后，记录会显示在这里。
                  </p>
                )}
                {decisions.map((r) => (
                  <article className="record-card" key={r.id}>
                    <Tag tone="green">{r.payload.status}</Tag>
                    <p>{r.payload.reason}</p>
                    <small>
                      {new Date(r.createdAt).toLocaleString("zh-CN")} ·{" "}
                      {r.payload.versionIds.length} 个材料版本快照
                    </small>
                    {r.payload.versionIds.join() !== versions.join() && (
                      <p className="parse-note">
                        材料版本已变化，建议复核后更新决定。
                      </p>
                    )}
                  </article>
                ))}
              </section>
            </div>
          </div>
          <div className="next-action">
            <button
              className="button secondary"
              onClick={() =>
                exportText(
                  `${item.company}_决定记录`,
                  [
                    `${item.company} · ${item.role}`,
                    "以下是用户记录，非 AI 签约建议。",
                    ...decisions.map(
                      (r) =>
                        `${new Date(r.createdAt).toLocaleString("zh-CN")} · ${r.payload.status}\n${r.payload.reason}\n引用版本：${r.payload.versionIds.join(", ")}`,
                    ),
                    "当前待确认",
                    ...todos.filter((t) => !t.done).map((t) => t.title),
                  ].join("\n\n"),
                )
              }
            >
              导出决定记录 TXT
            </button>
            <Link className="button primary" to={`/app/archives?caseId=${id}`}>
              下一步：查看完整档案
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
