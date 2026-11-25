import { useRef, useState, type FormEvent } from "react";
import { FilePlus2, Upload, Check, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MATERIAL_TYPES, STAGES, type MaterialType } from "../types";
import { useStore } from "../store";
import { Modal } from "./ui";
import SelectField from "./SelectField";

export function NewCaseModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<(typeof STAGES)[number]>(STAGES[0]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const company = String(form.get("company")).trim(),
        role = String(form.get("role")).trim();
      if (!company || !role) throw new Error("请填写企业名称和应聘岗位。");
      const caseId = await store.createCase({
        company,
        role,
        city: String(form.get("city")).trim(),
        deadline: String(form.get("deadline")),
        stage,
      });
      onClose();
      navigate(`/app/cases/${caseId}`);
      store.notify("求职事项已创建");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="创建求职事项"
      subtitle="把这家企业的材料、沟通和决定，放在一起。"
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <label>
          企业名称 <span>*</span>
          <input
            name="company"
            required
            maxLength={100}
            placeholder="填写招聘或 Offer 中的企业名称"
            autoFocus
          />
        </label>
        <label>
          应聘岗位 <span>*</span>
          <input
            name="role"
            required
            maxLength={100}
            placeholder="例如：前端开发工程师"
          />
        </label>
        <div className="form-row">
          <label>
            工作城市
            <input name="city" maxLength={50} placeholder="例如：杭州" />
          </label>
          <label>
            签约截止日期
            <input type="date" name="deadline" />
          </label>
        </div>
        <SelectField
          showLabel
          label="当前阶段"
          value={stage}
          options={STAGES}
          onChange={setStage}
        />
        <div className="privacy-inline">
          <Check size={16} />
          {store.mode === "account"
            ? "事项与材料保存到账号工作区，不会自动发送给 AI。"
            : "事项与材料仅保存在当前浏览器，不会自动发送给 AI。"}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <FilePlus2 size={17} />
            )}
            创建事项
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function UploadModal({
  caseId,
  onClose,
  materialId,
  materialType,
}: {
  caseId: string;
  onClose: () => void;
  materialId?: string;
  materialType?: MaterialType;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<MaterialType>(materialType || "劳动合同");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      let versionId: string;
      if (mode === "file") {
        if (!file) throw new Error("请先选择需要保存的文件。");
        versionId = await store.upload(caseId, file, type, materialId);
      } else {
        const title = String(form.get("title")).trim(),
          text = String(form.get("text")).trim();
        if (!title || !text) throw new Error("请填写标题和材料内容。");
        versionId = await store.saveText(caseId, title, text, type);
      }
      onClose();
      const overview = ["劳动合同", "三方协议", "其他材料"].includes(type);
      navigate(`/app/reviews/${versionId}${overview ? "?tab=overview" : ""}`);
      store.notify(
        materialId
          ? "新版本已保存，历史版本仍可查看"
          : overview
            ? "材料已保存，可先查看合同概览"
            : "材料已保存，接下来检查原文并开始审查",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={materialId ? "上传修改后的材料" : "添加求职材料"}
      subtitle={
        materialId
          ? "创建一个新版本，保留之前的原文件。"
          : "上传文件，或保存招聘信息与 HR 沟通文本。"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        {!materialId && (
          <div className="segmented">
            <button
              type="button"
              className={mode === "file" ? "active" : ""}
              onClick={() => setMode("file")}
            >
              上传文件
            </button>
            <button
              type="button"
              className={mode === "text" ? "active" : ""}
              onClick={() => setMode("text")}
            >
              粘贴文本
            </button>
          </div>
        )}
        <SelectField
          showLabel
          label="材料分类"
          value={type}
          onChange={setType}
          options={MATERIAL_TYPES}
          disabled={!!materialId}
        />
        {mode === "file" ? (
          <>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              className={`upload-zone ${file ? "has-file" : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setFile(e.dataTransfer.files[0] || null);
              }}
            >
              <span>
                <Upload size={25} />
              </span>
              <strong>{file ? file.name : "点击选择，或将文件拖到这里"}</strong>
              <small>PDF、Word（.docx）、TXT、Markdown、图片 · 最大 20 MB</small>
            </button>
          </>
        ) : (
          <>
            <label>
              材料标题
              <input
                name="title"
                required
                maxLength={120}
                placeholder="例如：岗位招聘信息"
              />
            </label>
            <label>
              材料内容
              <textarea
                name="text"
                required
                rows={7}
                maxLength={200000}
                placeholder="粘贴完整原文，保留薪资、日期与适用条件。"
              />
            </label>
          </>
        )}
        <div className="privacy-inline">
          <Check size={16} />
          {store.mode === "account" ? "保存到账号工作区。" : "仅保存到本设备。"}
          保存后进入审查页，AI 传输需单独授权。
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Upload size={17} />
            )}
            {busy ? "正在解析与保存" : materialId ? "保存新版本" : "保存材料"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
