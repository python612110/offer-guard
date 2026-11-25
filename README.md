# OfferGuard

面向求职者的签约材料核对与风险审查工具，将 Offer、劳动合同、HR 沟通、材料版本和签约决定组织在同一求职事项中。

在线体验：<https://pactmind.cn>  
无需登录的薪资互动样例：<https://pactmind.cn/#salary-example>

## 功能

- 注册登录与独立账号工作区，也可使用本设备工作区。
- 上传 PDF、DOCX、TXT、Markdown 与图片，保存原件和历史版本。
- 查看合同概览、原文证据，记录批注与待确认问题。
- 用户预览脱敏文本并授权后，按需调用 AI 进行单材料审查与报告追问。
- 人工核对多份材料，保存薪资问题、HR 回复和新版合同复核记录。
- 保存签约决定，整理档案并导出记录。

多材料核对与新版合同复核由用户确认；扫描件和图片暂不支持 OCR。AI 结果需要对照原文和适用规则复核。

## 技术与目录

| 目录 | 内容 |
| --- | --- |
| `frontend/` | React、TypeScript、Vite 前端与浏览器验收 |
| `backend/` | FastAPI、MySQL、SQLAlchemy、Alembic 与接口测试 |
| `skills/` | 审查规范、12 类风险主题和接口契约 |
| `knowledge/` | 知识规则正文与维护数据 |
| `deployment/` | Docker Compose、Caddy HTTPS 与部署说明 |

## 本机运行

准备 Node.js 22、Python 3.12 或更新版本，以及 MySQL 8。

后端安装依赖，在 `backend/.env` 配置数据库与可选 AI 密钥，执行迁移后启动：

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

数据库配置、迁移和启动步骤见 [后端说明](backend/README.md)。

在 `frontend/` 目录执行：

```bash
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173>。前端将 `/api` 请求转发至本机 8000 端口。

## 正式部署与验证

按 [部署说明](deployment/README.md) 配置域名和服务器环境。Docker Compose 启动独立数据库、迁移、API 和 Caddy；数据库、原件与证书使用持久卷。

前端生产构建：在 `frontend/` 执行 `npm run build`。浏览器验收：前后端启动后执行 `npm run test:ui`；真实账号联调步骤见后端说明。数据库测试会创建独立测试实例，其本机 MySQL 路径要求见后端说明。

仓库不包含实际环境密钥、用户合同、数据库、SSH 部署密钥和本机依赖目录。新部署需自行配置 `.env`；示例配置为 `.env.example`。
