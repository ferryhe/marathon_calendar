# 研究报告：最酷（zuicool.com）爬取与绑定方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **适用场景**：为国内马拉松补充第三方报名链接、抓取赛事日期/报名时间、丰富 `marathon_sources` 绑定

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 公司主体 | 最酷（北京）科技有限公司 |
| 主域名 | `https://zuicool.com` |
| 报名子域 | `https://reg.zuicool.com` |
| CDN/图片 | `https://s.pro.zuicool.com`, `https://zc3-op.bkt.zuicool.com` |
| 备案号 | 京 ICP 备 17073533 号 |
| 反爬程度 | **极低**：主站为 server-rendered HTML，未发现 JS challenge / 登录墙 / 验证码（仅交支付时需登录） |
| Robots / 法律 | 未见 robots.txt 禁止爬虫；公开赛事页可访问。**仅做查询、不爆量、不绕付费** |

---

## 2. URL 模式（**最重要**）

```
赛事详情页（聚合介绍）   https://zuicool.com/event/{eventId}
一键报名页（直接下单）   https://reg.zuicool.com/{regId}
英文版报名页           https://reg.zuicool.com/en/{regId}
赛事预约通道（候补）    https://zuicool.com/event/{eventId}/bkevent
新闻/竞赛规程          https://zuicool.com/news/archives/{articleId}
赛事大全（可筛选）     https://zuicool.com/events?type=run&where=beijing&when=9
新开报名列表          https://zuicool.com/events/newreg
```

**关键观察**：
- `eventId` 和 `regId` **不是同一个数字**。`event/64264` 对应的报名页可能是 `reg.zuicool.com/15942`。需要从 event 详情页 HTML 内提取出 `reg.zuicool.com/...` 的 href。
- 同一赛事不同届次有 **完全不同的 eventId**（例如 2025 上海马拉松和 2026 上海马拉松是两个 ID）。**绝不能假定旧 ID 自动跳转新届**。
- `where` 参数取值：`beijing` / `shanghai` / `guangshen`（粤）/ `jinjingji`（京津冀）/ `jiangzhe`（江浙沪）/ `dongbei` / `asia` 等，详见首页热点搜索。

---

## 3. 标准发现流程（4 步）

### Step 1：用搜索引擎找候选 URL

不要试图爬最酷自己的搜索框（它是带 cookie 的 ajax）。直接用 `webSearch`：

```js
const r = await webSearch({
  queries: [
    '2026 上海马拉松 site:zuicool.com OR site:reg.zuicool.com 报名',
    '2026 杭州马拉松 site:zuicool.com OR site:reg.zuicool.com 报名',
    // ...
  ]
});
```

`webSearch` 内部已经走了 Brave/Google 索引，能直接返回 `zuicool.com/event/{id}`。**一次最多 8-10 个 query，完全可以并行**。

返回结果优先选：
1. `zuicool.com/event/{数字}` —— 详情页
2. `reg.zuicool.com/{数字}` —— 报名页（无 hmsr 后缀的更干净）
3. `zuicool.com/news/archives/{数字}` —— 文章（**只能当线索**，不要直接绑定）

### Step 2：用 `webFetch` 验证届次

最酷的页面 **会保留历届归档**。搜到 URL 后必须验证其指向当届。打开页面看标题：

```js
const r = await webFetch({ url: 'https://zuicool.com/event/64264' });
// 关键：r.markdown 里搜 "# [2026..." 这种 h1
```

校验规则：
- ✅ `# [2026上海马拉松]` → 当届，可绑
- ❌ `# [2025上海马拉松]` 或 `# [2024...]` → 历史，**禁止绑定到 2026 届**
- ⚠️ 如果届次无年份（例如越野赛常用 "第七届XX越野赛"），用页面里的 "比赛日期：YYYY-MM-DD" 字段验证

**陷阱实例**（务必避开）：
| 搜到的 URL | 标题届次 | 我们要绑的届次 | 结论 |
|---|---|---|---|
| `event/26622` | 2026 建发厦门马拉松 | xiamen-marathon-**2027** | ❌ 跳过，2026/01 已结束 |
| `event/66868` | 2026 宁波马拉松 | ningbo-marathon-**2027** | ❌ 跳过，2026/03 已结束 |
| `event/49082` | 2026 兰州银行兰州马拉松 | lanzhou-marathon-2026 | ✅ 绑定 |

### Step 3：可选——抓取页面内字段

最酷详情页 markdown 里通常包含：
- 比赛日期（如 `2026.12.06`）
- 比赛地点（省市区+起点）
- 报名开始时间（如 `报名开始：05-08 14:00`）
- 报名状态（`即将报名` / `报名中` / `已截止`）
- 报名按钮 → 跳到 `reg.zuicool.com/{regId}` 

正则提取示例（用在 `aiExtractor.ts` 风格的规则里）：

```ts
const rules = {
  raceDate:        /(\d{4})\.(\d{2})\.(\d{2})/,
  registrationStart: /报名开始[:：]\s*(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/,
  registrationStatus: /(即将报名|报名中|已截止|报名已结束)/,
  regUrl:          /https?:\/\/reg\.zuicool\.com\/(\d+)/,
  location:        /·\s*\n?(.+?省\s+.+?市)/,
};
```

### Step 4：写入数据库

```sql
-- 4a. 启用 sources 表里 Zuicool 那条（已有）
UPDATE sources SET is_active = true
WHERE name = '最酷体育（Zuicool）';

-- 4b. 绑定到 marathon_sources（is_primary=false，不抢官网）
WITH zuicool AS (SELECT id FROM sources WHERE name = '最酷体育（Zuicool）')
INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
SELECT m.id, z.id, 'https://zuicool.com/event/64264', false
FROM marathons m, zuicool z
WHERE m.canonical_name = 'shanghai-marathon-2026'
ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url = EXCLUDED.source_url;

-- 4c. 把 registration_url 指向最酷一键报名页
UPDATE marathon_editions
SET registration_url = 'https://zuicool.com/event/64264', updated_at = NOW()
WHERE marathon_id = (SELECT id FROM marathons WHERE canonical_name = 'shanghai-marathon-2026')
  AND year = 2026;
```

---

## 4. 已经绑定的 ID 备忘（2026-05-02）

| 赛事 canonical_name | zuicool eventId | 备注 |
|---|---|---|
| `shanghai-marathon-2026` | 64264 | 报名中 4/29-5/29 |
| `hangzhou-marathon-2026` | 88174 | 11-01 开赛 |
| `guangzhou-marathon-2026` | 16059 | 12 月 |
| `shenzhen-marathon-2026` | 79945 | 12-06 开赛 |
| `taiyuan-marathon-2026` | 21936 | 09-27 开赛 |
| `lanzhou-marathon-2026` | 49082 | 已截止 |

**未绑（待补）**：北京、厦门 2027、武汉 2027、重庆 2027、无锡 2027、青岛 2027、苏州 2027、宁波 2027、大连 2027、南京 2026、西安 2026、衡水湖、东营黄河口。这些大多在最酷上还没开新届页面，**等到官方报名启动前 1-2 个月再搜一次**。

---

## 5. 同类平台对比 & 备选方案

| 平台 | 状态 | 推荐策略 |
|---|---|---|
| **马拉马拉 mararun.com** | 主站封闭，但每个赛事有 **专属子域名** `{city}-marathon.mararun.com` 或 `{city}-registration.mararun.com` | 只绑子域名，不要爬主站 |
| **数字心动 shuzixindong.com** | SPA，需要逆向 `race.shuzixindong.com/api/...` | 暂时只用其子域名（如宁马用 `ningbomarathon.shuzixindong.com`），不爬 |
| **爱燃烧 iranshao.com** | 公开 HTML，URL: `iranshao.com/races/{raceId}` | sources 表已有该源，可作为最酷的对比/兜底 |
| **runchina.org.cn**（田协官方） | HTML 公开，但站点老旧、字段稀疏 | 仅用于校对赛事是否"田协认证" |

子域名规律例（已验证）：
- 深圳：`shenzhen-registration.mararun.com`
- 成都：`chengdu-marathon.mararun.com`
- 北京：`bj-marathon.mararun.com`（待验证）
- 广州：`gz-marathon.mararun.com`（待验证）
- 武汉：`wuhan-marathon.mararun.com`（待验证）

---

## 6. 给 syncScheduler 的接入建议

最酷源 (`name='最酷体育（Zuicool）'`, `strategy=HTML`) 已经是 `is_active=true`。下次跑 `runScheduledSync()` 时它会被列进调度。当前 `sources.config` 字段为空，**建议补一条提取规则**（类似 `2a21f264-...-23bc02cb761f` 那条"赛事官方网站（直采）"的 config 模式）：

```json
{
  "extract": {
    "raceDate": {
      "selector": "body",
      "regex": "(\\d{4})\\.(\\d{2})\\.(\\d{2})",
      "group": 0,
      "attr": "text"
    },
    "registrationUrl": {
      "selector": "a[href*='reg.zuicool.com']",
      "attr": "href"
    },
    "registrationStatus": {
      "selector": "body",
      "regex": "(即将报名|报名中|已截止|报名已结束)",
      "group": 1,
      "attr": "text"
    }
  }
}
```

写入方式（注意 jsonb 转义）：

```sql
UPDATE sources
SET config = '{"extract": {...}}'::jsonb
WHERE name = '最酷体育（Zuicool）';
```

---

## 7. 注意事项 / 红线

1. **不要高频拉取**：每个 URL 间隔 ≥ 5 秒。`sources.min_interval_seconds` 已设 0，建议改成 5。
2. **图片 CDN 不要直链到我们站点**（盗链有 referer 检测会失效），如需图片自己上传到对象存储。
3. **"报名"按钮的 href 才是真报名页**。`/event/{id}` 上有"我的报名/微信客服"等噪音链接，提取时用 `a[href*='reg.zuicool.com']` 严格筛。
4. **届次切换窗口期**：每年 9 月-次年 1 月是最酷大批量上新届的时期，建议这段时间手动 re-search 一次更新所有 eventId。
5. **支付/订单接口不要碰**。本项目只做"信息聚合 + 跳转报名"，绝不代理下单。

---

## 8. 一键复用代码片段

**完整的"搜 → 验 → 绑"小流水线**，以后扩赛事时改 `wanted` 数组即可：

```js
// 1. 搜
const wanted = [
  ['xiamen-marathon-2027', '2027 厦门马拉松 site:zuicool.com'],
  // ...
];
const searches = await webSearch({ queries: wanted.map(x => x[1]) });

// 2. 提取候选 eventId
const candidates = wanted.map((row, i) => {
  const urls = (searches[i]?.resultPages || [])
    .map(p => p.url)
    .filter(u => /zuicool\.com\/event\/\d+/.test(u));
  return { canonical: row[0], url: urls[0] };
}).filter(c => c.url);

// 3. 验证届次
const verified = await Promise.all(candidates.map(async c => {
  const html = await webFetch({ url: c.url });
  const wanted_year = c.canonical.match(/\d{4}/)[0];
  const ok = new RegExp(`#\\s*\\[${wanted_year}`).test(html.markdown);
  return ok ? c : null;
})).then(arr => arr.filter(Boolean));

// 4. 入库（拼一个事务 SQL）
const sql = `BEGIN;\n` +
  verified.map(v => `
    WITH z AS (SELECT id FROM sources WHERE name='最酷体育（Zuicool）')
    INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
    SELECT m.id, z.id, '${v.url}', false FROM marathons m, z
    WHERE m.canonical_name='${v.canonical}'
    ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url = EXCLUDED.source_url;
    UPDATE marathon_editions SET registration_url='${v.url}', updated_at=NOW()
    WHERE marathon_id=(SELECT id FROM marathons WHERE canonical_name='${v.canonical}')
      AND year=${v.canonical.match(/\d{4}/)[0]};
  `).join('\n') + '\nCOMMIT;';
await executeSql({ sqlQuery: sql });
```

---

**结语**：最酷是国内最 friendly 的公开马拉松数据源，比官网稳定得多（很多官网在国外打不开），值得长期作为主聚合源。配合 mararun 子域名做兜底基本能覆盖 80% 的国内大型马拉松报名链接。
