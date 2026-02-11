# 马拉松日历 Marathon Calendar

一个全面的马拉松赛事信息平台，提供Web版和微信小程序版本。

## 📖 项目文档

完整的项目研究报告和开发计划已经准备完毕，请查看：

**[📚 查看完整文档](./docs/README.md)**

### 核心文档

1. **[研究报告-马拉松数据源调研](./docs/研究报告-马拉松数据源调研.md)**
   - 如何收集马拉松赛事数据
   - 官方网站、第三方平台、搜索引擎等数据源分析
   - 推荐的数据采集策略

2. **[研究报告-数据提取与处理方案](./docs/研究报告-数据提取与处理方案.md)**
   - 如何从网页中提取有用数据
   - AI API的使用方案和成本分析
   - 数据清洗和标准化流程

3. **[项目计划-完整开发路线图](./docs/项目计划-完整开发路线图.md)**
   - Web网页版开发计划
   - 微信小程序开发计划
   - 腾讯云部署架构
   - 成员管理和评论系统设计

4. **[技术架构文档](./docs/技术架构文档.md)**
   - 系统架构设计
   - 数据库设计
   - API接口规范
   - 安全和性能优化

## 🚀 快速开始

### 环境要求

- Node.js 20+
- Docker（用于快速启动 PostgreSQL）
- Redis（当前版本可选，预留给缓存模块）

### 首次安装（Windows）

1. 安装 Node.js 20+ 与 Docker Desktop。
2. 用 Docker 启动 PostgreSQL：

```bash
docker run --name marathon-pg ^
  -e POSTGRES_USER=marathon ^
  -e POSTGRES_PASSWORD=marathon ^
  -e POSTGRES_DB=marathon_calendar ^
  -p 5432:5432 -d postgres:16
```

3. 在项目根目录创建 `.env`：

```env
DATABASE_URL=postgresql://marathon:marathon@localhost:5432/marathon_calendar
REDIS_URL=redis://localhost:6379
SESSION_SECRET=replace-with-a-random-string
AI_API_KEY=your-ai-api-key
```

说明：
- 开发环境未设置 `SESSION_SECRET` 会使用默认值并打印警告；生产环境必须设置 `SESSION_SECRET`（否则服务将拒绝启动）。
- `NODE_ENV=production` 时会话存储使用 PostgreSQL（`connect-pg-simple`），启动时会自动创建 `mc_sessions` 表。

4. 安装依赖并初始化数据库：

```bash
npm install
npm run db:ensure
```

5. 启动开发服务（前后端一体）：

```bash
npm run dev
```

访问 http://localhost:5000 。

### 首次安装（Linux）

1. 安装 Node.js 20+、Docker Engine（或 Docker Desktop for Linux）。
2. 启动 PostgreSQL 容器：

```bash
docker run --name marathon-pg \
  -e POSTGRES_USER=marathon \
  -e POSTGRES_PASSWORD=marathon \
  -e POSTGRES_DB=marathon_calendar \
  -p 5432:5432 -d postgres:16
```

3. 在项目根目录创建 `.env`：

```env
DATABASE_URL=postgresql://marathon:marathon@localhost:5432/marathon_calendar
REDIS_URL=redis://localhost:6379
SESSION_SECRET=replace-with-a-random-string
AI_API_KEY=your-ai-api-key
```

说明：
- 开发环境未设置 `SESSION_SECRET` 会使用默认值并打印警告；生产环境必须设置 `SESSION_SECRET`（否则服务将拒绝启动）。
- `NODE_ENV=production` 时会话存储使用 PostgreSQL（`connect-pg-simple`），启动时会自动创建 `mc_sessions` 表。

4. 安装依赖并初始化数据库：

```bash
npm install
npm run db:ensure
```

5. 启动开发服务：

```bash
npm run dev
```

访问 http://localhost:5000 。

### Linux 生产环境启动

```bash
npm run build
npm run start
```

### 仅前端调试（可选）

```bash
npm run dev:client
```

## 📱 功能特性

### 当前功能

- ✅ 马拉松基础数据模型
- ✅ 用户认证系统
- ✅ 评论和评分功能
- ✅ 数据源管理
- ✅ 同步调度系统

### 计划功能

- [ ] Web前端界面（赛事列表、详情、搜索）
- [ ] 数据爬虫系统（Puppeteer + AI辅助）
- [ ] 微信小程序版本
- [ ] 微信授权登录
- [ ] 订阅消息推送
- [ ] 管理后台

详细的开发计划请查看 [项目计划文档](./docs/项目计划-完整开发路线图.md)。

## 🏗️ 技术栈

### 前端
- React 19
- Vite
- Radix UI + Tailwind CSS
- TanStack Query
- Wouter (路由)

### 后端
- Node.js + Express
- TypeScript
- Drizzle ORM
- PostgreSQL
- Redis
- Passport.js

### 数据采集
- Puppeteer (网页爬虫)
- Cheerio (HTML解析)
- 通义千问 API (AI辅助提取)

### 云服务
- 腾讯云

## 📊 数据来源

本应用从以下来源收集马拉松赛事信息：

- 官方赛事网站
- 第三方报名平台（如最酷体育、爱燃烧）
- 搜索引擎和社交媒体

详细的数据源调研请查看 [数据源调研报告](./docs/研究报告-马拉松数据源调研.md)。

## 📄 许可证

MIT License

## Crawler Module

### Overview
The Crawler module is designed to automate the data collection process from various sources. It fetches, processes, and stores data efficiently.

### Features
- Automated data fetching
- Data processing pipelines
- Integration with existing schemas

### Schema Extensions
The following extensions have been made to enhance data structure compatibility:

- **New Fields**:
  - `source_url`: URL of the data source.
  - `last_crawled`: Timestamp of the last crawl operation.

- **Updated Fields**:
  - `data_format`: Changed to accept additional data formats (e.g., XML, JSON).

## Tencent COS Avatar Config (Production)

Avatar upload now supports dual mode:
- COS mode: enabled when `COS_REGION` + `COS_SECRET_ID` + `COS_SECRET_KEY` are provided.
- Local mode: fallback to `/uploads/avatars` when COS credentials are missing.

Required env vars:
- `COS_BUCKET` (already set to `marathon-calendar-1256398230` in `.env.example`)
- `COS_REGION`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`

Optional env var:
- `COS_PUBLIC_BASE_URL` (CDN domain, e.g. `https://cdn.your-domain.com`)

Recommended Tencent Cloud setup:
- COS bucket public-read for GET.
- API key write permission limited to this bucket path.
- Front CDN with cache headers.
