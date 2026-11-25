# OfferGuard 展示部署

此配置把正式前端、FastAPI 和独立 MySQL 部署在同一台 Linux 云服务器。已于 2026-11-25 发布到 `https://pactmind.cn`，不依赖开发电脑在线。

需要服务器上的 Docker Engine 与 Compose 插件、建议 4 GB 内存，以及一个解析到服务器的域名。当前展示服务器为香港 Ubuntu 22.04、2 GB 内存，API 使用单进程；后续并发试用需按实际负载扩容。服务器防火墙开放 TCP 80、443；数据库和 API 端口不对外开放。大陆服务器使用自有域名须满足服务商的备案要求。是否在老师的网络流畅访问，需要部署后实际测验。

## 首次部署

只复制以下文件到新服务器：`Dockerfile`、`.dockerignore`、`frontend/`、`backend/app/`、`backend/migrations/`、`backend/requirements.txt`、`backend/alembic.ini`、`skills/`、`knowledge/`、`deployment/`。

不要复制本机 `backend/.env`、`backend/private/`、依赖目录或数据库。新环境使用独立账号和合成材料，不会迁移现有合同。

从 macOS 打包时使用 `COPYFILE_DISABLE=1 tar ...`，并排除 `._*` 系统文件，避免迁移目录混入 AppleDouble 元数据；`.dockerignore` 也已统一排除这些文件。

在服务器的 `deployment` 目录复制 `.env.example` 为 `.env`，填写域名、两条不同的随机数据库密码以及需要使用的 AI 密钥，将 `.env` 权限设为 600。不要把密码或密钥发到聊天里。

```bash
docker compose build
docker compose up -d
docker compose ps
```

数据库就绪后执行迁移，API 健康后启动网站。Caddy 自动申请 HTTPS 证书；需要 DNS 已生效且 80、443 端口可达。首次构建需要从镜像仓库、npm 和 PyPI 下载依赖，先完成部署，避免在展示现场构建。

## 展示前验收

从老师实际使用的网络或另一部手机打开：

- `https://pactmind.cn/`：首页与互动样例。
- `https://pactmind.cn/#salary-example`：可直接放入汇报 PPT 的案例链接。
- `https://pactmind.cn/login`：账号登录页，直接刷新仍可访问。
- `https://pactmind.cn/api/health`：应返回 `status: ready`。

本次公网验收：首页、登录页均返回 HTTP 200，健康检查返回 `ready`；本机网络的单次请求分别约 0.14 秒，不代表老师网络下的完整首屏时间。真实 MySQL 浏览器验收通过注册、上传、历史版本、PDF/Word 原件预览、原件下载、待确认问题、HR 记录、退出重登、刷新、双账号隔离和删除。公网浏览器还通过 390px 手机页面、互动样例、本设备模式的薪资差异追踪、HR 回复、新合同人工复核及后续版本失效、决定保存与档案目录导出。AI 密钥已配置，本次没有调用收费模型，AI 请求结果与耗时仍需实际体验确认。

云端是独立账号库，体验时请在网站注册账号。本机已有的账号与材料不会自动同步过去。

用独立测试账号与合成材料验证上传、PDF/Word 预览、批注、薪资追踪、退出重登和 PDF 下载。AI 功能需在服务器配置密钥并由用户授权，预留完成时间；未配置时不能宣称可用。测试通过后再交付老师链接，不使用公网开发服务器或临时隧道作为下周的固定入口。

浏览器本设备模式的数据只保存在那台设备；老师自己的账号数据保存于云端。服务器持久卷保存数据库、原件和证书，不能使用 `docker compose down -v`，该命令会删除这些数据。

## 更新与排错

更新源代码后重新构建，并重新执行迁移，再更新服务：

```bash
docker compose build
docker compose run --rm migrate
docker compose up -d
docker compose ps
docker compose logs --tail=80 api web migrate
```

分享日志前检查是否含个人信息。健康检查覆盖数据库迁移可读性，但不能代替真实浏览器验收或 AI 请求测试。

本配置适合展示和受控试用。当前 API 保持单进程运行，登录限流仍为内存实现，解析尚未在独立受限进程里运行。展示完成后若要扩大真实合同使用范围，再完善限流、解析隔离和恢复演练。

部署前与更新前都需同时备份 MySQL 和原件卷；仅备份网站代码不能恢复材料。此处使用展示库账号执行迁移，长期运行时应分开配置迁移账号与业务运行账号。
