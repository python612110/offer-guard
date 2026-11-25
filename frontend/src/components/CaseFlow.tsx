import { Link } from "react-router-dom";
import { useStore } from "../store";
export default function CaseFlow({ caseId, active }: { caseId: string; active: number }) {
  const { data } = useStore();
  const first = data.materials.find(m => m.caseId === caseId);
  const steps = [
    ["整理材料", `/app/cases/${caseId}`],
    ["审查报告", first ? `/app/reviews/${first.currentVersionId}` : `/app/cases/${caseId}`],
    ["多材料核对", `/app/consistency?caseId=${caseId}`],
    ["HR 沟通与复审", `/app/cases/${caseId}?tab=HR%20沟通`],
    ["我的决定", `/app/decision?caseId=${caseId}`],
    ["签约档案", `/app/archives?caseId=${caseId}`],
  ];
  return <nav className="case-flow" aria-label="求职签约步骤">
    {steps.map(([label, to], i) => <Link key={label} to={to} aria-current={active === i ? "step" : undefined} className={active === i ? "active" : ""}><b>{i + 1}</b>{label}</Link>)}
  </nav>;
}
