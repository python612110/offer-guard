# OfferGuard 后端

FastAPI + MySQL 8 + SQLAlchemy + Alembic。无需 PostgreSQL、Redis 或 Docker。

已实现账号注册、登录、退出、Cookie 会话、CSRF 校验、登录限流；求职事项、材料历史版本、待办、HR 沟通、人工核对、决定快照、个人资料、照片签名与删除。业务数据进入 MySQL，原文件进入 `backend/private/`，下载需要账号鉴权。材料正文在后端解析；PDF / DOCX / UTF-8 TXT / Markdown / PNG / JPEG / WebP 可上传，扫描件和图片尚无 OCR 正文。DeepSeek 单材料审查已接入 12 类 Skill、63 条规则与 25 条接受边界，并支持报告追问。多材料核对由用户查看原文后记录状态与理由，尚无自动语义比较或电子签署。

## 本机启动

在终端进入 `backend` 目录：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python configure_mysql.py
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

配置脚本会在终端隐藏输入 MySQL 管理密码，创建 `offerguard` 库、随机专用本机用户、权限为 600 的 `.env`，并执行迁移；不会覆盖已有 `.env`，不会修改其他数据库。不要把数据库密码发到聊天或提交 Git。

也可自行将 `.env.example` 复制为 `.env`，填写已有数据库账号后运行：

```bash
.venv/bin/alembic upgrade head
```

专用开发账号需要该库的 DDL 权限运行迁移。正式部署应将迁移账号与只具备 SELECT / INSERT / UPDATE / DELETE 的运行账号分开。

前端在 `frontend` 目录运行 `npm run dev`；Vite 将 `/api` 转发到 8000 端口。已有前端进程会因配置修改自动重启。

- 页面：http://127.0.0.1:5173/login
- API 文档：http://127.0.0.1:8000/docs
- 健康检查：http://127.0.0.1:8000/api/health（数据库或迁移未就绪时返回 503）

本设备模式继续使用原 IndexedDB。账号模式独立保存；旧材料不会自动上传，也不会因退出账号或清除账号工作区被删除。清空工作区保留登录账号。密码目前仅支持注册时设置，找回密码、邮箱验证和账号注销需在上线前补充。

## 接口

| 路径 | 用途 |
|---|---|
| `/api/auth/register`, `/login`, `/me`, `/logout`（后三者同属 `/api/auth`） | 会话 |
| `/api/workspace` | 当前账号元数据 / 清空工作区 |
| `/api/cases`，`/api/cases/{id}` | 创建、更新阶段、删除事项 |
| `/api/cases/{id}/materials` | multipart 文件上传，`type`、可选 `material_id` |
| `/api/materials/{id}` | 删除材料及全部版本 |
| `/api/versions/{id}/file` | 鉴权下载原文件 |
| `/api/cases/{id}/todos`，`/api/todos/{id}` | 待办创建 / 完成状态 |
| `/api/cases/{id}/communications` | HR 记录 |
| `/api/cases/{id}/records` | 人工核对与决定快照，校验关联版本归属 |
| `/api/knowledge` | 12 类 Skill 的原文、规则与版本摘要 |
| `/api/reviews/{id}/question-preview`，`/api/reviews/{id}/questions` | 报告追问预览、授权调用与历史 |
| `/api/profile` | 更新资料 |
| `/api/assets`，`/api/assets/{id}`，`/api/assets/{id}/file` | 独立素材管理 |

写请求携带 `Origin` 和 `/api/auth/me` 返回的 `X-CSRF-Token`；会话为 HttpOnly Cookie。所有资源访问校验所有权，不以资源 UUID 代替权限。同一账号的写事务通过 MySQL 行锁串行处理，版本号还有唯一约束。

删除业务记录时在同一事务中写入文件删除队列，提交后清理文件；清理失败不恢复文件访问权限。启动和 `.venv/bin/python maintenance.py` 会重试该队列。数据库与私有目录需一起备份。进程在保存文件与数据库提交之间被强制终止可能留下无引用文件，当前没有自动扫描删除无引用文件的流程。

## 验证与边界

```bash
.venv/bin/python -m pytest tests -q
```

测试使用安装的 `/usr/local/mysql/bin/mysqld` 创建短生命周期独立实例，只开 Unix socket，不连接、不读取、不修改你原来的 MySQL 数据库；测试后关闭并移除自己创建的临时目录。覆盖实际 MySQL 迁移、双用户隔离、CSRF、历史版本、并发版本、文件下载和级联删除。

本次验证：pytest 显示 7 项通过；TRAE 沙箱随后拦截临时 mysqld 对安装目录 `/usr/local/mysql/bin/mysqld.my` 的访问，Shell 包装层因此返回非零状态，未扩大权限。前端生产构建与 4 项浏览器测试通过，其中账号状态流采用明确模拟的 API 契约。

后续已连接用户现有 MySQL，创建专用项目账号、权限为 600 的 `.env`，完成 `0001` 迁移并重启后端。健康检查返回 `ready`；实际浏览器注册、上传、历史版本、待办、HR 记录、退出重登、刷新恢复、双用户越权拒绝和级联删除全部通过。本次随机测试账号及其原文件已清理，未保存管理账号密码。

配置好数据库并启动前后端后，可重跑实际联调：

```bash
.venv/bin/python check_live.py
```

需要本机 Node 与 Chrome；可用 `OFFERGUARD_NODE_PATH`、`OFFERGUARD_CHROME_PATH` 指定路径。此检查只创建并清理本次随机生成的两个测试账号，不清空其他账号。

当前适用于本机开发：登录限流为单进程内存实现；PDF 解析在线程池中运行但尚未放入带强制超时和内存限制的任务进程。正式上线需 HTTPS（`COOKIE_SECURE=true`）、精确来源配置、网关请求体限制、持久限流、备份和隔离解析任务。

## DeepSeek 单材料审查与报告追问

在后端 `.env` 配置 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL=deepseek-flash`，执行 `.venv/bin/alembic upgrade head` 后重启后端。本机已完成配置与 `0004` 迁移，密钥只保存在权限为 600 的后端文件，不进入浏览器或报告。

账号模式打开材料版本 → 预览并开始 AI 审查 → 检查全部脱敏文字、主题覆盖和指令 → 勾选授权。上传、登录或打开页面不会自动调用模型。实际输入包含当前版本文字、材料类别、统一规范、路由选中的完整 Skill 与知识规则、接受边界。姓名标签、手机号、邮箱、身份证、银行卡、地址和签字标签只做基础脱敏，可能遗漏，用户应取消并上传已脱敏版本。个人资料、照片、签名、HR 记录和其他材料不加入输入。

端点：`GET /api/versions/{id}/review-preview` 返回实际文字与快照摘要；`POST /api/versions/{id}/reviews` 接收 `digest`、`authorized: true`、失败重试时 `retry: true`；`GET /api/versions/{id}/reviews` 查看版本任务与报告。全部校验所有权，写入有 CSRF 和账号行锁。

队列存在 MySQL，后台协程从数据库锁定任务，当前本机按单进程运行、一次处理一个任务。任务有 queued/running/completed/failed 状态，页面轮询，重开页面可恢复。失联 running 任务超过三分钟标失败，不自动再发；用户重新预览授权后才重试。queued 任务重启后继续，退出页面不取消。正在外部处理的请求无法通过删除材料撤回，但任务和报告随版本、事项、工作区级联删除，已删除任务不会恢复报告。

每次最多 24,000 字、500 段、4,000 输出 token，总请求超时 100 秒；每账号 UTC 日最多预留 10 次调用，每快照最多尝试三次。删除材料不返还配额，失败无自动重发；金额取决于服务商计费。快照包含实际文本、模型和规则摘要，重复提交幂等。知识库摘要和原文引用由服务端校验组装，未知规则或无法定位引文导致失败，不保存报告。明确的自愿放弃社保、劳动合同整年/整月期限与试用档位错配采用硬规则，其余由模型提取待核实线索。

所有发现仍需人工核验：项目知识库法律文本尚未独立验证现行效力，不生成“已确认违法”或安全结论。报告可定位原文、查看规则依据、保存为待确认问题，随材料版本保留。支持全量 TXT、HTML 导出，以及通过浏览器打印保存 PDF；报告阅读可切成单栏，分栏宽度可拖动。当前不做 OCR、自动跨材料语义核验或地方标准查询。

同学的维护原件位于项目根目录 `skills/00_统一规范与接口契约.md`、`skills/01_*.md` 至 `12_*.md`，知识规则位于 `knowledge/01_知识库说明与规则正文_OfferGuard.md`。`app/knowledge.py` 直接读取全文，无需另建在线知识库。保留编号与 Markdown 结构，修改内容并更新 Skill 版本后，用知识库页面确认加载，再对材料重新预览授权。主题按原文关键词路由，文件完整性与主体核对始终参与；未命中主题会标为“未进入”，不能当作语义审查通过。旧规则报告保留历史，并提供重新审查入口。

AI 追问只发送用户检查过的问题和当前已校验报告的线索、证据与知识依据。每次先展示完整 JSON，再单独授权；回答的引用 ID 必须属于该报告。追问与审查共享每账号每天 10 次配额，单次总超时 100 秒，以请求 ID 防止重复扣费；失败不自动重发，失联请求三分钟后标失败。历史随报告级联删除，外部请求期间删除材料会阻止迟到回答重新保存。它解释报告，不自动查询新法规、其他材料或替用户作签约决定。

流程为官网 → 登录或明确选择本设备 → 创建事项与上传 → 审查 → 原文核对 → HR 沟通与复核 → 记录决定 → 归档。登录后返回受保护的目标页面；本设备模式可管理材料、人工核对、决定及档案，真实模型审查与追问需要账号。人工核对和决定记录包含状态、理由及引用版本，保存历史；档案可导出目录与沟通记录。

验证（只创建并清理随机测试账号与合成材料；`--live` 额外付费调用一次模型）：

```bash
# 先停止 uvicorn，避免测试 mock 任务被另一真实 worker 抢占。
.venv/bin/python check_reviews.py
.venv/bin/python check_reviews.py --live
```

本次完整 Skill 的真实模型合成合同验证通过，生成 8 项待核实线索；mock 检查覆盖脱敏、授权快照、CSRF、双用户、幂等、失败重试、试用档位边界、长度限制、规则与证据拒绝、报告与追问级联删除、失联恢复、共享配额、网关异常与追问引用校验。追问接口使用 mock 网关验证，尚未付费实测模型追问。测试使用一个应用生命周期和一个 worker；第二用户仅发送鉴权 API 请求。当前不支持在同一进程中并发启动同一应用的多个生命周期。前端 6 项浏览器测试通过，覆盖入口守卫、上传直达、授权审查与追问、引用定位、全量导出、核对与决定历史、档案和 390px 布局；生产构建通过。
