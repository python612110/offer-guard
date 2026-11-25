import { useMemo } from "react";
import type { MaterialVersion } from "../types";
import {
  extractContractOverview,
  type ContractExcerpt,
} from "../lib/contractOverview";

const highlights = [
  "签约双方与单位信息",
  "合同期限与起止日期",
  "岗位与工作内容",
  "工作地点",
  "工资总额与支付周期",
  "试用期限与日期",
];

export default function ContractOverview({
  version,
  onEvidence,
}: {
  version: MaterialVersion;
  onEvidence: (page: number, text: string) => void;
}) {
  const sections = useMemo(
    () => extractContractOverview(version.pages),
    [version.pages],
  );
  const facts = sections.flatMap((section) => section.facts);
  const hasText = version.pages.some(({ text }) => text.trim());
  const evidence = ({ page, text }: ContractExcerpt) => (
    <button
      type="button"
      className="overview-excerpt"
      onClick={() => onEvidence(page, text)}
    >
      <span>{text}</span>
      <small>
        {/\.[mp]?pdf$/i.test(version.filename) ? `第 ${page} 页` : "定位原文"}
      </small>
    </button>
  );
  return (
    <section className="contract-overview" aria-label="合同概览">
      <h3>合同概览</h3>
      {hasText ? (
        <>
          <p className="overview-caption">
            从当前版本的可读正文提取，点击条款可定位原文。未提取到不代表合同没有约定。
          </p>
          <dl className="overview-highlights">
            {highlights.map((label) => {
              const fact = facts.find((entry) => entry.label === label)!;
              const limit =
                label === "签约双方与单位信息"
                  ? 3
                  : label.includes("日期")
                    ? 3
                    : 1;
              const shown = fact.excerpts.slice(0, limit);
              return (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {shown.length ? (
                      shown.map((entry) => (
                        <div key={entry.text}>{evidence(entry)}</div>
                      ))
                    ) : (
                      <span className="overview-missing">未提取到</span>
                    )}
                    {fact.count > shown.length && (
                      <small className="overview-missing">
                        另有表述，见下方对应主题
                      </small>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <h4>按主题查看全部指标</h4>
          <div className="overview-sections">
            {sections.map(({ title, facts }) => (
              <details key={title}>
                <summary>
                  <strong>{title}</strong>
                  <span>
                    {facts.filter((fact) => fact.count).length}/{facts.length}{" "}
                    项有原文
                  </span>
                </summary>
                <dl>
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>
                        {fact.excerpts.length ? (
                          fact.excerpts.map((entry) => (
                            <div key={entry.text}>{evidence(entry)}</div>
                          ))
                        ) : (
                          <span className="overview-missing">未提取到</span>
                        )}
                        {fact.count > fact.excerpts.length && (
                          <small className="overview-missing">
                            另有相关表述，请核对全文。
                          </small>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        </>
      ) : (
        <p className="overview-caption">
          当前版本没有可读正文，暂时无法提取合同信息。扫描件和图片需要文字识别，请查看原件或上传可复制文字的版本。
        </p>
      )}
      {version.parseNote && (
        <p className="overview-caption">{version.parseNote}</p>
      )}
    </section>
  );
}
