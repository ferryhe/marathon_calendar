# 研究报告：百马汇（marathonbm.com）爬取与绑定方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **配套文档**：`研究报告-最酷zuicool爬取方案.md` · `研究报告-马拉马拉mararun爬取方案.md` · `研究报告-iranshao与shuzixindong状态评估.md` · `研究报告-runchina田协赛历方案.md`
> **适用场景**：从 marathonbm.com 发现未收录马拉松，或为已收录赛事补充第三方报名链接

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 中文名 | 百马汇 / 中国马拉松官方合作伙伴 |
| 主域名 | `https://www.marathonbm.com` |
| 后端网关 | `https://gateway.marathonbm.com`（**仅在 JS bundle 暴露，公开接口未文档化**）|
| 图片 CDN | `https://marathon-bm-file.oss-cn-beijing.aliyuncs.com`（阿里云 OSS，带签名 URL） |
| 备案 | 中国马拉松官方合作伙伴（首页 keywords 自称） |
| 技术栈 | **Vue SPA**（chunk-vendors + app.{hash}.js + 多个 lazy-loaded chunk-{id}.js） |
| 反爬程度 | **中等**：列表内容只在 SPA 渲染后出现，不能纯 HTML 抓；但 OG/SSR 摘要会把首屏 10 条赛事的标题 + 日期写入 `<noscript>` 区域，能被 `webFetch` 的 markdown 提取拿到 |
| 法律 / Robots | 公开浏览免登录。**仅做查询、不爆量、不绕付费** |

---

## 2. URL 模式（**最重要**）

```
赛事列表（SPA 主入口）        https://www.marathonbm.com/event
赛事详情                     https://www.marathonbm.com/eventDetail/{id}      ← 路由存在但 SSR 无数据
活动详情                     https://www.marathonbm.com/activityDetail/{id}
赛事日历                     https://www.marathonbm.com/eventCalendar
新闻列表 / 详情              https://www.marathonbm.com/news /newsDetail
帮助 / 关于                 https://www.marathonbm.com/helpCenter /aboutUs
```

**关键观察**：

- **`?page=N` 不工作**：列表是 SPA 内部状态，URL 永远是 `/event`，分页通过 JS 改 store。同样 `?area=...&type=...&year=...&month=...` 这些查询参数也对 SSR 无效。
- 总数：列表底部分页器显示 **共 398 页**，每页 10 条 → 全站约 4000 条赛事记录（含历届归档 + 越野/泡泡跑/亲子嘉年华等大量非主流项）。
- **不要试图穷举 `/eventDetail/{id}`**：ID 不连续，且单页 SSR 无数据，纯浪费 fetch 配额。

---

## 3. 反爬 / SSR 行为

### 3.1 列表页 SSR 行为（**意外的好消息**）
虽然是 SPA，但 `/event` 的服务端渲染**会把首屏 10 条赛事的卡片摘要（标题 + 竞赛日期 + 立即报名按钮）渲染到 HTML 里**。`webFetch` 解析后在 `markdown` 字段能拿到这种结构：

```
### 2026贵州·镇宁黄果树半程马...
+关注
距报名结束：
竞赛时间：2026年06月24日
立即报名
```

> ⚠️ **标题被 CSS 截断**：卡片标题用 ellipsis 截断，markdown 里也带 `...` 末尾。**不能直接当 canonical name 入库**。

### 3.2 推荐赛事区（**截断的解药**）
markdown 末尾有「**推荐赛事**」区域（约 6 条），这里的标题是**完整不截断**的，例如：
```
2026贵州·镇宁黄果树半程马拉松
    06月24日
2026 MONTANE VIA系列训练赛·北京站
    05月31日
```
**做法**：先在「赛事列表」拿到截断的标题 + 日期作为索引，然后查「推荐赛事」补全完整名称（如果该赛事被推荐）。或者直接交叉用 `webSearch` 验证。

### 3.3 网关 API（**已逐路径放弃**）
我们试探过 30+ 路径全部 404：
```
/api/event/list          /api/event/page         /api/event       /api/event/search
/api/race/list           /api/race/page          /api/race
/api/v1/event            /v1/event/list          /api/index/event /api/home/event
```
全部探活方式都用了 `?page=1&size=20` / `?pageNum=1&pageSize=20` / `?current=1&size=20` 三种常见分页惯例 + `Origin: https://www.marathonbm.com` 头，结果都是后端网关返回的 `{"timestamp":"...","status":404}` JSON。**结论：实际接口路径只在已编译 JS 里，下次有人想再挖可以解 webpack chunk，但成本远大于直接改用 webSearch**。

### 3.4 `chunk-vendors.c787c36e.js` 的线索
JS bundle 里能找到的硬证据只有：
```
baseURL: "https://gateway.marathonbm.com"
url: "/sys-token/aliYunSts"
```
其余 axios 调用全在 lazy chunk 里被 minify 后字符串拼接，`grep` 已经拿不到完整 URL 串。

---

## 4. 标准发现流程（5 步）

### Step 1：拉首屏列表，拿 10 条候选标题 + 日期

```js
const r = await webFetch({ url: 'https://www.marathonbm.com/event' });
// r.markdown 包含约 16KB，前半段是筛选器，中段 10 条赛事卡片，末段 6 条推荐
```

> ⚠️ webFetch 的字段是 **`markdown`**（不是 `content`）。检查响应时记得 `r.markdown.slice(...)`。

### Step 2：解析卡片，得到 `(截断标题, 竞赛时间)` 结构

```js
const cards = [];
const cardRe = /###\s+(\S[^\n]*?)(?:\.\.\.)?\n[\s\S]{0,200}?竞赛时间：(\d{4})年(\d{1,2})月(\d{1,2})日/g;
let m;
while ((m = cardRe.exec(r.markdown)) !== null) {
  cards.push({
    titleTruncated: m[1].replace(/\.\.\.$/, ''),
    raceDate: `${m[2]}-${m[3].padStart(2,'0')}-${m[4].padStart(2,'0')}`,
  });
}
```

### Step 3：按关键字过滤掉非马拉松

百马汇列表夹杂大量噪音项，**严格过滤**：

| 必保留 | 必丢弃 |
|---|---|
| 含「马拉松」「半程」「全马」 | 「越野赛」「越野挑战」「越野跑」 |
| 含赛事级别认证（A 类 / 金标） | 「泡泡跑」「嘉年华」 |
| | 「虎符」「少年挑战赛」「亲子」 |
| | 「健身走」「徒步」 |
| | 「训练赛」「联赛」「精英赛」（除非明确是马拉松） |

经验值：**首页 10 条里通常只有 2-3 条是真马拉松**，其余是消化运营商的小型活动。

### Step 4：用 webSearch 补全完整标题 + zuicool 平行链接

百马汇截断的标题不能直接做 canonical_name。同时百马汇本身的报名页指向 SPA `/eventDetail/{id}`（无意义），需要找 zuicool 的同届事件链接做主报名源。

```js
const queries = cards.map(c => `2026 ${c.titleTruncated} 报名 site:zuicool.com OR site:marathonbm.com`);
const r2 = await webSearch({ queries });
```

返回结果按以下优先级取：
1. `zuicool.com/event/{数字}` ← 用作 `is_primary=true` 报名源
2. 赛事自有官网（如 `symarathon.com`、`marathonchangsha.com`）← 备用主源
3. `marathonbm.com/event` ← 仅作为发现来源记录到 `marathon_sources`，**永远 `is_primary=false`**

### Step 5：用 zuicool 流程做最终 H1 校验

参见 `研究报告-最酷zuicool爬取方案.md` 第 3 节 Step 2。每个 zuicool/event/{id} 必须 `webFetch` 拿到 H1 = `2026{城市}马拉松`，年份不匹配的全部丢弃。

> ⚠️ **常见踩坑**：webSearch 返回的 zuicool ID 经常指向**历史届次**或**完全无关赛事**。本会话实例：搜「2026 济南马拉松」拿到 `zuicool.com/event/4713887`，但 H1 实际是「2026古蜀风华成都线上马拉松（面具可移动）」。**没有 H1 校验绝不入库**。

---

## 5. 陷阱实例（**务必避开**）

| 陷阱 | 现象 | 规避 |
|---|---|---|
| 标题截断 | `2026贵州·镇宁黄果树半程马...` | 取「推荐赛事」区或交叉 webSearch 补全 |
| ?page=N 假分页 | URL 改了内容不变 | 不浪费 fetch；要分页只能上 headless 浏览器 |
| 网关 404 大军 | 30+ 路径试探全黑 | 不再尝试，直接走 SSR markdown + webSearch |
| 阿里 OSS 签名图 | 抓回的图 URL 含 `Expires=...&Signature=...`，几小时后 403 | **不要把签名 URL 入库**；要图片自己重新存对象存储 |
| 「赛事大全」5 个筛选条 | 区域/项目/年份/赛况/月份选项写死在 SSR markdown 里，**但筛选结果不在 SSR 里** | 仅用筛选条枚举值做参考，不要假设 `?area=beijing` 工作 |
| 列表里的越野/泡泡占多数 | 看似富矿实则噪音 | 严格按 Step 3 关键字过滤 |
| 「推荐赛事」可能跨域 | 推荐区有时混入「2026 太湖 100·红色走廊轻越野挑战赛」这种非马拉松 | 推荐区只用来补全标题，不直接当候选 |

---

## 6. 入库到 `marathon_sources` 的规范

百马汇作为**第二聚合源**入 `sources` 表，配置：

```sql
INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, ...)
VALUES (
  '8c7f0a14-1234-4abc-9def-marathonbm001',     -- ⚠ sources.id 是 varchar 不是 uuid，可用易记字符串
  '百马汇（Marathonbm）',
  'platform',
  'HTML',
  'https://www.marathonbm.com',
  89,                                          -- 与 zuicool=90 / mararun=88 同梯队
  TRUE,
  3, 30, 15000, 0, ...
);
```

绑定到具体马拉松时：
- 已有 zuicool 主源 → marathonbm 作为 `is_primary=false` 的次级补充
- 没有 zuicool 但有 marathonbm 上的赛事页 → 仍然 `is_primary=false`，因为 `/event` 是列表入口不是赛事直链。配合官网 `is_primary=true`
- `source_url` 统一填 `https://www.marathonbm.com/event`（列表入口）。**不要填 `/eventDetail/{id}`**，那是空 SPA 路由

实例（本会话产出）：

| 赛事 | source_id | source_url | is_primary |
|---|---|---|---|
| 2026 临泽马拉松 | zuicool | `https://zuicool.com/event/42303` | true |
| 2026 临泽马拉松 | marathonbm | `https://www.marathonbm.com/event` | false |
| 2026 镇宁黄果树半程 | marathonbm | `https://www.marathonbm.com/event` | false |
| 2026 镇宁黄果树半程 | （无 zuicool，无官网） | — | — |

---

## 7. 注意事项 / 红线

1. **不要高频拉取**：百马汇列表页较大（16KB markdown），`min_interval_seconds` 建议改成 10。
2. **不要碰 `gateway.marathonbm.com`**：未授权探活已经留下 30+ 404 日志，再试只会被加黑。
3. **OSS 图片签名 URL 不要入库**：仅用于一次性 OG 截图。
4. **不要自动绑定 `/eventDetail/{id}`**：路由存在但 SSR 空，前端打开会白屏，对用户体验是负分。
5. **canonical_name 必须用 zuicool/官网验证后的完整名生成**，绝不能用百马汇截断标题。

---

## 8. 一键复用代码片段

```js
// 1. 拉首屏 + 提取候选
const r = await webFetch({ url: 'https://www.marathonbm.com/event' });
const cards = [];
const cardRe = /###\s+(\S[^\n]*?)(?:\.\.\.)?\n[\s\S]{0,200}?竞赛时间：(\d{4})年(\d{1,2})月(\d{1,2})日/g;
let m;
while ((m = cardRe.exec(r.markdown)) !== null) {
  cards.push({
    titleTruncated: m[1].replace(/\.\.\.$/, ''),
    raceDate: `${m[2]}-${m[3].padStart(2,'0')}-${m[4].padStart(2,'0')}`,
  });
}

// 2. 关键字过滤
const KEEP = /(马拉松|半程|全马)/;
const DROP = /(越野|泡泡|嘉年华|虎符|亲子|健身走|徒步|训练赛|精英赛)/;
const candidates = cards.filter(c => KEEP.test(c.titleTruncated) && !DROP.test(c.titleTruncated));

// 3. 交叉 webSearch 找 zuicool ID
const searches = await webSearch({
  queries: candidates.map(c => `2026 ${c.titleTruncated} 报名 site:zuicool.com`)
});

// 4. 提取 zuicool/event/{id}
const zcUrls = searches.map((s, i) => {
  const ans = s?.searchAnswer || '';
  const u = (ans.match(/https?:\/\/zuicool\.com\/event\/\d+/g) || [])[0];
  return { ...candidates[i], zcUrl: u };
}).filter(x => x.zcUrl);

// 5. H1 校验（参见 zuicool 报告 §3 Step 2）
const verified = await Promise.all(zcUrls.map(async x => {
  const html = await webFetch({ url: x.zcUrl });
  const h1Match = html.markdown.match(/\[\s*(202[5-7][^\]]*?马拉松[^\]]*?)\s*\]/);
  return h1Match && /2026/.test(h1Match[1]) ? { ...x, h1: h1Match[1] } : null;
})).then(arr => arr.filter(Boolean));

// 6. 入库（参见 docs/数据库变更/2026-05-02f-marathonbm-batch.sql 模板）
console.log('准备入库', verified.length, '条', verified.map(v => v.h1));
```

---

## 9. 实战回顾（2026-05-02f）

本次从百马汇首屏 10 条卡片里：
- 真马拉松 4 条：乌兰察布（已有）/ 临夏（已有）/ 临泽（新）/ 镇宁黄果树（新）
- 越野/泡泡/虎符/嘉年华 6 条：全部丢弃

仅 **2 条净增**，但作为「跨平台交叉验证」与「补充覆盖」很有价值（临泽 / 镇宁黄果树这两个三四线城市赛事在 zuicool 上的 ID 也相对难搜）。

横向用相同流程，**用 webSearch 找 8 个未收录的省会马拉松**（哈尔滨/长春/沈阳/郑州/福州/银川/长沙/南宁），共入库 **10 个新马拉松**。详见 `docs/数据库变更/2026-05-02f-marathonbm-batch.sql` 与 `docs/开发日志/开发日志-2026-05-02b-下一步计划落地.md` 的「2026-05-02f」章节。

---

**结语**：百马汇本身不是高产矿（每页 10 条里只能筛出 2-3 条真马拉松），但它能给我们一个**「按月分布」的全国候选池**——尤其适合在每年 4 月、9 月这两个赛季前的扩源窗口快速扫一遍 1-3 页找漏网赛事。**不要把它当作主源用**，永远配合 zuicool/官网做主报名链接，百马汇做发现来源 + 备份。
