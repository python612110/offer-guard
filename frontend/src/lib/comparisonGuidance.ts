export const comparisonGuidance = {
  salary: {
    topic: "薪资待遇",
    question:
      "想确认一下，Offer 上的薪资和合同里的工资分别包含哪些项目？固定、浮动部分及发放条件会写在哪份正式文件里？",
  },
  location: {
    topic: "工作地点与岗位",
    question:
      "想确认一下，我的正式岗位和常驻工作地点是什么？如有调整，适用条件会写在哪份正式文件里？",
  },
  probation: {
    topic: "合同与试用期限",
    question:
      "想确认一下，正式合同期限、试用期的起止时间和转正条件分别是什么？可以在签字版里写清楚吗？",
  },
} as const;

export function getComparisonQuestion(key: string | null): string {
  return key === "salary" || key === "location" || key === "probation"
    ? comparisonGuidance[key].question
    : "";
}
