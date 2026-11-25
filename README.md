<div align="center">
  <img src="frontend/public/favicon.svg" alt="OfferGuard Logo" width="88">
  <h1>OfferGuard</h1>
  <p><strong>让每一次签约决定，都有据可查。</strong></p>
  <p>面向求职者的就业签约材料管理与风险审查工作台</p>
  <p>
    <a href="https://pactmind.cn">在线体验</a>
    ·
    <a href="https://pactmind.cn/#salary-example">薪资互动样例</a>
    ·
    <a href="#快速开始">快速开始</a>
  </p>
</div>

---

## 项目简介

OfferGuard 将 Offer、劳动合同、HR 沟通、材料版本和签约决定整理到同一个求职事项中，帮助求职者更系统地阅读材料、定位风险、记录疑问并保留决策依据。

项目支持账号工作区与本设备工作区。账号模式提供跨设备的数据管理能力；本设备模式无需注册，适合快速体验基础的材料整理与人工核对流程。

> **AI 只提供审查线索，不替代人工判断。** 所有风险发现都应结合合同原文、实际情况和适用规则进一步核验。

## 核心功能

| 模块 | 功能说明 |
| --- | --- |
| **求职事项管理** | 集中管理 Offer、合同、沟通记录、待办事项与签约决定 |
| **材料与版本留痕** | 支持 PDF、DOCX、TXT、Markdown 和图片，保留原件与历史版本 |
| **AI 风险审查** | 基于 12 类风险主题和规则知识库生成单材料审查报告，并支持报告追问 |
| **原文证据定位** | 将风险线索与合同原文、规则依据关联，便于逐项复核 |
| **人工核对与沟通** | 记录薪资疑问、HR 回复、新版合同复核结果及确认理由 |
| **档案整理与导出** | 保存签约决定，导出审查报告、档案目录与沟通记录 |

### 使用流程

**创建求职事项 → 上传签约材料 → 审查与原文核对 → 记录 HR 沟通 → 复核新版合同 → 保存决定并归档**

### 隐私与授权

- AI 审查不会随上传或登录自动触发。
- 每次调用前展示待发送的脱敏文本，由用户确认并明确授权。
- 本设备模式的数据保存在当前浏览器中，不会自动上传至账号工作区。
- 原文件保存在服务器私有目录或当前浏览器中，下载接口需要账号鉴权。

## 技术栈

| 层级 | 技术方案 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、React Router |
| 后端 | FastAPI、SQLAlchemy、Alembic |
| 数据存储 | MySQL 8、私有文件存储、IndexedDB |
| AI 与规则 | DeepSeek API、12 类风险审查 Skill、结构化知识库 |
| 部署与验证 | Docker Compose、Caddy、Pytest、Playwright |

## 项目结构

```text
offer-guard/
├── frontend/       # Web 界面、文档解析与浏览器验收
├── backend/        # API、数据模型、迁移与接口测试
├── skills/         # 审查规范、风险主题与接口契约
├── knowledge/      # 知识规则正文与维护数据
└── deployment/     # Docker Compose、Caddy 与部署配置
```

## 快速开始

### 环境要求

- Node.js 22.16 或更新的受支持版本
- Python 3.12 或更新版本
- MySQL 8

### 1. 启动后端

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

编辑 `backend/.env`，填写数据库配置；如需使用 AI 审查，再配置 `DEEPSEEK_API_KEY`。随后执行迁移并启动服务：

```bash
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- 后端服务：<http://127.0.0.1:8000>
- 接口文档：<http://127.0.0.1:8000/docs>

数据库初始化与更完整的配置方式，请参阅[后端说明](backend/README.md)。

### 2. 启动前端

打开另一个终端：

```bash
cd frontend
npm ci
npm run dev
```

访问 <http://127.0.0.1:5173>。开发服务器会将 `/api` 请求转发至本机 8000 端口。

## 构建与测试

```bash
# 前端类型检查与生产构建
cd frontend
npm run build

# 浏览器验收（需先启动前后端）
npm run test:ui

# 后端接口测试
cd ../backend
.venv/bin/python -m pytest tests -q
```

后端测试使用独立的临时 MySQL 实例，具体环境要求与真实账号联调方式见[后端说明](backend/README.md)。

## 部署

项目提供基于 Docker Compose 的部署配置，包含独立 MySQL、数据库迁移、FastAPI、前端静态服务和 Caddy 自动 HTTPS。

部署前请阅读[部署说明](deployment/README.md)，并妥善配置域名、数据库密码、AI 密钥与持久化备份。不要将 `.env`、真实合同、数据库文件或部署密钥提交到公开仓库。

## 功能边界

- 扫描件和图片暂不支持 OCR。
- 多材料核对与新版合同复核目前由用户人工确认，不进行自动语义比对。
- 知识规则与 AI 输出不构成法律意见，也不直接给出“安全”或“违法”的结论。
- 公开展示或提交 Issue 时，请勿附带真实合同、身份证件、联系方式等个人信息。

## 文档导航

- [前端说明](frontend/README.md)
- [后端说明](backend/README.md)
- [部署说明](deployment/README.md)
- [统一规范与接口契约](skills/00_统一规范与接口契约.md)
- [知识库说明与规则正文](knowledge/01_知识库说明与规则正文_OfferGuard.md)
