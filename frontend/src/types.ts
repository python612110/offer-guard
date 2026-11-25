export const MATERIAL_TYPES = [
  "招聘信息",
  "Offer",
  "三方协议",
  "劳动合同",
  "HR 沟通记录",
  "其他材料",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export const STAGES = [
  "材料收集中",
  "已获 Offer",
  "签约确认中",
  "已签约",
  "已放弃",
  "已归档",
] as const;
export type Stage = (typeof STAGES)[number];

export interface JobCase {
  id: string;
  company: string;
  role: string;
  city: string;
  deadline: string;
  stage: Stage;
  createdAt: string;
}
export interface DocumentPage {
  number: number;
  text: string;
}
export interface MaterialVersion {
  id: string;
  materialId: string;
  caseId: string;
  number: number;
  filename: string;
  mime: string;
  blob?: Blob;
  fileUrl?: string;
  size: number;
  createdAt: string;
  pages: DocumentPage[];
  parseState: "readable" | "needs-confirmation";
  parseNote: string;
}
export interface Material {
  id: string;
  caseId: string;
  title: string;
  type: MaterialType;
  currentVersionId: string;
  createdAt: string;
}
export interface Todo {
  id: string;
  caseId: string;
  title: string;
  done: boolean;
  createdAt: string;
}
export interface Communication {
  id: string;
  caseId: string;
  question: string;
  reply: string;
  createdAt: string;
}
export interface TimelineEvent {
  id: string;
  caseId: string;
  title: string;
  detail: string;
  createdAt: string;
}
export interface PersonalAsset {
  id: string;
  type: "photo" | "signature";
  filename: string;
  blob: Blob;
  createdAt: string;
}
export interface Profile {
  name: string;
  school: string;
  role: string;
}
export interface AppData {
  annotations: Annotation[];
  records: CaseRecord[];
  cases: JobCase[];
  materials: Material[];
  versions: MaterialVersion[];
  todos: Todo[];
  communications: Communication[];
  events: TimelineEvent[];
  assets: PersonalAsset[];
  profile: Profile;
}
export interface TextAnchor {
  page: number;
  paragraph: number;
  quote: string;
  pdfRects?: { x: number; y: number; width: number; height: number }[];
}
export type MarkColor = "yellow" | "red";
export interface Annotation {
  id: string;
  caseId: string;
  versionId: string;
  anchor: TextAnchor & { color?: MarkColor };
  note: string;
  createdAt: string;
}
export interface CaseRecord {
  id: string;
  caseId: string;
  kind: "comparison" | "decision";
  payload: {
    topic: string;
    status: string;
    reason: string;
    versionIds: string[];
    salaryFollowup?: SalaryFollowupStep[];
  };
  createdAt: string;
}

export interface SalaryFollowupInput {
  kind: "track" | "reply" | "confirmed" | "unresolved";
  note: string;
  versionId?: string;
}

export interface SalaryFollowupStep extends SalaryFollowupInput {
  createdAt: string;
}
