import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ImagePlus,
  LockKeyhole,
  PenLine,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { Empty, Modal, PageTitle, SectionTitle } from "../components/ui";
import type { PersonalAsset } from "../types";

function AssetCard({ type }: { type: PersonalAsset["type"] }) {
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const asset = store.data.assets.find((a) => a.type === type);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!asset) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(asset.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [asset]);
  return (
    <section className="panel asset-card">
      <SectionTitle
        title={type === "photo" ? "个人照片" : "个人签名素材"}
        caption="独立保存，不进入材料审查流程"
      />
      {asset ? (
        <div className="asset-preview">
          <img
            src={url}
            alt={type === "photo" ? "个人照片素材" : "个人签名素材"}
          />
          <span>{asset.filename}</span>
        </div>
      ) : (
        <Empty
          icon={
            type === "photo" ? <ImagePlus size={28} /> : <PenLine size={28} />
          }
          title={type === "photo" ? "保存一张个人照片" : "保存签名图片素材"}
          description="支持 PNG、JPG、WebP，最大 5 MB。"
        />
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            await store.saveAsset(file, type);
            store.notify("个人素材已保存");
          } catch (error) {
            store.notify(error instanceof Error ? error.message : "保存失败");
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      <div className="asset-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {asset ? "替换素材" : "上传素材"}
        </button>
        {asset && (
          <button
            className="danger-text"
            onClick={() =>
              store.deleteAsset(asset.id).catch(() => store.notify("删除失败"))
            }
          >
            <Trash2 size={15} />
            删除
          </button>
        )}
      </div>
    </section>
  );
}
export default function Settings() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const scope = store.mode === "account" ? "账号工作区" : "本设备";
  const tab =
    params.get("tab") === "privacy"
      ? "隐私与数据"
      : params.get("tab") === "assets"
        ? "照片与签名"
        : "个人资料";
  const setTab = (value: string) =>
    setParams(
      value === "隐私与数据"
        ? { tab: "privacy" }
        : value === "照片与签名"
          ? { tab: "assets" }
          : {},
    );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await store.saveProfile({
        name: String(data.get("name")).trim(),
        school: String(data.get("school")).trim(),
        role: String(data.get("role")).trim(),
      });
      store.notify("个人资料已保存");
    } catch {
      store.notify("保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <PageTitle
        eyebrow="YOUR SPACE, YOUR CONTROL"
        title="个人中心"
        description={`管理个人资料、素材与${scope}数据。`}
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {["个人资料", "照片与签名", "隐私与数据"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "个人资料" ? (
                <UserRound size={18} />
              ) : t === "照片与签名" ? (
                <ImagePlus size={18} />
              ) : (
                <LockKeyhole size={18} />
              )}
              {t}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "个人资料" && (
            <section className="panel">
              <SectionTitle
                title="个人资料"
                caption="资料用于个性化显示，不会自动加入 AI 审查输入。"
              />
              <form className="form panel-form profile-form" onSubmit={save}>
                <div className="profile-form-avatar">
                  <UserRound size={35} />
                </div>
                <label>
                  称呼
                  <input
                    name="name"
                    maxLength={40}
                    defaultValue={store.data.profile.name}
                    placeholder="希望我们如何称呼你"
                  />
                </label>
                <label>
                  学校
                  <input
                    name="school"
                    maxLength={100}
                    defaultValue={store.data.profile.school}
                    placeholder="填写学校名称（选填）"
                  />
                </label>
                <label>
                  目标岗位
                  <input
                    name="role"
                    maxLength={100}
                    defaultValue={store.data.profile.role}
                    placeholder="填写求职方向（选填）"
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  保存资料
                </button>
              </form>
            </section>
          )}
          {tab === "照片与签名" && (
            <>
              <div className="privacy-inline">
                <ShieldCheck size={18} />
                个人素材与合同材料分开保存，不提供自动签署或电子签章。
              </div>
              <div className="asset-grid">
                <AssetCard type="photo" />
                <AssetCard type="signature" />
              </div>
            </>
          )}
          {tab === "隐私与数据" && (
            <>
              <section className="panel">
                <SectionTitle title="当前数据处理范围" />
                <div className="privacy-setting-list">
                  {[
                    {
                      title:
                        store.mode === "account"
                          ? "材料保存到账号工作区"
                          : "材料保存到当前浏览器",
                      text:
                        store.mode === "account"
                          ? "业务记录保存在 MySQL，原文件保存在服务器私有目录。重新登录可恢复账号材料。本设备旧材料不自动上传。"
                          : "更换浏览器、清理站点数据或使用无痕模式可能导致本设备数据丢失。请自行备份重要原文件。",
                    },
                    {
                      title: "每份材料单独授权 AI 审查",
                      text: "账号模式使用智能模型执行规则。发送前展示实际脱敏文字，由你检查并授权；上传材料不会自动触发 AI。",
                    },
                    {
                      title: "照片与签名独立管理",
                      text: "个人素材保存在独立存储区域，材料解析不会读取这些素材。",
                    },
                    {
                      title: "共享设备请注意访问",
                      text:
                        store.mode === "account"
                          ? "账号材料仅在登录后可访问，离开共享设备请退出登录。"
                          : "使用同一浏览器的人可能访问本设备工作区，请注意保管。",
                    },
                  ].map((p) => (
                    <div key={p.title}>
                      <ShieldCheck size={20} />
                      <div>
                        <h3>{p.title}</h3>
                        <p>{p.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel delete-data-panel">
                <SectionTitle
                  title={`删除${scope}数据`}
                  caption="清除事项、原文件、历史版本、沟通、待办、个人资料与个人素材。"
                />
                <button
                  className="button danger-outline"
                  onClick={() => setConfirm(true)}
                >
                  <Trash2 size={16} />
                  删除所有{scope}数据
                </button>
              </section>
            </>
          )}
        </div>
      </div>
      {confirm && (
        <Modal
          title={`清除所有${scope}数据？`}
          subtitle="此操作无法撤销，所有事项、文件版本、记录及个人素材都会被删除。请先备份重要原文件。"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await store.clear();
                  setConfirm(false);
                  store.notify(`所有${scope}数据已删除`);
                } catch {
                  store.notify("删除失败，请重试。");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在清除" : "确认清除"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
