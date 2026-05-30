# 🏃 马拉松日历 Marathon Calendar

全球马拉松赛事信息平台 — 覆盖中国及海外 50+ 国家、500+ 赛事，支持浏览、筛选、收藏、评论与数据自动同步。

A global marathon race information platform covering 50+ countries and 500+ events, with browsing, filtering, favorites, reviews, and automated data sync.

---

## ✨ 功能特性 Features

| 功能 Feature | 说明 Description |
|---|---|
| 🌍 全球赛事浏览 | 支持按地区（中国/海外）、国家、月份、状态、距离筛选 |
| 🔍 智能搜索 | 赛事名称模糊搜索 |
| 📊 赛事详情 | 历届信息、设项、起终点、奖牌、报名渠道等富数据 |
| ⭐ 收藏与评论 | 用户收藏、评分、评论系统 |
| 🔄 自动数据同步 | 定时爬取官方/第三方平台，AI 辅助提取兜底 |
| 🛠 管理后台 | 数据源管理、原始数据审核、AI 规则生成 |
| 🌙 暗色模式 | 跟随系统偏好自动切换 |
| 🌐 国际化 | 中文 / English 双语界面 |

---

## 🏗️ 技术栈 Tech Stack

| 层级 Layer | 技术 Technology |
|---|---|
| **前端 Frontend** | React 19, Vite, TypeScript, Tailwind CSS, Radix UI (shadcn/ui), Wouter, TanStack Query, Framer Motion |
| **后端 Backend** | Node.js, Express 5, TypeScript, Drizzle ORM, PostgreSQL, WebSocket |
| **数据采集 Crawler** | Cheerio, JSON-LD parsing, regex extraction, OpenAI-compatible AI fallback |
| **部署 Deploy** | Docker, Caddy (reverse proxy), Node.js production build |

---

## 🚀 快速开始 Quick Start

### 环境要求 Prerequisites

- Node.js 20+
- PostgreSQL 16+
- (可选) Docker

### 安装步骤 Setup

```bash
# 1. 克隆仓库
git clone https://github.com/ferryhe/marathon_calendar.git
cd marathon_calendar

# 2. 启动 PostgreSQL（Docker 方式）
docker run --name marathon-pg \
  -e POSTGRES_USER=marathon \
  -e POSTGRES_PASSWORD=marathon \
  -e POSTGRES_DB=marathon_calendar \
  -p 5432:5432 -d postgres:16

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DATABASE_URL、SESSION_SECRET 等

# 4. 安装依赖 & 初始化数据库
npm install
npm run db:ensure

# 5. 启动开发服务
npm run dev
# 访问 http://localhost:5000
```

### 生产部署 Production

```bash
npm run build
npm run start
```

---

## 📊 数据覆盖 Data Coverage

| 区域 Region | 赛事数 Events | 数据源 Sources |
|---|---|---|
| 🇨🇳 中国大陆 | 378+ | 官方赛事网站、最酷、马拉马拉、百马汇、数字心动、跑IN中国、NowRun |
| 🇭🇰🇲🇴🇹🇼 港澳台 | 38+ | Bravelog (台湾)、手工录入 (香港) |
| 🌏 海外 | 160+ | Race Roster (168 赛事)、CHINARUN (海外)、World Marathon Majors 官方 |

**赛事类型**: 全程马拉松、半程马拉松、越野跑

**数据更新**: 爬虫定时自动同步，部分赛事支持 AI 兜底提取。

---

## 📁 项目结构 Project Structure

```
├── client/src/          # React 前端
│   ├── pages/           # 页面组件 (Home, MarathonDetail, Profile, AdminData, About)
│   ├── components/      # UI 组件 (MarathonTable, EventDetails, StatusBadge, Footer)
│   ├── hooks/           # 自定义 hooks (useAuth, useMarathons)
│   ├── i18n/            # 国际化 (zh.json, en.json)
│   └── lib/             # 工具函数、API 客户端
├── server/              # Express 后端
│   ├── routes.ts        # 全部 API 路由
│   ├── syncScheduler.ts # 爬虫调度引擎
│   ├── aiExtractor.ts   # AI 提取兜底
│   ├── editionMerge.ts  # 数据合并逻辑
│   └── db.ts            # 数据库连接
├── shared/              # 共享类型与 Schema
├── script/              # 数据导入/维护脚本
├── config/              # YAML 配置文件
└── crawler/             # 爬虫模块
```

---

## 📄 许可证 License

MIT License

---

<p align="center">
  <sub>Built with ❤️ for the running community | 为跑者社区而建</sub>
</p>
