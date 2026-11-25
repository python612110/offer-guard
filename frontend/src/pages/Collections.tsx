import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  FolderArchive,
  Plus,
  ScanText,
  Search,
} from "lucide-react";
import { useStore } from "../store";
import { Empty, PageTitle, SectionTitle, Tag } from "../components/ui";
import { NewCaseModal } from "../components/forms";
import { formatDate } from "../lib/storage";
import { exportText } from "../lib/report";
import CaseFlow from "../components/CaseFlow";

export function Reviews() {
  const { data } = useStore();
  const [query, setQuery] = useState("");
  const materials = data.materials.filter((m) =>
    `${m.title} ${m.type} ${data.cases.find((c) => c.id === m.caseId)?.company}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="DOCUMENT REVIEW"
        title="把每一项约定，看清楚。"
        description="查看材料与版本，审查关键条款并下载 PDF 风险报告，再对照其他材料、记录待确认问题。"
      />
      <section className="review-center-banner">
        <span>
          <ScanText size={30} />
        </span>
        <div>
          <h2>审查始终围绕一个求职事项</h2>
          <p>先选择企业与岗位，再添加材料，让每次审查都有明确的上下文。</p>
        </div>
        <Link className="button secondary" to="/app">
          管理求职事项 <ArrowUpRight size={16} />
        </Link>
      </section>
      <section className="panel">
        <SectionTitle
          title="我的材料"
          action={
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="搜索材料"
                placeholder="搜索材料或企业"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          }
        />
        {materials.length ? (
          <div className="collection-materials">
            {materials.map((m) => {
              const v = data.versions.find((v) => v.id === m.currentVersionId)!;
              return (
                <Link
                  to={`/app/reviews/${v.id}`}
                  className="collection-material"
                  key={m.id}
                >
                  <span className="file-icon">
                    <FileText size={23} />
                  </span>
                  <div>
                    <strong>{m.title}</strong>
                    <p>
                      {data.cases.find((c) => c.id === m.caseId)?.company} ·{" "}
                      {m.type}
                    </p>
                  </div>
                  <Tag>打开查看审查</Tag>
                  <span className="collection-version">第 {v.number} 版</span>
                  <ChevronRight size={18} />
                </Link>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={<ScanText size={30} />}
            title={data.materials.length ? "没有匹配的材料" : "从一份材料开始"}
            description={
              data.materials.length
                ? "请尝试其他关键词。"
                : "在求职事项中上传文件，或保存招聘和 HR 沟通文本。"
            }
            action={
              <Link className="button primary" to="/app">
                前往求职工作台 <ArrowUpRight size={16} />
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
export function Archives() {
  const { data } = useStore();
  const [params] = useSearchParams();
  const focused = data.cases.find(c => c.id === params.get("caseId"));
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const companies = [...new Set(data.cases.map((c) => c.company))].filter((c) =>
    c.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="MY SIGNING ARCHIVE"
        title="重要的材料，始终找得到。"
        description="按企业保存求职事项、原始材料、历史版本和沟通记录。"
        action={
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            新建求职事项
          </button>
        }
      />
      {focused && <CaseFlow caseId={focused.id} active={5} />}
      <div className="archives-layout">
        <aside className="panel archive-categories">
          <h3>
            <FolderArchive size={18} />
            我的企业档案
          </h3>
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="搜索企业档案"
              placeholder="搜索企业"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="small-label">企业目录</span>
          {companies.length ? (
            companies.map((c) => (
              <a
                key={c}
                href={`#company-${data.cases.find((i) => i.company === c)?.id}`}
              >
                <FolderArchive size={16} />
                <span>{c}</span>
                <ChevronRight size={14} />
              </a>
            ))
          ) : (
            <p className="muted">添加求职事项后生成企业目录。</p>
          )}
        </aside>
        <section className="archive-content">
          {companies.length ? (
            companies.map((company) => {
              const cases = data.cases.filter((c) => c.company === company);
              return (
                <article
                  className="panel company-archive"
                  id={`company-${cases[0].id}`}
                  key={company}
                >
                  <SectionTitle
                    title={company}
                    caption="每个岗位与招聘批次独立保存"
                  />
                  {cases.map((c) => (
                    <div key={c.id}>
                    <Link
                      to={`/app/cases/${c.id}`}
                      className="archive-case"
                      key={c.id}
                    >
                      <span className="company-avatar">
                        {c.role.slice(0, 1)}
                      </span>
                      <div>
                        <h3>{c.role}</h3>
                        <p>
                          {
                            data.materials.filter((m) => m.caseId === c.id)
                              .length
                          }{" "}
                          份材料 ·{" "}
                          {
                            data.versions.filter((v) => v.caseId === c.id)
                              .length
                          }{" "}
                          个版本 · 创建于 {formatDate(c.createdAt)}
                        </p>
                      </div>
                      <Tag tone={c.stage === "已签约" ? "green" : ""}>
                        {c.stage}
                      </Tag>
                      <ArrowUpRight size={17} />
                    </Link>
                    <div className="archive-details">
                      <p>最近决定：{data.records.find(r => r.caseId === c.id && r.kind === "decision")?.payload.status || "尚未记录"}</p>
                      <div className="archive-report-links">{data.materials.filter(m => m.caseId === c.id).map(m => <Link key={m.id} to={`/app/reviews/${m.currentVersionId}?view=report`}>{m.title} · 查看 / 导出报告</Link>)}</div>
                      <div className="next-action"><Link className="text-link" to={`/app/decision?caseId=${c.id}`}>查看决定与待确认</Link><Link className="text-link" to={`/app/consistency?caseId=${c.id}`}>核对记录</Link><button className="button secondary small" onClick={() => exportText(`${c.company}_求职档案目录`, [
                        `${c.company} · ${c.role} · ${c.stage}`,
                        "材料目录（原件与风险报告请在对应材料页下载）",
                        ...data.versions.filter(v => v.caseId === c.id).map(v => `${v.filename} 第${v.number}版 · ${v.createdAt} · 版本ID ${v.id}`),
                        "核对与决定（用户记录）", ...data.records.filter(r => r.caseId === c.id).map(r => `${r.createdAt} ${r.payload.topic} ${r.payload.status}\n${r.payload.reason}\n版本：${r.payload.versionIds.join(", ")}`),
                        "HR 沟通", ...data.communications.filter(i => i.caseId === c.id).map(i => `问题：${i.question}\n回复：${i.reply || "待回复"}`),
                        "待确认", ...data.todos.filter(t => t.caseId === c.id).map(t => `${t.done ? "已完成" : "待确认"}：${t.title}`),
                      ].join("\n\n"))}>导出档案目录与记录</button></div>
                    </div></div>
                  ))}
                </article>
              );
            })
          ) : (
            <section className="panel">
              <Empty
                icon={<FolderArchive size={32} />}
                title={
                  data.cases.length
                    ? "没有匹配的企业"
                    : "为每家企业，留下一份完整档案"
                }
                description="创建事项后，材料和沟通会归属到对应企业，不会混在一起。"
                action={
                  <button
                    className="button secondary"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={16} />
                    创建求职事项
                  </button>
                }
              />
            </section>
          )}
        </section>
      </div>
      {create && <NewCaseModal onClose={() => setCreate(false)} />}
    </div>
  );
}
