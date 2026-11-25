import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  History,
  MapPin,
  MessageSquareText,
  Plus,
  Trash2,
  Upload,
  CalendarDays,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { useStore } from "../store";
import { fetchBlob } from "../lib/api";
import { getComparisonQuestion } from "../lib/comparisonGuidance";
import { STAGES } from "../types";
import { UploadModal } from "../components/forms";
import { Empty, Modal, SectionTitle, Tag } from "../components/ui";
import { downloadBlob, formatDate, formatSize } from "../lib/storage";
import CaseFlow from "../components/CaseFlow";
import SelectField from "../components/SelectField";

export default function CaseDetail() {
  const { caseId } = useParams();
  const store = useStore();
  const { data } = store;
  const navigate = useNavigate();
  const item = data.cases.find((c) => c.id === caseId);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "求职材料";
  const draftQuestion = getComparisonQuestion(params.get("draft"));
  const setTab = (value: string) => setParams({ tab: value });
  const [upload, setUpload] = useState(false);
  const [remove, setRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [todo, setTodo] = useState("");
  const [busy, setBusy] = useState(false);
  if (!item)
    return (
      <div className="page">
        <Empty
          title="这个求职事项不存在"
          description="它可能已被删除，请回到工作台查看。"
          action={
            <Link className="button primary" to="/app">
              返回工作台
            </Link>
          }
        />
      </div>
    );
  const materials = data.materials.filter((m) => m.caseId === caseId);
  const todos = data.todos.filter((t) => t.caseId === caseId);
  const communications = data.communications.filter((c) => c.caseId === caseId);
  async function addTodo(e: FormEvent) {
    e.preventDefault();
    if (!todo.trim() || !caseId) return;
    setBusy(true);
    try {
      await store.addTodo(caseId, todo);
      setTodo("");
    } catch {
      store.notify("保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function saveCommunication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await store.saveCommunication(
        item!.id,
        String(form.get("question")).trim(),
        String(form.get("reply")).trim(),
      );
      formElement.reset();
      if (draftQuestion) setParams({ tab: "HR 沟通" }, { replace: true });
      store.notify("沟通记录已保存，尚未执行 AI 核验");
    } catch {
      store.notify("保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page case-detail">
      <Link className="back-link" to="/app">
        <ArrowLeft size={16} />
        我的求职事项
      </Link>
      <div className="case-heading">
        <span className="company-avatar large">{item.company.slice(0, 1)}</span>
        <div>
          <span className="eyebrow">JOB APPLICATION</span>
          <h1>{item.company}</h1>
          <div className="case-heading-meta">
            <span>{item.role}</span>
            {item.city && (
              <span>
                <MapPin size={14} />
                {item.city}
              </span>
            )}
            {item.deadline && (
              <span>
                <CalendarDays size={14} />
                截止 {item.deadline}
              </span>
            )}
          </div>
        </div>
        <div className="case-heading-actions">
          <SelectField
            compact
            label="求职阶段"
            value={item.stage}
            options={STAGES}
            onChange={(stage) =>
              store
                .updateStage(item.id, stage)
                .catch(() => store.notify("阶段保存失败。"))
            }
          />
          <button className="button primary" onClick={() => setUpload(true)}>
            <Upload size={17} />
            添加材料
          </button>
        </div>
      </div>
      <CaseFlow caseId={item.id} active={tab === "HR 沟通" ? 3 : 0} />
      <div className="case-overview-strip">
        <span>
          <FolderOpen size={18} />
          <strong>{materials.length}</strong>份材料
        </span>
        <span>
          <History size={18} />
          <strong>
            {data.versions.filter((v) => v.caseId === caseId).length}
          </strong>
          个文件版本
        </span>
        <span>
          <Circle size={17} />
          <strong>{todos.filter((t) => !t.done).length}</strong>项待办
        </span>
        <span className="case-ai-state">
          <ShieldCheck size={18} />
          审查结果请打开材料查看
        </span>
      </div>
      <div className="case-tabs">
        {["求职材料", "待确认事项", "HR 沟通", "时间线"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "求职材料" && (
        <section className="panel">
          <SectionTitle
            title="材料与版本"
            caption="上传更新后的文件会保留历史版本，原文始终可追溯。"
            action={
              <button className="text-link" onClick={() => setUpload(true)}>
                <Plus size={16} />
                添加材料
              </button>
            }
          />
          {materials.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>材料名称</th>
                    <th>分类</th>
                    <th>当前版本</th>
                    <th>保存时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => {
                    const v = data.versions.find(
                      (v) => v.id === m.currentVersionId,
                    )!;
                    return (
                      <tr key={m.id}>
                        <td>
                          <Link
                            className="file-link"
                            to={`/app/reviews/${v.id}`}
                          >
                            <span className="file-icon">
                              <FileText size={20} />
                            </span>
                            <div>
                              <strong>{m.title}</strong>
                              <small>
                                {formatSize(v.size)} ·{" "}
                                {v.parseState === "readable"
                                  ? "原文可查看"
                                  : "需要文字识别"}
                              </small>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <Tag>{m.type}</Tag>
                        </td>
                        <td>第 {v.number} 版</td>
                        <td>{formatDate(v.createdAt)}</td>
                        <td>
                          <div className="table-actions">
                            <Link
                              className="text-link"
                              to={`/app/reviews/${v.id}`}
                            >
                              查看 <ArrowUpRight size={14} />
                            </Link>
                            <button
                              className="icon-button"
                              aria-label={`下载 ${m.title}`}
                              onClick={async () => {
                                try {
                                  const blob =
                                    v.blob ||
                                    (v.fileUrl
                                      ? await fetchBlob(v.fileUrl)
                                      : undefined);
                                  if (!blob)
                                    throw new Error("原文件无法读取。");
                                  downloadBlob(blob, v.filename);
                                } catch (e) {
                                  store.notify(
                                    e instanceof Error
                                      ? e.message
                                      : "下载失败。",
                                  );
                                }
                              }}
                            >
                              <Download size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="先把求职材料放在这里"
              description="支持招聘信息、Offer、三方协议、劳动合同与沟通记录。"
              action={
                <button
                  className="button secondary"
                  onClick={() => setUpload(true)}
                >
                  <Upload size={16} />
                  添加第一份材料
                </button>
              }
            />
          )}
        </section>
      )}
      {tab === "待确认事项" && (
        <section className="panel">
          <SectionTitle
            title="签约前，再确认一步"
            caption="记录需要问清楚的问题；完成待办不会自动代表风险已消除。"
          />
          <form className="inline-form" onSubmit={addTodo}>
            <input
              aria-label="待确认事项内容"
              value={todo}
              maxLength={300}
              onChange={(e) => setTodo(e.target.value)}
              placeholder="例如：请 HR 书面确认绩效工资的发放条件"
              required
            />
            <button className="button primary" disabled={busy}>
              <Plus size={16} />
              添加待办
            </button>
          </form>
          {todos.length ? (
            <div className="todo-list case-todos">
              {todos.map((t) => (
                <div className={`todo-item ${t.done ? "done" : ""}`} key={t.id}>
                  <button
                    className="check-button"
                    aria-label={`${t.done ? "重新打开" : "完成"}：${t.title}`}
                    onClick={() =>
                      store
                        .toggleTodo(t.id)
                        .catch(() => store.notify("保存失败。"))
                    }
                  >
                    {t.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                  <strong>{t.title}</strong>
                  <Tag tone={t.done ? "green" : "amber"}>
                    {t.done ? "已完成" : "待确认"}
                  </Tag>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<MessageSquareText size={26} />}
              title="把重要疑问记下来"
              description="这些事项也会同步显示在工作台与决策助手。"
            />
          )}
        </section>
      )}
      {tab === "HR 沟通" && (
        <div className="communication-grid">
          <section className="panel">
            <SectionTitle
              title="保存沟通记录"
              caption="保留问题与回复，后续复核时可以回看。"
            />
            <form className="form panel-form" onSubmit={saveCommunication}>
              <label>
                向 HR 确认的问题
                <textarea
                  key={`${caseId}:${draftQuestion}`}
                  name="question"
                  required
                  maxLength={10000}
                  rows={3}
                  defaultValue={draftQuestion}
                  placeholder="填写实际沟通的问题"
                />
              </label>
              <label>
                HR 的回复
                <textarea
                  name="reply"
                  rows={5}
                  maxLength={20000}
                  placeholder="粘贴原回复；暂未回复可以留空"
                />
              </label>
              <button className="button primary" disabled={busy}>
                <MessageSquareText size={16} />
                保存记录
              </button>
            </form>
          </section>
          <section className="panel">
            <SectionTitle title="沟通历史" />
            {communications.length ? (
              <div className="communication-list">
                {communications.map((c) => (
                  <article key={c.id}>
                    <time>{formatDate(c.createdAt)}</time>
                    <span className="communication-label">我向 HR 确认</span>
                    <p>{c.question}</p>
                    <span className="communication-label">HR 回复</span>
                    <p>{c.reply || "尚未记录回复"}</p>
                    <Tag tone="amber">尚未核验</Tag>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="还没有沟通记录"
                description="保存原始回复，避免口头承诺与正式约定混淆。"
              />
            )}
          </section>
        </div>
      )}
      {tab === "时间线" && (
        <section className="panel">
          <SectionTitle
            title="求职事项时间线"
            caption="记录真实操作，不覆盖过去的材料版本。"
          />
          <div className="timeline">
            {data.events
              .filter((e) => e.caseId === caseId)
              .map((e) => (
                <div className="timeline-item" key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <time>{new Date(e.createdAt).toLocaleString("zh-CN")}</time>
                    <h3>{e.title}</h3>
                    <p>{e.detail}</p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
      <div className="case-bottom">
        <p>
          {store.mode === "account"
            ? "当前材料保存在账号工作区"
            : "当前材料仅保存在本设备"}
          ，账号模式可在材料页预览并授权 AI 风险审查。
        </p>
        <button className="danger-text" onClick={() => setRemove(true)}>
          <Trash2 size={15} />
          删除这个事项
        </button>
      </div>
      {upload && (
        <UploadModal caseId={item.id} onClose={() => setUpload(false)} />
      )}
      {remove && (
        <Modal
          title="删除求职事项？"
          subtitle={`这会删除${store.mode === "account" ? "账号工作区" : "本设备"}中该事项的全部材料、版本、待办和沟通记录，无法撤销。`}
          onClose={() => {
            if (!removing) setRemove(false);
          }}
        >
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(false)}
              disabled={removing}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                try {
                  await store.deleteCase(item.id);
                  navigate("/app");
                  store.notify("事项与关联材料已删除");
                } catch {
                  store.notify("删除失败，请重试。");
                  setRemoving(false);
                }
              }}
            >
              {removing ? "正在删除" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
