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
- PostgreSQL 14+
- Redis

### 安装依赖

```bash
npm install
```

### 配置环境变量

创建 `.env` 文件：

```env
DATABASE_URL=postgresql://user:password@localhost:5432/marathon_calendar
REDIS_URL=redis://localhost:6379
SESSION_SECRET=your-secret-key
AI_API_KEY=your-ai-api-key
```

### 初始化数据库

```bash
npm run db:push
```

### 启动开发服务器

```bash
# 启动后端API服务
npm run dev

# 启动前端开发服务器（新终端）
npm run dev:client
```

访问 http://localhost:5000 查看应用。

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