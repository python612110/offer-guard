import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyData, readData, writeData } from "./lib/storage";
import { parseFile } from "./lib/parser";
import {
  api,
  json,
  readWorkspace,
  setSession,
  type Account,
  type SessionInfo,
} from "./lib/api";
import type {
  AppData,
  JobCase,
  MaterialType,
  PersonalAsset,
  Profile,
  Stage,
  CaseRecord,
  SalaryFollowupInput,
  TextAnchor,
  MarkColor,
} from "./types";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
function event(caseId: string, title: string, detail = "") {
  return { id: id(), caseId, title, detail, createdAt: now() };
}
interface Store {
  addAnnotation: (versionId: string, anchor: TextAnchor, note: string, color?: MarkColor) => Promise<void>;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  entered: boolean;
  saveRecord: (caseId: string, kind: CaseRecord["kind"], payload: CaseRecord["payload"]) => Promise<void>;
  saveSalaryFollowup: (recordId: string, revision: number, input: SalaryFollowupInput) => Promise<void>;
  mode: "local" | "account";
  user: Account | null;
  signIn: (
    email: string,
    password: string,
    register?: boolean,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  useLocal: () => Promise<void>;
  data: AppData;
  loading: boolean;
  notice: string;
  notify: (message: string) => void;
  createCase: (input: Omit<JobCase, "id" | "createdAt">) => Promise<string>;
  updateStage: (caseId: string, stage: Stage) => Promise<void>;
  deleteCase: (caseId: string) => Promise<void>;
  upload: (
    caseId: string,
    file: File,
    type: MaterialType,
    materialId?: string,
  ) => Promise<string>;
  saveText: (
    caseId: string,
    title: string,
    text: string,
    type: MaterialType,
  ) => Promise<string>;
  deleteMaterial: (materialId: string) => Promise<void>;
  addTodo: (caseId: string, title: string) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  saveCommunication: (
    caseId: string,
    question: string,
    reply: string,
  ) => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  saveAsset: (file: File, type: PersonalAsset["type"]) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
  clear: () => Promise<void>;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const current = useRef(data);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"local" | "account">(() =>
    localStorage.getItem("offerguard-mode") === "account" ? "account" : "local",
  );
  const [user, setUser] = useState<Account | null>(null);
  const [entered, setEntered] = useState(() => localStorage.getItem("offerguard-mode") !== null);
  const apply = (next: AppData) => {
    current.current = next;
    setData(next);
  };
  useEffect(() => {
    let active = true;
    (async () => {
      if (localStorage.getItem("offerguard-mode") === "account") {
        const session = await api<SessionInfo>("/auth/me");
        setSession(session);
        const next = await readWorkspace();
        if (active) {
          setUser(session.user);
          apply(next);
        }
      } else {
        const next = await readData();
        if (active) apply(next);
      }
    })()
      .catch((error) => {
        if (active)
          setNotice(
            error instanceof Error ? error.message : "无法读取工作区。",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expire = () => {
      setSession();
      setUser(null);
      apply(emptyData());
      setNotice("登录已过期，请重新登录。");
    };
    window.addEventListener("offerguard-session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("offerguard-session-expired", expire);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const commit = (fn: (value: AppData) => AppData) => {
    const pending = queue.current.then(async () => {
      const next = fn(current.current);
      await writeData(next);
      current.current = next;
      setData(next);
    });
    queue.current = pending.catch(() => {});
    return pending;
  };
  const remote = <T,>(operation: () => Promise<T>): Promise<T> => {
    const pending = queue.current.then(async () => {
      const result = await operation();
      try {
        apply(await readWorkspace());
      } catch (error) {
        throw new Error(
          `操作已保存，但刷新失败。请刷新页面，勿重复提交。${error instanceof Error ? error.message : ""}`,
        );
      }
      return result;
    });
    queue.current = pending.then(
      () => {},
      () => {},
    );
    return pending;
  };
  const value: Store = {
    entered,
    async addAnnotation(versionId, anchor, note, color) {
      if (mode === "account") {
        await remote(() => api(`/versions/${versionId}/annotations`, json("POST", { anchor, note, color })));
        return;
      }
      await commit((d) => {
        const version = d.versions.find((v) => v.id === versionId);
        const paragraphs = version?.pages.find((p) => p.number === anchor.page)?.text
          .split(/\n+/).filter((text) => text.trim());
        if (!version || !anchor.quote.trim() || !paragraphs?.[anchor.paragraph]?.includes(anchor.quote))
          throw new Error("选段无法在当前版本定位，请重新选择。");
        return { ...d, annotations: [
          { id: id(), caseId: version.caseId, versionId, anchor: { ...anchor, color }, note, createdAt: now() },
          ...d.annotations,
        ] };
      });
    },
    async deleteAnnotation(annotationId) {
      if (mode === "account") {
        await remote(() => api(`/annotations/${annotationId}`, json("DELETE")));
        return;
      }
      await commit((d) => ({ ...d, annotations: d.annotations.filter((a) => a.id !== annotationId) }));
    },
    async saveRecord(caseId, kind, payload) {
      if (mode === "account") {
        await remote(() => api(`/cases/${caseId}/records`, json("POST", { kind, ...payload })));
        return;
      }
      await commit(d => {
        if (!d.cases.some(c => c.id === caseId)) throw new Error("事项不存在。");
        return { ...d, records: [{ id: id(), caseId, kind, payload, createdAt: now() }, ...d.records],
          events: [event(caseId, kind === "decision" ? "保存我的决定" : "保存人工核对", payload.status), ...d.events] };
      });
    },
    async saveSalaryFollowup(recordId, revision, input) {
      if (mode === "account") {
        await remote(() => api(`/records/${recordId}/salary-followup`, json("POST", { ...input, revision })));
        return;
      }
      await commit((d) => {
        const record = d.records.find((r) => r.id === recordId && r.kind === "comparison" && r.payload.topic === "薪资待遇");
        if (!record) throw new Error("没有找到薪资核对记录。");
        const steps = record.payload.salaryFollowup ?? [];
        if (revision !== steps.length) throw new Error("记录已更新，请刷新后再保存。");
        if (steps.length >= 30) throw new Error("已达到追踪上限，请新建核对记录。");
        const note = input.note.trim();
        if (!note || note.length > 3000) throw new Error("请填写 1 到 3000 字。");
        if ((input.kind === "track") !== !steps.length) throw new Error("请先开启追踪。");
        if (input.kind === "confirmed" || input.kind === "unresolved") {
          if (!steps.some((step) => step.kind === "reply")) throw new Error("请先记录 HR 回复。");
          if (!input.versionId || record.payload.versionIds.includes(input.versionId) ||
              !d.materials.some((m) => m.caseId === record.caseId && m.type === "劳动合同" && m.currentVersionId === input.versionId))
            throw new Error("请选择未参与原核对的当前劳动合同版本。");
        }
        const payload = { ...record.payload, salaryFollowup: [...steps, { ...input, note, createdAt: now() }] };
        return { ...d, records: d.records.map((r) => r.id === recordId ? { ...r, payload } : r) };
      });
    },
    mode,
    user,
    async signIn(email, password, register = false) {
      await queue.current;
      const session = await api<SessionInfo>(
        register ? "/auth/register" : "/auth/login",
        json("POST", { email, password }),
      );
      setSession(session);
      localStorage.setItem("offerguard-mode", "account");
      setMode("account");
      setEntered(true);
      apply(emptyData());
      const next = await readWorkspace();
      apply(next);
      setUser(session.user);
    },
    async signOut() {
      await queue.current;
      await api("/auth/logout", json("POST"));
      setSession();
      setUser(null);
      apply(emptyData());
    },
    async useLocal() {
      await queue.current;
      if (user) await api("/auth/logout", json("POST"));
      const next = await readData();
      setSession();
      setUser(null);
      setMode("local");
      setEntered(true);
      localStorage.setItem("offerguard-mode", "local");
      apply(next);
    },
    data,
    loading,
    notice,
    notify: setNotice,
    async createCase(input) {
      if (mode === "account")
        return (
          await remote(() => api<{ id: string }>("/cases", json("POST", input)))
        ).id;
      const caseId = id();
      await commit((d) => ({
        ...d,
        cases: [{ ...input, id: caseId, createdAt: now() }, ...d.cases],
        events: [event(caseId, "创建求职事项", input.role), ...d.events],
      }));
      return caseId;
    },
    async updateStage(caseId, stage) {
      if (mode === "account") {
        await remote(() => api(`/cases/${caseId}`, json("PATCH", { stage })));
        return;
      }
      await commit((d) => ({
        ...d,
        cases: d.cases.map((c) => (c.id === caseId ? { ...c, stage } : c)),
        events: [event(caseId, "更新求职阶段", stage), ...d.events],
      }));
    },
    async deleteCase(caseId) {
      if (mode === "account") {
        await remote(() => api(`/cases/${caseId}`, json("DELETE")));
        return;
      }
      await commit((d) => ({
        ...d,
        cases: d.cases.filter((c) => c.id !== caseId),
        materials: d.materials.filter((m) => m.caseId !== caseId),
        versions: d.versions.filter((v) => v.caseId !== caseId),
        todos: d.todos.filter((t) => t.caseId !== caseId),
        communications: d.communications.filter((c) => c.caseId !== caseId),
        events: d.events.filter((e) => e.caseId !== caseId),
        records: d.records.filter(r => r.caseId !== caseId),
        annotations: d.annotations.filter((a) => a.caseId !== caseId),
      }));
    },
    async upload(caseId, file, type, materialId) {
      if (mode === "account") {
        const form = new FormData();
        form.set("file", file);
        form.set("type", type);
        if (materialId) form.set("material_id", materialId);
        return (
          await remote(() =>
            api<{ id: string }>(`/cases/${caseId}/materials`, {
              method: "POST",
              body: form,
            }),
          )
        ).id;
      }
      if (!current.current.cases.some((c) => c.id === caseId))
        throw new Error("求职事项不存在。");
      const parsed = await parseFile(file);
      const versionId = id();
      await commit((d) => {
        if (!d.cases.some((c) => c.id === caseId))
          throw new Error("事项已被删除，无法保存。");
        const existing = materialId
          ? d.materials.find((m) => m.id === materialId && m.caseId === caseId)
          : undefined;
        if (materialId && !existing)
          throw new Error("材料不存在，无法创建版本。");
        const mid = existing?.id || id();
        const number = existing
          ? Math.max(
              ...d.versions
                .filter((v) => v.materialId === mid)
                .map((v) => v.number),
            ) + 1
          : 1;
        const version = {
          id: versionId,
          materialId: mid,
          caseId,
          number,
          filename: file.name,
          mime: file.type,
          blob: file,
          size: file.size,
          createdAt: now(),
          pages: parsed.pages,
          parseState: parsed.pages.some((p) => p.text.trim())
            ? ("readable" as const)
            : ("needs-confirmation" as const),
          parseNote: parsed.note,
        };
        return {
          ...d,
          materials: existing
            ? d.materials.map((m) =>
                m.id === mid ? { ...m, currentVersionId: versionId } : m,
              )
            : [
                {
                  id: mid,
                  caseId,
                  title: file.name,
                  type,
                  currentVersionId: versionId,
                  createdAt: now(),
                },
                ...d.materials,
              ],
          versions: [version, ...d.versions],
          events: [
            event(
              caseId,
              existing ? "保存材料新版本" : "添加材料",
              `${file.name} · 第 ${number} 版`,
            ),
            ...d.events,
          ],
        };
      });
      return versionId;
    },
    async saveText(caseId, title, text, type) {
      return value.upload(
        caseId,
        new File([text], `${title.replace(/[\\/:*?"<>|]/g, "_")}.txt`, {
          type: "text/plain",
        }),
        type,
      );
    },
    async deleteMaterial(materialId) {
      if (mode === "account") {
        await remote(() => api(`/materials/${materialId}`, json("DELETE")));
        return;
      }
      await commit((d) => {
        const m = d.materials.find((m) => m.id === materialId);
        return {
          ...d,
          materials: d.materials.filter((m) => m.id !== materialId),
          versions: d.versions.filter((v) => v.materialId !== materialId),
          annotations: d.annotations.filter((a) => !d.versions.some(
            (v) => v.id === a.versionId && v.materialId === materialId,
          )),
          events: m
            ? [event(m.caseId, "删除材料及所有版本", m.title), ...d.events]
            : d.events,
        };
      });
    },
    async addTodo(caseId, title) {
      if (mode === "account") {
        await remote(() =>
          api(`/cases/${caseId}/todos`, json("POST", { title })),
        );
        return;
      }
      await commit((d) => {
        if (!d.cases.some((c) => c.id === caseId))
          throw new Error("求职事项不存在。");
        return {
          ...d,
          todos: [
            {
              id: id(),
              caseId,
              title: title.trim(),
              done: false,
              createdAt: now(),
            },
            ...d.todos,
          ],
          events: [event(caseId, "添加待办事项", title.trim()), ...d.events],
        };
      });
    },
    async toggleTodo(todoId) {
      if (mode === "account") {
        await remote(() =>
          api(
            `/todos/${todoId}`,
            json("PATCH", {
              done: !current.current.todos.find((t) => t.id === todoId)?.done,
            }),
          ),
        );
        return;
      }
      await commit((d) => ({
        ...d,
        todos: d.todos.map((t) =>
          t.id === todoId ? { ...t, done: !t.done } : t,
        ),
      }));
    },
    async saveCommunication(caseId, question, reply) {
      if (mode === "account") {
        await remote(() =>
          api(
            `/cases/${caseId}/communications`,
            json("POST", { question, reply }),
          ),
        );
        return;
      }
      await commit((d) => {
        if (!d.cases.some((c) => c.id === caseId))
          throw new Error("求职事项不存在。");
        return {
          ...d,
          communications: [
            { id: id(), caseId, question, reply, createdAt: now() },
            ...d.communications,
          ],
          events: [
            event(
              caseId,
              "保存 HR 沟通记录",
              reply ? "已记录回复，尚未执行 AI 核验" : "待 HR 回复",
            ),
            ...d.events,
          ],
        };
      });
    },
    async saveProfile(profile) {
      if (mode === "account") {
        await remote(() => api("/profile", json("PUT", profile)));
        return;
      }
      await commit((d) => ({ ...d, profile }));
    },
    async saveAsset(file, type) {
      if (mode === "account") {
        const form = new FormData();
        form.set("file", file);
        form.set("type", type);
        await remote(() => api("/assets", { method: "POST", body: form }));
        return;
      }
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("请选择 5 MB 以内的 PNG、JPG 或 WebP 图片。");
      await commit((d) => ({
        ...d,
        assets: [
          { id: id(), type, filename: file.name, blob: file, createdAt: now() },
          ...d.assets.filter((a) => a.type !== type),
        ],
      }));
    },
    async deleteAsset(assetId) {
      if (mode === "account") {
        await remote(() => api(`/assets/${assetId}`, json("DELETE")));
        return;
      }
      await commit((d) => ({
        ...d,
        assets: d.assets.filter((a) => a.id !== assetId),
      }));
    },
    async clear() {
      if (mode === "account") {
        await remote(() => api("/workspace", json("DELETE")));
        return;
      }
      await commit(() => emptyData());
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("StoreProvider missing");
  return store;
}
