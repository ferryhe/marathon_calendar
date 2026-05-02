# 研究报告：NowRun 闹跑（nowrun.cn）爬取与绑定方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **配套文档**：`研究报告-最酷zuicool爬取方案.md` · `研究报告-马拉马拉mararun爬取方案.md` · `研究报告-百马汇marathonbm爬取方案.md` · `研究报告-chinarun玩比赛爬取方案.md` · `研究报告-runninginchina跑IN中国爬取方案.md`

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 中文名 | NowRun 闹跑 / "不想错过任何一场赛事" |
| 主域名 | `https://www.nowrun.cn` |
| 技术栈 | **Next.js (App Router) + 服务端渲染**，路径结构 `/race/{numericId}`、`/_next/static/...` |
| 反爬程度 | **极低**：完整 SSR，HTML 直接渲染所有赛事链接和详情字段；无登录、无验证码、无 JS 挑战 |
| 覆盖 | **专做 2026 年中国马拉松日历**（截至 2026-05 已收录 ID 1-420，约 490 个 race），按月份/省份/级别多维筛选 |
| ⚠️ 平台定位 | **本项目最直接的对标产品**。功能/体验与我们高度重叠，一定程度上是 benchmark |
| 法律 / Robots | 公开免登录浏览。**仅做查询、不爆量、不绕付费** |

> ⚠️ **重要立场提醒**：NowRun 是一个**正在进行中、和我们一样的开源精神产品**。爬取它的态度应该是「学习对标 + 谨慎补充」而不是「全量克隆」。**不要把它的全部数据库一次性塞进我们 DB**——这违反研究/竞品分析的合理使用边界。本指南只覆盖 "用它发现新候选 → 用其他源验证 → 入库" 的合规流程。

---

## 2. URL 模式（**最重要**）

```
首页（含 70+ 热门赛事链接）   https://www.nowrun.cn/
赛事详情                     https://www.nowrun.cn/race/{id}
日历视图                     https://www.nowrun.cn/calendar       ← 推测，未必工作
按月筛选                     https://www.nowrun.cn/?month={1-12}  ← 待验证
Next.js 静态资源             https://www.nowrun.cn/_next/static/...
图片                         /_next/image?url=...&w=...&q=...
```

**关键观察**：

- `/race/{id}` 的 ID 范围目前是 **1 ~ 420**（截至 2026-05），新赛事 ID 单调追加。
- ID 不连续（被删的赛事会留洞）。直接 `for(let i=1; i<=420; i++)` 顺序枚举会浪费 30% 配额。
- 推荐做法：**先抓主页**拿到所有当前活跃 ID 列表，再按需抓详情。

### 主页一次产出 490 个 race 链接

主页 SSR 输出约 27KB markdown，含 519 条 `[标题](https://www.nowrun.cn/race/{id})`，去重后 490 unique。
**主页抓一次胜过暴力枚举 ID** —— 这是 NowRun 给爬虫最大的礼物。

---

## 3. 反爬 / SSR 行为

### 3.1 主页结构

主页 markdown 顶部是一个**密集的赛事链接网格**，没有任何卡片包装：

```
[2026东极佳木斯抚远新年马拉松](https://www.nowrun.cn/race/77)
[2026石狮半程马拉松](https://www.nowrun.cn/race/189)
[2026粤港澳大湾区女子半程马拉松](https://www.nowrun.cn/race/295)
...
```

- 每个标题都以 `2026` 或 `2027` 开头，标准 4 位年 + 城市 + 类别格式。
- 标题**不截断**，可直接做 canonical_name 解析。
- 没有日期/状态/费用，要这些必须抓详情。

### 3.2 详情页结构（**信息密度极高**）

`/race/{id}` 一次返回约 1.7KB markdown，但字段密度堪比百科：

```
返回日历

# 2026厦门马拉松已结束                        ← H1（含状态后缀！）

福建·A类认证                                   ← 省份 + 田协等级

报名开始 9.16 22:00      报名截止 10.9 06:00
出签结果 10.14 10:00     比赛日 1.10 18:10

### ℹ️ 关键信息速览
比赛日期: 2026-01-11                          ← ISO 格式日期
比赛地点: 厦门市
赛事设项: 全程35000人200元报名20.7万人中签率16.9%
起点: 厦门国际会展中心
终点: 厦门国际会展中心
领物地点: 厦门国际会展中心C2厅
主办单位: 厦门市人民政府
报名渠道: 官方公众号官网文广体育小程序数字心动APP

### 🌟 赛事亮点  (含赛道/物资/奖牌描述)
### 🏙️ 厦门市 · 城市攻略  (必吃/必逛/交通)
### 天气  (历史 5 年同期天气)
### 📋 官方信息  (报名须知/竞赛规程/领物指南)
### 📺 官方网站                                ← 可拿官方 URL
[访问官网](https://www.xmim.org/)
```

### 3.3 提取要点

| 字段 | 正则 |
|---|---|
| 状态 | `/# (.+?)(已结束\|进行中\|未开始)/` |
| 田协等级 | `/(.+?)·(A1?\|B1?\|金标\|白金标)类?认证/` |
| 比赛日期 | `/比赛日期\s*\n\s*(\d{4}-\d{2}-\d{2})/` |
| 起终点 | `/起点\s*\n([^\n[]+)/` 和 `/终点\s*\n([^\n[]+)/` |
| 主办单位 | `/主办单位\s*\n([^\n#]+)/` |
| 官方网站 URL | `/\[访问官网\]\((https?:\/\/[^\)]+)\)/` |

### 3.4 ⚠️ Next.js 客户端导航的影响

`webFetch` (基于 Firecrawl) 抓的是首屏 SSR HTML，已经包含上述全部字段。**不要尝试用 puppeteer/playwright 强行触发客户端 hydration**——SSR 已经够用。

---

## 4. 标准发现流程（4 步）

### Step 1：抓主页 → 提取所有 race 链接

```js
const r = await webFetch({ url: 'https://www.nowrun.cn/' });
const md = r.markdown || '';
const re = /\[(20\d{2}[^\]]+?)\]\(https?:\/\/www\.nowrun\.cn\/race\/(\d+)\)/g;
const all = [...md.matchAll(re)].map(m => ({ id: m[2], name: m[1].trim() }));
const seen = new Set();
const races = all.filter(r => seen.has(r.id) ? false : (seen.add(r.id), true));
// 主页一次能拿到 ~490 个赛事
```

### Step 2：与 DB 现有名单 diff，拿候选

```js
const dbRows = await executeSql({ sqlQuery: `SELECT canonical_name FROM marathons` });
const haveSlugs = new Set(dbRows.output.split('\n').slice(1));
// 简单粗匹配：标题去年份去前后空格 → 比对 city
const newCandidates = races.filter(r => {
  const city = r.name.replace(/^20\d{2}/, '').replace(/[（(].*[)）]/, '').trim().slice(0, 6);
  return ![...haveSlugs].some(slug => slug.includes(city.replace('马拉松','')));
});
```

### Step 3：**按"已成熟产品 vs 缺漏地区"过滤**

NowRun 主页 490 条很大一部分是中小城市赛事（仁怀/孝感/娄底/咸宁/江油等）。**全收会让我们沦为它的克隆**。建议筛选：
- ✅ **省会/直辖市/计划单列市**（确保覆盖完整）
- ✅ **历史 A1 类金标赛**（厦门、北京、上海、广州、武汉、重庆等）
- ✅ **风景独特的地区赛**（西藏 / 新疆 / 三亚 / 香格里拉 / 青海湖）
- ⚠️ 县级 / 半程 / 同城重复（如「上海半程」「上海女子半马」）：**先观察用户搜索行为再决定**

### Step 4：抓详情 + 跨平台验证

拿到候选 ID 后：
```js
async function fetchNowrunDetail(id) {
  const r = await webFetch({ url: `https://www.nowrun.cn/race/${id}` });
  const md = r.markdown || '';
  const date = (md.match(/比赛日期\s*\n\s*(\d{4}-\d{2}-\d{2})/) || [])[1];
  const start = (md.match(/起点\s*\n([^\n[]+)/) || [])[1]?.trim();
  const officialUrl = (md.match(/\[访问官网\]\((https?:\/\/[^\)]+)\)/) || [])[1];
  return { id, raceDate: date, startPoint: start, officialUrl };
}
```

**任何来自 NowRun 的赛事，最终入库前要至少经过一个其他源（zuicool / 官网 / chinarun / marathonbm）验证日期**。原因：
1. NowRun 是新平台，单一信源风险高
2. 我们要建立的是**多源交叉验证**的口碑，不能"NowRun 说什么我们就发什么"

---

## 5. 陷阱实例（**务必避开**）

| 陷阱 | 现象 | 规避 |
|---|---|---|
| 标题含状态后缀 | "2026厦门马拉松**已结束**" | 入 H1 解析时去掉 `(已结束\|进行中\|未开始)` 后缀 |
| 同城多场半马 | 上海有上马 + 上海女子半马 + 上海半马 + 上海嘉定半马 + 上海湾区半马 + 上海长江半马 + 上海苏州河半马 + 上海黄浦半马 ≈ 8 场 | 按 canonical_name 严格区分；不要因为字面相似就合并 |
| 去年的 ID 还在主页 | 主页有 ID=24 西青区半马（2026 年初的赛事） | 详情页状态字段会标 `已结束`，根据状态决定是否展示 |
| 中签率/价格信息易过期 | "20.7万人中签率16.9%" 是去年数据 | 不要把这些动态数字写入 marathons 表，仅用于人工参考 |
| 起跑时间 ≠ 比赛日 | "比赛日 1.10 18:10" 这里是**起物领取日**，真实比赛日要看 "比赛日期" 字段 | 严格用 `比赛日期` 字段（ISO 格式），不用 "比赛日" |
| 官方网址有时是公众号 | "官方网站" 字段可能链向 `mp.weixin.qq.com/...` | 拿到 URL 后判断 `/^https?:\/\/(www\.)?[a-zA-Z0-9-]+\.(com\|cn\|org)\//`，不是真官网就置空 |

---

## 6. 入库到 `marathon_sources` 的规范

NowRun 作为**对标 + 发现源**，配置：

```sql
INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, ...)
VALUES (
  'nowrun-001-cn-2026',
  'NowRun 闹跑',
  'platform',
  'HTML',
  'https://www.nowrun.cn',
  87,                                          -- 与 mararun=88 同梯队，略低于 zuicool=90
  TRUE,
  3, 30, 15000, 0, ...
);
```

**绑定规则**：
- ✅ 永远 `is_primary=false`（对标产品不能做我们的主源）
- ✅ `source_url` 填 `/race/{id}`（详情页稳定）
- ⚠️ 不要把 NowRun 的「赛事亮点 / 城市攻略 / 天气」原文搬进我们 DB——这是它的**编辑性原创内容**，未授权使用涉嫌抄袭

---

## 7. 注意事项 / 红线

1. **每天只抓 1 次主页**：主页几乎每天都更新，但我们不需要分钟级新鲜度。`min_interval_seconds=86400` 都不为过。
2. **总共抓的详情页 ≤ 30 / 天**：尊重对方带宽，避免触发 Cloudflare/Vercel 速率限制（NowRun 部署在 Vercel）。
3. **不抓 `/_next/data/...` 内部 JSON**：那是 Next.js 内部 hydration 数据，未文档化、随发布版本变化，长期不稳定。
4. **赛事描述全部用我们自己的话重写**：禁止直接 copy NowRun 的「赛事亮点」「城市攻略」段落。
5. **如果 NowRun 团队联系我们**：友好沟通，互通有无。本项目是开源精神，对方是商业产品，没必要互相消耗。

---

## 8. 一键复用代码片段

```js
// 1. 抓主页 → 拿 490 个候选
const r = await webFetch({ url: 'https://www.nowrun.cn/' });
const md = r.markdown || '';
const re = /\[(20\d{2}[^\]]+?)\]\(https?:\/\/www\.nowrun\.cn\/race\/(\d+)\)/g;
const all = [...md.matchAll(re)].map(m => ({ id: m[2], name: m[1].trim() }));
const seen = new Set();
const races = all.filter(x => seen.has(x.id) ? false : (seen.add(x.id), true));

// 2. 与 DB diff（极简版）
const dbRows = await executeSql({ sqlQuery: `SELECT canonical_name FROM marathons` });
const haveCities = new Set(
  dbRows.output.split('\n').slice(1)
    .map(slug => slug.split('-')[0]).filter(Boolean)
);

// 3. 按"省会 + 计划单列"白名单筛选
const TIER1 = /^(202[5-7])(北京|上海|广州|深圳|重庆|成都|杭州|武汉|南京|天津|西安|苏州|青岛|长沙|郑州|大连|宁波|济南|沈阳|哈尔滨|长春|南宁|福州|昆明|贵阳|兰州|银川|乌鲁木齐|呼和浩特|海口|拉萨|台北|高雄)/;
const candidates = races.filter(x => TIER1.test(x.name));

// 4. 抓详情验证日期 + 拿官方网址
const verified = await Promise.all(candidates.slice(0, 10).map(async x => {
  const d = await webFetch({ url: `https://www.nowrun.cn/race/${x.id}` });
  const md = d.markdown || '';
  return {
    ...x,
    raceDate: (md.match(/比赛日期\s*\n\s*(\d{4}-\d{2}-\d{2})/) || [])[1],
    officialUrl: (md.match(/\[访问官网\]\((https?:\/\/[^\)]+)\)/) || [])[1],
  };
}));

console.log('Tier-1 候选 + 详情验证完成', verified.length);
```

---

## 9. 实战回顾（2026-05-02）

- **首抓主页**：27KB / 490 unique races，效率 ≈ 18 races/KB
- **样本详情页**：`/race/190` (2026 厦门马拉松) 1.7KB markdown，含 12 个结构化字段
- **DB diff**：DB 现有 47 个 China marathons，NowRun 主页含 490 个，**潜在新增空间 ≈ 400**——但严格按「Tier-1 城市 + 风景独特赛」筛选后，实际**符合本项目品味的候选 ≈ 30-50 个**
- **本次操作**：未直接入库（避免一次性"克隆"），仅记录方法论。后续每月做 1 次小批量补充（每次 ≤ 10 个），保持数据增长节奏与质量并重

---

**结语**：NowRun 是国内**目前唯一一个把 2026 马拉松日历做出 Apple-like 产品质感**的对标产品。它教会我们的不只是数据，更是**信息密度 + 视觉节奏 + 中签率/起终点/天气的字段优先级**。建议团队定期人工浏览（不只是爬取），把它当作 product benchmark。爬取上严格守住"发现 → 验证 → 入库"三步，永远不要把 NowRun 当作我们的主源——尊重对手是建立长期口碑的基础。
