# Deployment Guide — marathon_calendar

Last verified: 2026-09-08 · 部署方式：**systemd 宿主机 node**（不再是 docker 容器）

生产运行在本机 via **systemd `marathon.service`**，直接跑宿主机 `node dist/index.cjs`。
历史上用过 docker 容器（`marathon-app` + `marathon_calendar-marathon:vN` 镜像），
已于 2026-09 废弃，改为 systemd 宿主机部署。本文档同步更新。

| Component | Value |
|-----------|-------|
| Domain | `https://marathon.aiactuary.cn` |
| Caddy | `/etc/caddy/Caddyfile`（active）→ `127.0.0.1:5100` |
| Host port | 5100（iptables 已拦外部，仅 loopback 放行给 caddy） |
| 进程 | systemd `marathon.service` → `/usr/bin/node dist/index.cjs`（User=ubuntu） |
| 工作目录 | `/data/disk/opt/marathon_calendar` |
| Node 版本 | 宿主机 node v22（glibc） |
| PG | 容器 `marathon-postgres`（127.0.0.1:5432，数据卷 `marathon_pgdata`） |
| Redis | 容器 `marathon-redis`（127.0.0.1:6379，无持久化） |
| 配置 | `/data/disk/opt/marathon_calendar/.env`（600 权限） |
| 上传 | `/data/disk/opt/marathon_calendar/uploads` |
| 日志 | `/var/log/marathon.log`（systemd append） |

> **Secrets policy**：`.env` 含 `DATABASE_URL` / `REDIS_URL` / `SESSION_SECRET` /
> `ADMIN_API_TOKEN` / AI key / COS key，**绝不提交到 git**（`.gitignore` 已排除）。
> 参考 `.env.example` 了解所需变量，值从生产机 `.env` 或密钥管理取。

## 1. 构建产物说明

`npm run build` = `tsx script/build.ts`，产出 `dist/`：

- `dist/index.cjs` — esbuild 打包的 server（`allowlist` 内依赖如 express/pg/drizzle-orm **bundle 进产物**）
- `dist/public/` — vite 打包的 client

**关键**：`sharp` 等 native 模块是 **external**（不在 allowlist），运行时从
`node_modules/` 加载。因此生产机的 `node_modules` 必须保留这些 external 依赖
（`npm ci --omit=dev` 安装的生产依赖，glibc 版本）。

## 2. 更新流程（用 scripts/deploy.sh）

```bash
# 一键更新（内部：备份 → clone → 构建 → 部署 dist+依赖 → 重启 → 健康检查）
sudo scripts/deploy.sh
```

`deploy.sh` 做了什么：

1. 备份 postgres（调 `/usr/local/bin/backup-ai-actuary.sh`）
2. clone gitee 源码到 `/tmp/marathon-build`
3. `npm ci`（全量，含构建工具）+ `npm run build`
4. 备份旧 `dist/` → 部署新 `dist/`
5. `package-lock.json` 变化时才 `npm ci --omit=dev` 重装生产依赖
6. `systemctl restart marathon`
7. 健康检查 `https://marathon.aiactuary.cn/`，失败自动回滚 dist

## 3. 为什么 `node dist/index.cjs` 而不是 `npm start`

`package.json` 的 `start` 脚本是
`cross-env NODE_ENV=production node dist/index.cjs`，但 `cross-env` 在
`devDependencies`，生产依赖（`--omit=dev`）里没有，所以 `npm start` 会报
`sh: cross-env: not found`。直接用 `node dist/index.cjs`，`NODE_ENV` 由
systemd unit 的 `EnvironmentFile`（`.env`）提供。

## 4. 验证清单

```bash
# 1. 服务是 active 的，不是 restart 循环
systemctl status marathon                       # expect: active (running)

# 2. 进程是 node，且以 ubuntu 用户跑
ps aux | grep 'node dist/index.cjs'             # expect: ubuntu

# 3. Express 监听 5100
sudo ss -tlnp | grep 5100                       # expect: 127.0.0.1:5100

# 4. 直接 localhost
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5100/    # 200

# 5. Via Caddy（用户视角）
curl -sS -L -o /dev/null -w "%{http_code}\n" https://marathon.aiactuary.cn/   # 200

# 6. 核心 API
curl -sS -o /dev/null -w "%{http_code}\n" https://marathon.aiactuary.cn/api/marathons   # 200

# 7. uploads 可写（ubuntu 用户）
sudo -u ubuntu touch /data/disk/opt/marathon_calendar/uploads/.t && rm -f /data/disk/opt/marathon_calendar/uploads/.t && echo "✓ uploads writable"
```

## 5. Pitfalls

- **构建必须在有完整依赖的环境**：宿主机生产目录的 `node_modules` 是
  `npm ci --omit=dev`（只有生产依赖，缺 tsx/esbuild/vite），**不能**直接在
  生产目录构建。`deploy.sh` 在 `/tmp/marathon-build` 里 `npm ci` 全量后构建。
- **sharp 是 glibc 版本**：宿主机是 Ubuntu（glibc），生产 `node_modules/sharp`
  必须是 glibc 版。不要用 alpine（musl）容器构建后把 node_modules 复制过来。
- **`/etc/caddy/Caddyfile` 是 active 配置**，不是仓库里的 `Caddyfile`。
  改路由要改 `/etc/caddy/` 那个，然后 `systemctl reload caddy`。
- **Caddy 反代 `marathon.aiactuary.cn` → `127.0.0.1:5100`**，不是 5000。
- **端口已收紧**：5432/6379/5100 都只认本机，禁止改回 `0.0.0.0`。
- **不提交真实 secrets**：`.env` 已被 `.gitignore` 排除；部署时用生产机的 `.env`。
- **postgres/redis 容器是手动 `docker run --restart always` 起的**，无编排工具。
  重建参数见生产机 `/data/disk/opt/marathon_calendar/AGENTS.md`（该文件只在生产机存在，不在本仓库）。
- **schema 变更需手动迁移**：`deploy.sh` 不自动跑 DB 迁移。若新版本改了 schema，
  部署前在构建目录手动执行 `npm run db:ensure`（幂等建表）或按需 `npm run db:push`
  （需要 `DATABASE_URL` 指向生产的 postgres）。
