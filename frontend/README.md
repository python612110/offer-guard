# OfferGuard Web

官网、登录注册、工作台、求职事项、材料与版本、文档阅读、待办与 HR 沟通、档案和个人素材管理。

## 运行

建议 Node.js 22.16 或更新的受支持版本。

```sh
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173 。`npm run build` 执行 TypeScript 检查与生产构建。

## 当前功能边界

- 本设备模式使用 IndexedDB 保存数据；账号模式通过 FastAPI 将记录保存至 MySQL，并将原文件保存至服务器私有目录。两种模式的数据相互独立，旧材料不会自动上传。
- 支持 PDF、DOCX、TXT、Markdown、图片保存。账号模式在后端解析，本设备模式在浏览器解析；图片和扫描件尚无 OCR。
- 原始文件与历史版本均保留；正文阅读不保证 DOCX 原版式还原。
- 选中解析文字后可记录待确认问题；PDF 原件通过本地 canvas 预览。
- 已接入登录、注册、退出、业务 API 和按需鉴权下载。运行账号模式前请按照 `../backend/README.md` 配置本机 MySQL。
- 已接入用户预览脱敏文本并授权后的单材料 AI 风险报告及报告追问；需要后端配置 AI 密钥。OCR 与自动跨材料语义核验尚未接入。
- 本设备模式的材料可被同一浏览器的其他使用者访问；清理站点数据会影响保存。账号模式应在共享设备上退出登录。
- 个人素材不参与材料解析。材料、事项与全部本设备数据支持删除。

## 结构

- `src/pages`：官网与业务页面。
- `src/components`：导航、弹窗、上传和公共 UI。
- `src/types.ts`：业务实体类型。
- `src/store.tsx`：事项、版本和记录操作；提交失败不更新页面。
- `src/lib/storage.ts`：保留的本设备仓储。
- `src/lib/api.ts`：账号会话、CSRF、业务 API 与文件下载。
- `src/lib/parser.ts`：文件校验与本地正文解析。

启动前端后运行 `npm run test:ui` 可检查登录错误提示、本设备数据保留、注册校验和移动布局。默认使用本机 Chrome，可通过 `OFFERGUARD_CHROME_PATH` 指定路径。该测试中的 API 响应明确模拟；实际 MySQL 接口测试位于 `backend/tests`。

配置 MySQL 并启动前后端后，可在 `backend` 目录运行 `.venv/bin/python check_live.py`，通过 `e2e/live-mysql.mjs` 验证真实注册、材料版本、重新登录后的数据恢复、双用户隔离与删除流程。测试账号和文件会自动清理。

根目录 `skills/`、`knowledge/` 保存审查规范和知识规则，后端直接读取。用户在每次 AI 请求前检查脱敏输入并授权。隔离解析任务与 OCR 为后续工作；正式部署与实际验收结果见 `../deployment/README.md`。
