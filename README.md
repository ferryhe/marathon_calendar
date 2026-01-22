# Marathon Calendar（马拉松日历）

一个用于查看国内/海外马拉松赛事的日历型前端应用，带有搜索、赛事详情弹窗与示例数据。前端使用 Vite + React + Tailwind CSS，后端为 Express（当前仅提供基础骨架）。

## 功能概览

- **国内/海外赛事切换**：通过 Tab 在国内与海外赛事之间快速切换。
- **搜索过滤**：支持按赛事名称或城市进行关键词搜索。
- **按月份分组展示**：赛事按月份聚合并排序显示。
- **赛事详情弹窗**：展示赛事日期、城市、报名状态、简介、报名要求、示例点评等。
- **模拟更新按钮**：点击刷新按钮触发示例“更新成功”提示。

## 技术栈

- **前端**：React 19、Vite、Tailwind CSS、Wouter、TanStack Query、Radix UI
- **后端**：Express 5（用于 API 扩展与生产环境静态资源服务）
- **数据层**：示例数据存放在 `client/src/lib/mockData.ts`

## 项目结构

```
.
├── client/                 # 前端应用
│   ├── src/
│   │   ├── components/      # 组件（赛事列表、详情弹窗等）
│   │   ├── pages/           # 页面入口（Home 等）
│   │   └── lib/             # 工具与模拟数据
├── server/                 # 后端服务（Express）
├── shared/                 # 共享类型/Schema
└── script/                 # 构建脚本
```

## 开发与运行

### 前端开发（Vite）

```bash
npm run dev:client
```

访问：`http://localhost:5000`

### 全栈开发（Express + Vite 中间件）

```bash
npm run dev
```

> 该命令会启动 Express 服务，并在开发环境下集成 Vite 中间件。

### 生产构建

```bash
npm run build
```

构建后产物位于 `dist/`，可通过以下命令启动：

```bash
npm run start
```

## 关键脚本

- `npm run dev:client`：仅启动前端 Vite 开发服务器
- `npm run dev`：启动 Express 开发服务器并加载 Vite 中间件
- `npm run build`：构建前端与后端产物
- `npm run start`：启动生产环境服务
- `npm run check`：TypeScript 类型检查

## 数据说明

当前赛事数据来自 `client/src/lib/mockData.ts` 的模拟数据。后续可扩展 `server/routes.ts` 增加 API，并在前端使用真实数据替换。

## 环境变量

- `PORT`：服务端监听端口（默认 `5000`）

## 许可证

MIT
