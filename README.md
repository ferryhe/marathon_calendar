# 马拉松日历 Marathon Calendar

一个全面的马拉松赛事信息平台，提供Web版和微信小程序版本。

## 📖 项目文档

完整的项目文档已经重新整理，按类型分类便于查找。

**[📚 查看完整文档总览](./docs/README.md)**

### 🎯 最新文档（推荐阅读）

1. **[开发日志-2026-05-02 第三方平台研究与数据修正](./docs/开发日志/开发日志-2026-05-02-第三方平台研究与数据修正.md)** ⭐ NEW
   - 5 个第三方报名平台（最酷/马拉马拉/数字心动/爱燃烧/田协）调研结果
   - 13 条 marathon_sources 绑定 + 10 条 registration_url 修正
   - 数据库变更脚本与生产同步流程

2. **[数据库变更总览](./docs/数据库变更/README.md)** ⭐ NEW
   - 数据迁移命名规范、幂等性要求、psql 同步生产流程

3. **[项目进度检查报告-2026-03-08](./docs/项目计划/项目进度检查报告-2026-03-08.md)** ⭐
   - 阶段一进度（85%）、Branch 状态分析

4. **[下一步开发计划-2026-03-08](./docs/项目计划/下一步开发计划-2026-03-08.md)** ⭐
   - 3-6 月里程碑：数据质量、爬虫完善、性能安全

### 核心文档

3. **[研究报告-马拉松数据源调研](./docs/研究报告/研究报告-马拉松数据源调研.md)**
   - 如何收集马拉松赛事数据
   - 官方网站、第三方平台、搜索引擎等数据源分析
   - 推荐的数据采集策略

4. **[研究报告-数据提取与处理方案](./docs/研究报告/研究报告-数据提取与处理方案.md)**
   - 如何从网页中提取有用数据
   - AI API的使用方案和成本分析
   - 数据清洗和标准化流程

5. **[项目计划-完整开发路线图](./docs/项目计划/项目计划-完整开发路线图.md)**
   - Web网页版开发计划
   - 微信小程序开发计划
   - 腾讯云部署架构
   - 成员管理和评论系统设计

6. **[技术架构文档](./docs/项目计划/技术架构文档.md)**
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

**当前版本**: v0.6 Alpha（约60%完成）  
**最后更新**: 2026年2月16日

### ✅ 已完成功能

#### 用户系统
- ✅ 用户注册/登录（Passport.js认证）
- ✅ 用户个人资料管理
- ✅ 头像上传（支持腾讯云COS/本地存储）
- ✅ 微信账号绑定接口（API就绪）

#### 核心功能
- ✅ 马拉松赛事列表展示
- ✅ 多维度筛选（地区、时间、报名状态）
- ✅ 关键词搜索
- ✅ 赛事详情页（含历届信息）
- ✅ 收藏功能
- ✅ 评论与评分系统
- ✅ 点赞和举报功能

#### 管理后台
- ✅ 数据源管理
- ✅ 同步调度系统
- ✅ 原始数据管理
- ✅ AI辅助提取
- ✅ 赛事CRUD管理
- ✅ 数据统计面板

### 🟡 进行中功能

- 🟡 数据采集爬虫（框架就绪，爬虫开发中）
- 🟡 AI提取优化（模板生成已就绪）
- 🟡 管理后台UI优化

### ⏳ 计划中功能

- ⏳ 微信小程序版本
- ⏳ 微信授权登录
- ⏳ 订阅消息推送
- ⏳ 智能推荐系统
- ⏳ 赛事提醒功能
- ⏳ 数据分析报告

详细的项目状态和开发计划请查看：
- [项目现状总结-2026-02-16](./docs/项目计划/项目现状总结-2026-02-16.md)
- [下一步开发计划-2026-02-16](./docs/项目计划/下一步开发计划-2026-02-16.md)
- [项目计划-完整开发路线图](./docs/项目计划/项目计划-完整开发路线图.md)

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

本应用采用三层数据源策略：

1. **官方赛事网站**（`marathons.website_url`）— 权威信息源
2. **第三方报名平台**（`marathon_editions.registration_url`）— 直达报名通道
   - 最酷体育 zuicool（6 个赛事直链）
   - 马拉马拉 mararun（6 个子域名）
   - 数字心动 shuzixindong（仅宁波 1 个）
3. **田协权威背书**（runchina）— 金/银/铜标赛事认证

调研详情：
- [研究报告-马拉松数据源调研](./docs/研究报告/研究报告-马拉松数据源调研.md) — 早期数据源分析
- [研究报告-最酷zuicool爬取方案](./docs/研究报告/研究报告-最酷zuicool爬取方案.md)
- [研究报告-马拉马拉mararun爬取方案](./docs/研究报告/研究报告-马拉马拉mararun爬取方案.md)
- [研究报告-iranshao与shuzixindong状态评估](./docs/研究报告/研究报告-iranshao与shuzixindong状态评估.md)
- [研究报告-runchina田协赛历方案](./docs/研究报告/研究报告-runchina田协赛历方案.md)

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
