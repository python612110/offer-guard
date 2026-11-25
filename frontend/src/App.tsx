import { Component, type ReactNode, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  Link,
} from "react-router-dom";
import { StoreProvider } from "./store";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Workspace from "./pages/Workspace";
import CaseDetail from "./pages/CaseDetail";
import Review from "./pages/Review";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import { Archives, Reviews } from "./pages/Collections";
import { Consistency, Decision } from "./pages/Workflow";

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="fatal-error">
          <h1>页面暂时无法打开</h1>
          <p>请刷新重试。已保存的数据不会因这次页面错误被删除。</p>
          <button className="button primary" onClick={() => location.reload()}>
            刷新页面
          </button>
        </div>
      );
    return this.props.children;
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollReset />
        <StoreProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/app" element={<Layout />}>
              <Route index element={<Workspace />} />
              <Route path="cases/:caseId" element={<CaseDetail />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="reviews/:versionId" element={<Review />} />
              <Route path="consistency" element={<Consistency />} />
              <Route path="decision" element={<Decision />} />
              <Route path="archives" element={<Archives />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route
              path="*"
              element={
                <div className="fatal-error">
                  <h1>这个页面不存在</h1>
                  <Link className="button primary" to="/">
                    返回首页
                  </Link>
                </div>
              }
            />
          </Routes>
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
