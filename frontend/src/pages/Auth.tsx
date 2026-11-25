import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import { Logo } from "../components/ui";
import { useStore } from "../store";
import "./Auth.css";
import Mascot from "../components/Mascot";

export default function Auth() {
  const store = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const register = params.get("mode") === "register";
  const requested = params.get("next") || "/app";
  const next = /^\/app(?:\/|$|\?)/.test(requested) && !requested.includes("\\") ? requested : "/app";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!store.loading && store.user) return <Navigate to={next} replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (register && password !== data.get("confirm")) {
      setError("两次密码不一致。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await store.signIn(String(data.get("email")), password, register);
      navigate(next, { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h1>
            每一份 Offer，
            <br />
            都值得认真对待。
          </h1>
          <p>
            让材料、沟通与签约记录，
            <br />
            有序地保存在你的求职空间。
          </p>
          <Mascot className="auth-mascot" />
        </div>
        <span>
          <ShieldCheck size={18} />
          个人账号 · 材料私有 · 版本可追溯
        </span>
      </div>
      <main className="auth-main">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} />
          返回官网
        </Link>
        <div className="auth-card">
          <h2>{register ? "创建你的求职账号" : "欢迎回来"}</h2>
          <p>
            {register
              ? "从一份材料，开始安心签约。"
              : "登录后，继续管理你的求职事项。"}
          </p>
          <form className="form" onSubmit={submit}>
            <label>
              邮箱
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="输入你的邮箱"
              />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="至少 10 个字符"
              />
            </label>
            {register && (
              <label>
                确认密码
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                />
              </label>
            )}
            <div className="privacy-inline">
              <ShieldCheck size={16} />
              材料保存到账号工作区，AI 审查需在材料页单独授权。
            </div>
            {(error || store.notice) && (
              <p className="form-error" role="alert">
                {error || store.notice}
              </p>
            )}
            <button className="button primary" disabled={busy || store.loading}>
              {busy && <LoaderCircle size={17} className="spin" />}
              {register ? "注册并进入工作台" : "登录"}
            </button>
          </form>
          <p className="auth-toggle">
            {register ? "已有账号？" : "还没有账号？"}
            <button
              disabled={busy}
              onClick={() => {
                setError("");
                setParams(register ? { next } : { mode: "register", next });
              }}
            >
              {register ? "去登录" : "创建账号"}
            </button>
          </p>
          <button
            className="button secondary auth-local"
            disabled={busy || store.loading}
            onClick={async () => {
              setBusy(true);
              try {
                await store.useLocal();
                navigate(/^\/app\/(?:cases|reviews)\/[^/?]+/.test(next) ? "/app" : next);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "无法读取本设备数据。",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            继续使用本设备工作区
          </button>
          <small className="auth-note">
            本设备材料与账号材料分别保存，不会自动迁移。
          </small>
        </div>
      </main>
    </div>
  );
}
