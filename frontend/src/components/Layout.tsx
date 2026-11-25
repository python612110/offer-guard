import { useState } from "react";
import { NavLink, Outlet, Link, Navigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ScanText,
  GitCompareArrows,
  Compass,
  FolderArchive,
  UserRound,
  ChevronDown,
  ArrowUpRight,
  Plus,
  PanelLeftClose,
  ShieldCheck,
  BookOpen,
  Menu,
  X,
} from "lucide-react";
import { Logo, Loading } from "./ui";
import { NewCaseModal } from "./forms";
import { useStore } from "../store";

const navigation = [
  { path: "/app", label: "求职工作台", icon: LayoutDashboard, end: true },
  { path: "/app/reviews", label: "材料审查", icon: ScanText },
  { path: "/app/consistency", label: "一致性核验", icon: GitCompareArrows },
  { path: "/app/decision", label: "决策助手", icon: Compass },
  { path: "/app/archives", label: "签约档案", icon: FolderArchive },
];
export function Layout() {
  const { data, loading, notice, mode, user, entered, signOut, notify } = useStore();
  const location = useLocation();
  const [newCase, setNewCase] = useState(false);
  const [mobile, setMobile] = useState(false);
  if (!loading && (!entered || (mode === "account" && !user)))
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  const label =
    navigation.find((n) =>
      n.end
        ? location.pathname === n.path
        : location.pathname.startsWith(n.path),
    )?.label ||
    (location.pathname.includes("/settings") ? "个人中心" : "求职事项");
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="mobile-close icon-button"
            aria-label="关闭导航"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">我</span>
          <div>
            <strong>我的求职空间</strong>
            <small>个人工作区</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-section-label">工作空间</div>
        <nav className="sidebar-nav">
          {navigation.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={() => setMobile(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path === "/app/decision" && data.todos.some((t) => !t.done) && (
                <b>{data.todos.filter((t) => !t.done).length}</b>
              )}
            </NavLink>
          ))}
        </nav>
        <button className="sidebar-new" onClick={() => setNewCase(true)}>
          <Plus size={17} />
          新建求职事项
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-shield">
              <ShieldCheck size={18} />
            </span>
            <strong>每个决定，都有据可依</strong>
            <p>从一份 Offer，到安心签约。</p>
            <Link to="/">
              了解 OfferGuard <ArrowUpRight size={14} />
            </Link>
          </div>
          <NavLink
            className="profile-nav"
            to="/app/settings"
            onClick={() => setMobile(false)}
          >
            <span className="profile-avatar">
              <UserRound size={20} />
            </span>
            <div>
              <strong>{data.profile.name || "个人中心"}</strong>
              <small>资料与隐私管理</small>
            </div>
            <ChevronDown size={15} />
          </NavLink>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-backdrop" onClick={() => setMobile(false)} />
      )}
      <div className="app-main">
        <header className="app-header">
          <div className="header-breadcrumb">
            <button
              className="icon-button menu-toggle"
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <PanelLeftClose className="desktop-panel-icon" size={17} />
            <span>工作空间</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{label}</strong>
          </div>
          <div className="header-right">
            <span
              className="local-status"
              title={
                mode === "account"
                  ? "材料保存在服务器私有目录，按账号隔离"
                  : "材料保存在当前浏览器"
              }
            >
              <i />
              {mode === "account" ? "账号工作区" : "本设备工作区"}
            </span>
            {user ? (
              <button
                className="text-link"
                onClick={() => signOut().catch((e) => notify(e.message))}
              >
                退出登录
              </button>
            ) : (
              <Link className="text-link" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>
                登录 / 注册
              </Link>
            )}
            <Link
              to="/app/settings"
              className="header-avatar"
              aria-label="个人中心"
            >
              {data.profile.name?.slice(0, 1) || <UserRound size={16} />}
            </Link>
          </div>
        </header>
        {loading ? <Loading /> : <Outlet />}
        <footer className="app-footer">
          <span>OfferGuard · 求职签约，有据可依</span>
          <span>风险提示为决策参考，最终决定由你作出</span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <ShieldCheck size={18} />
          {notice}
        </div>
      )}
      {newCase && <NewCaseModal onClose={() => setNewCase(false)} />}
    </div>
  );
}
