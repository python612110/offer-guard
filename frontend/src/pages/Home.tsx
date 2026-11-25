import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileCheck2,
  Files,
  Fingerprint,
  GitCompareArrows,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  ScanText,
  FolderArchive,
  Menu,
  X,
  MousePointer2,
  FileText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "../components/ui";
import Mascot from "../components/Mascot";
import { useStore } from "../store";

const features = [
  {
    icon: ScanText,
    number: "01",
    title: "看懂条款背后的含义",
    text: "把复杂的签约条款变成清晰的风险解释，让每一项提醒都能回到原文。",
    label: "材料审查",
  },
  {
    icon: GitCompareArrows,
    number: "02",
    title: "让承诺与约定对得上",
    text: "关联招聘信息、Offer 与合同，保留薪资、岗位与地点的不同表述。",
    label: "一致性核验",
  },
  {
    icon: MessageSquareText,
    number: "03",
    title: "把疑问变成下一步行动",
    text: "整理待确认事项，保存 HR 回复，在材料更新后继续核验。",
    label: "沟通与复核",
  },
  {
    icon: FolderArchive,
    number: "04",
    title: "重要材料，始终有迹可循",
    text: "按企业与求职事项管理文件，保留版本、沟通与签约决定。",
    label: "签约档案",
  },
];
export default function Home() {
  const [menu, setMenu] = useState(false);
  const [example, setExample] = useState(0);
  const { user } = useStore();
  const enter = user ? "/app" : "/login";
  useEffect(() => {
    if (window.location.hash === "#salary-example")
      document.getElementById("salary-example")?.scrollIntoView();
  }, []);
  return (
    <div className="home">
      <header className="landing-nav">
        <Logo />
        <nav className={menu ? "landing-links open" : "landing-links"}>
          <a href="#capabilities" onClick={() => setMenu(false)}>
            产品能力
          </a>
          <a href="#workflow" onClick={() => setMenu(false)}>
            使用流程
          </a>
          <a href="#privacy" onClick={() => setMenu(false)}>
            隐私保护
          </a>
        </nav>
        <div className="landing-nav-actions">
          <Link to={enter} className="button primary small">
            {user ? "继续我的求职" : "开始使用"} <ArrowRight size={16} />
          </Link>
          <button
            className="icon-button landing-menu"
            aria-label="切换导航"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="hero-kicker">
                <span>
                  <ShieldCheck size={14} /> YOUR NEXT STEP, PROTECTED
                </span>
              </div>
              <h1>
                签字前，核对承诺
                <br />
                <span className="green-text">有没有写进合同。</span>
              </h1>
              <p className="hero-description">
                并排看 Offer 和合同原文，找出薪资、试用期和工作地点哪些地方还需要问清楚。只有一份合同，也可以先从合同概览开始。
              </p>
              <div className="hero-actions">
                <Link className="button primary hero-button" to="/app/consistency">
                  核对我的 Offer 和合同 <ArrowUpRight size={20} />
                </Link>
                <a href="#salary-example" className="hero-secondary">
                  先看薪资样例 <ChevronRight size={17} />
                </a>
              </div>
              <div className="hero-trust">
                <span>
                  <Check size={15} />
                  原文证据
                </span>
                <span>
                  <Check size={15} />
                  材料关联
                </span>
                <span>
                  <Check size={15} />
                  隐私保护
                </span>
              </div>
            </div>
            <div
              className="hero-visual"
              aria-label="材料审查与关联核验的产品设计示意"
            >
              <div className="visual-orbit orbit-one" />
              <div className="visual-orbit orbit-two" />
              <Mascot className="hero-mascot" />
              <div className="hero-product">
                <div className="product-top">
                  <span className="mini-logo">
                    <ShieldCheck size={16} />
                  </span>
                  <strong>我的签约材料</strong>
                  <span className="product-top-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="product-body">
                  <div className="mini-document">
                    <div className="document-file">
                      <FileText size={16} />
                      <span>劳动合同</span>
                    </div>
                    <h4>一起看清，重要的约定</h4>
                    <div className="document-line long" />
                    <div className="document-line" />
                    <div className="document-line short" />
                    <div className="document-section">劳动报酬与福利待遇</div>
                    <div className="document-highlight">
                      <span>固定薪资、绩效与发放条件</span>
                      <MousePointer2 size={16} />
                    </div>
                    <div className="document-line long" />
                    <div className="document-line short" />
                    <div className="document-section">工作地点与岗位安排</div>
                    <div className="document-line" />
                    <div className="document-line long" />
                    <div className="document-signature">
                      <span>签约前，再确认一步。</span>
                      <ShieldCheck size={23} />
                    </div>
                  </div>
                  <div className="mini-review">
                    <div className="mini-review-title">
                      <span>
                        <Sparkles size={14} />
                      </span>
                      签约关注点
                    </div>
                    <div className="mini-review-tabs">
                      <b>条款证据</b>
                      <span>待确认事项</span>
                    </div>
                    <div className="mini-finding">
                      <span className="mini-finding-label">薪资约定</span>
                      <h5>固定与浮动部分，分别确认</h5>
                      <p>对照 Offer 与合同，保留各材料中的金额和发放条件。</p>
                      <span className="mini-evidence">
                        <FileCheck2 size={13} />
                        查看相关原文 <ChevronRight size={12} />
                      </span>
                    </div>
                    <div className="mini-question">
                      <MessageSquareText size={15} />
                      <p>
                        把不清楚的约定
                        <br />
                        <strong>变成可以问清楚的问题</strong>
                      </p>
                    </div>
                    <div className="mini-review-bottom">
                      <span>下一步，带着问题沟通</span>
                      <ArrowUpRight size={17} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="floating-material">
                <span>
                  <Files size={21} />
                </span>
                <div>
                  <strong>多份材料，一个事项</strong>
                  <small>招聘信息 · Offer · 劳动合同</small>
                </div>
                <Check size={17} />
              </div>
              <div className="floating-proof">
                <span>
                  <ShieldCheck size={20} />
                </span>
                <div>
                  <strong>每个提醒，都能找到依据</strong>
                  <small>从原文出发，谨慎判断</small>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-bottom">
            <span>为大学生、应届毕业生与每一位求职者而设计</span>
            <div className="hero-bottom-line" />
            <span>从收到 Offer，到作出决定</span>
            <ArrowRight size={17} />
          </div>
        </section>
        <section className="landing-section salary-example" id="salary-example">
          <div className="landing-section-heading">
            <div>
              <span className="eyebrow">互动体验 · 合成样例 · 无需登录</span>
              <h2>Offer 写两万，合同只写一万六？</h2>
            </div>
            <p>先看清两份文件的写法，再确认差额是什么、怎么发。</p>
          </div>
          <div className="comparison-topics salary-example-steps" role="group" aria-label="薪资样例步骤">
            {["对照原文", "查看 HR 回复", "复核新版合同"].map((label, index) => (
              <button key={label} type="button" aria-pressed={example === index} onClick={() => setExample(index)}>
                {index + 1}. {label}
              </button>
            ))}
          </div>
          <div className="salary-example-grid">
            <article>
              <h3>Offer · 第 1 页</h3>
              <blockquote>税前月薪 20,000 元。</blockquote>
            </article>
            <article>
              <h3>{example === 2 ? "修订合同 · 第 2 页" : "劳动合同 · 第 2 页"}</h3>
              <blockquote>
                税前基本工资为每月 16,000 元。
                {example === 2 && <mark>另有固定岗位补贴每月 4,000 元，随工资发放。</mark>}
              </blockquote>
            </article>
          </div>
          <div className="salary-example-question" aria-live="polite">
            {example === 0 ? (
              <>
                <strong>先别认定降薪：月薪和基本工资的口径可能不同。</strong>
                <p>可以这样问 HR：「想确认一下，差额 4,000 元属于什么项目？是否固定发放，发放条件会写在哪份正式文件里？」</p>
              </>
            ) : example === 1 ? (
              <>
                <strong>HR 回复：「另有每月 4,000 元固定岗位补贴。」</strong>
                <p>解释已经记下，但签字前还要看新版有没有写清金额和发放条件。</p>
              </>
            ) : (
              <>
                <strong>这项约定已写进修订版，可由你确认。</strong>
                <p>新版补上了每月 4,000 元固定岗位补贴及发放方式。这只确认了这一项薪资约定，不代表整份合同已核验。</p>
              </>
            )}
            <Link className="text-link" to="/app/consistency">
              开始核对自己的材料 <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
        <section className="landing-section capabilities" id="capabilities">
          <div className="landing-section-heading">
            <div>
              <span className="eyebrow">不止读懂一份合同</span>
              <h2>
                让分散的材料，
                <br />
                成为清晰的签约依据。
              </h2>
            </div>
            <p>
              材料、证据、沟通和决定彼此关联。
              <br />
              让你知道哪里需要留意，也知道下一步该做什么。
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, number, title, text, label }) => (
              <article className="feature-card" key={number}>
                <div className="feature-card-top">
                  <span className="feature-icon">
                    <Icon size={25} strokeWidth={1.6} />
                  </span>
                  <span className="feature-number">{number}</span>
                </div>
                <span className="feature-label">{label}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="workflow-section" id="workflow">
          <div className="landing-section-heading centered">
            <span className="eyebrow">从材料到决定</span>
            <h2>每一步，都知道接下来做什么。</h2>
            <p>围绕一家企业、一个岗位，建立完整的求职签约记录。</p>
          </div>
          <div className="workflow-steps">
            {[
              {
                n: "01",
                icon: Files,
                title: "整理材料",
                text: "创建事项，集中保存招聘信息、Offer 与协议。",
              },
              {
                n: "02",
                icon: ScanText,
                title: "审查与核验",
                text: "查看原文证据，比较不同材料的约定。",
              },
              {
                n: "03",
                icon: MessageSquareText,
                title: "沟通与复核",
                text: "确认疑问，保存回复，再看修改后的材料。",
              },
              {
                n: "04",
                icon: FileCheck2,
                title: "决定与归档",
                text: "整理剩余问题，保存决定和最终签约材料。",
              },
            ].map(({ n, icon: Icon, title, text }) => (
              <div className="workflow-step" key={n}>
                <div className="step-number">{n}</div>
                <Icon size={26} strokeWidth={1.6} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="privacy-section landing-section" id="privacy">
          <div className="privacy-art">
            <div className="privacy-circle">
              <Fingerprint size={100} strokeWidth={1} />
              <span className="privacy-shield">
                <ShieldCheck size={30} />
              </span>
            </div>
            <span className="privacy-art-caption">PRIVATE BY DESIGN</span>
          </div>
          <div className="privacy-copy">
            <span className="eyebrow">隐私，是流程的一部分</span>
            <h2>
              你的求职材料，
              <br />
              由你掌握。
            </h2>
            <p>
              可登录账号保存材料和历史版本，也可选择本设备工作区。使用 AI 审查时，先预览脱敏文本，确认授权后才会发送给第三方 AI 服务。
            </p>
            <div className="privacy-points">
              <span>
                <Check size={17} />
                照片与签名独立管理
              </span>
              <span>
                <Check size={17} />
                材料可以删除
              </span>
              <span>
                <Check size={17} />
                处理范围清晰可见
              </span>
            </div>
            <Link className="text-link" to="/app/settings?tab=privacy">
              查看隐私与数据管理 <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
        <section className="landing-cta">
          <div>
            <span>从第一份材料开始</span>
            <h2>把下一步，交给更有准备的自己。</h2>
            <p>现在可以创建事项、保存材料和版本、查看原文与记录沟通。</p>
          </div>
          <Link to={enter} className="button cta-button">
            进入求职工作台 <ArrowUpRight size={20} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>让每一步签约，更有把握。</p>
        <span>© {new Date().getFullYear()} OfferGuard</span>
      </footer>
    </div>
  );
}
