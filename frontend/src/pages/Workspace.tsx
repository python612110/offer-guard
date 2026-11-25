import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  FileText,
  FolderOpen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Upload,
} from "lucide-react";
import { useStore } from "../store";
import { NewCaseModal } from "../components/forms";
import { Empty, PageTitle, SectionTitle, Tag } from "../components/ui";
import { formatDate } from "../lib/storage";
import Mascot from "../components/Mascot";

export default function Workspace() {
  const { data, mode, toggleTodo, notify } = useStore();
  const [create, setCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部事项");
  const active = data.cases.filter(
    (c) => !["已签约", "已放弃", "已归档"].includes(c.stage),
  );
  const waiting = data.todos.filter((t) => !t.done);
  const listed = data.cases.filter(
    (c) =>
      `${c.company} ${c.role} ${c.city}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "全部事项" ||
        (filter === "进行中" &&
          !["已签约", "已放弃", "已归档"].includes(c.stage)) ||
        (filter === "已签约" && c.stage === "已签约")),
  );
  const stats = [
    {
      icon: BriefcaseBusiness,
      label: "进行中的求职",
      value: active.length,
      detail: "各企业事项独立管理",
      cls: "green",
    },
    {
      icon: FileText,
      label: "已保存材料",
      value: data.materials.length,
      detail: "原文件与版本随时查看",
      cls: "blue",
    },
    {
      icon: Timer,
      label: "待完成事项",
      value: waiting.length,
      detail: "把重要问题逐一确认",
      cls: "amber",
    },
    {
      icon: ShieldCheck,
      label: "风险审查状态",
      value: mode === "account" ? "已可用" : "登录使用",
      detail: "风险提示可回到材料原文",
      cls: "purple",
    },
  ];
  return (
    <div className="page workspace-page">
      <PageTitle
        eyebrow="MY JOB JOURNEY"
        title={`${data.profile.name ? `${data.profile.name}，` : ""}每一步，都更有准备。`}
        description="在这里整理求职材料，记录重要约定，掌握签约进度。"
        action={
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            新建求职事项
          </button>
        }
      />
      <section className="workspace-banner">
        <div>
          <span className="banner-label">
            <Sparkles size={14} />
            从收到 Offer，到安心签约
          </span>
          <h2>把材料放在一起，把问题看得更清楚。</h2>
          <p>为每家企业创建独立事项，保存招聘信息、协议和 HR 沟通。</p>
          <button className="banner-link" onClick={() => setCreate(true)}>
            开始整理我的材料 <ArrowRightIcon />
          </button>
        </div>
        <div className="banner-illustration" aria-hidden="true">
          <Mascot className="workspace-mascot" />
          <div className="banner-paper back">
            <i />
            <i />
            <i />
          </div>
          <div className="banner-paper front">
            <span>
              <FileText size={20} /> OFFER
            </span>
            <i />
            <i />
            <div>
              <Check size={15} />
              下一步，有据可依
            </div>
          </div>
          <span className="banner-shield">
            <ShieldCheck size={35} strokeWidth={1.5} />
          </span>
          <span className="banner-sparkle">
            <Sparkles size={19} />
          </span>
        </div>
      </section>
      <div className="stats-grid">
        {stats.map(({ icon: Icon, label, value, detail, cls }) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className={`stat-icon ${cls}`}>
                <Icon size={19} />
              </span>
            </div>
            <strong className={typeof value === "string" ? "stat-text" : ""}>
              {value}
            </strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="workspace-columns">
        <section className="panel cases-panel">
          <SectionTitle
            title="我的求职事项"
            action={
              <Link className="text-link" to="/app/archives">
                查看档案 <ArrowUpRight size={15} />
              </Link>
            }
          />
          <div className="list-toolbar">
            <div className="list-tabs">
              {["全部事项", "进行中", "已签约"].map((f) => (
                <button
                  className={filter === f ? "active" : ""}
                  key={f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="搜索企业或岗位"
                placeholder="搜索企业或岗位"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          {listed.length ? (
            <div className="case-list">
              {listed.map((c) => (
                <Link to={`/app/cases/${c.id}`} className="case-row" key={c.id}>
                  <span className="company-avatar">
                    {c.company.slice(0, 1)}
                  </span>
                  <div className="case-row-info">
                    <strong>{c.company}</strong>
                    <span>
                      {c.role}
                      {c.city && ` · ${c.city}`}
                    </span>
                  </div>
                  <div className="case-row-meta">
                    <Tag tone={c.stage === "已签约" ? "green" : ""}>
                      {c.stage}
                    </Tag>
                    <small>
                      {c.deadline
                        ? `签约截止 ${c.deadline.slice(5).replace("-", "/")}`
                        : `${data.materials.filter((m) => m.caseId === c.id).length} 份材料`}
                    </small>
                  </div>
                  <ChevronRight size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              icon={<FolderOpen size={30} />}
              title={
                data.cases.length
                  ? "没有找到匹配的事项"
                  : "你的下一步，从一个事项开始"
              }
              description={
                data.cases.length
                  ? "试试其他关键词，或切换事项状态。"
                  : "添加企业与岗位，集中管理这次求职的材料和沟通。"
              }
              action={
                !data.cases.length && (
                  <button
                    className="button secondary"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={16} />
                    创建第一个事项
                  </button>
                )
              }
            />
          )}
        </section>
        <aside className="workspace-aside">
          <section className="panel todo-panel">
            <SectionTitle
              title="签约前待办"
              action={
                <Link
                  className="icon-button"
                  to="/app/decision"
                  aria-label="查看全部待办"
                >
                  <ArrowUpRight size={18} />
                </Link>
              }
            />
            {waiting.length ? (
              <div className="todo-list">
                {waiting.slice(0, 4).map((t) => (
                  <div className="todo-item" key={t.id}>
                    <button
                      className="check-button"
                      aria-label={`完成：${t.title}`}
                      onClick={() =>
                        toggleTodo(t.id).catch(() =>
                          notify("保存失败，请重试。"),
                        )
                      }
                    >
                      <Circle size={18} />
                    </button>
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {data.cases.find((c) => c.id === t.caseId)?.company}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="todo-empty">
                <span>
                  <Check size={23} />
                </span>
                <strong>重要的事，逐项确认</strong>
                <p>
                  在求职事项中添加待办，
                  <br />
                  它们会集中显示在这里。
                </p>
              </div>
            )}
          </section>
          <section className="next-step-card">
            <span className="next-step-icon">
              <CalendarDays size={23} />
            </span>
            <h3>不急着决定，先问清楚。</h3>
            <p>薪资构成、工作地点、试用期……把尚未明确的约定记下来。</p>
            <Link to="/app/decision">
              整理我的待确认事项 <ChevronRight size={16} />
            </Link>
          </section>
        </aside>
      </div>
      <section className="panel recent-panel">
        <SectionTitle title="最近动态" caption="材料与求职事项的真实操作记录" />
        {data.events.length ? (
          <div className="recent-events">
            {data.events.slice(0, 4).map((e) => (
              <div key={e.id}>
                <span className="event-dot" />
                <div>
                  <strong>{e.title}</strong>
                  <span>
                    {data.cases.find((c) => c.id === e.caseId)?.company} ·{" "}
                    {e.detail}
                  </span>
                </div>
                <time>{formatDate(e.createdAt)}</time>
              </div>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <Upload size={19} />
            添加事项或材料后，相关记录会显示在这里。
          </div>
        )}
      </section>
      {create && <NewCaseModal onClose={() => setCreate(false)} />}
    </div>
  );
}
function ArrowRightIcon() {
  return <ChevronRight size={17} />;
}
