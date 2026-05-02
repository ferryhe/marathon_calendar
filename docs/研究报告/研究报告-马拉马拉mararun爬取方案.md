# 研究报告：马拉马拉（mararun.com）爬取与绑定方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **配套文档**：`研究报告-最酷zuicool爬取方案.md`、`研究报告-iranshao与shuzixindong状态评估.md`、`研究报告-runchina田协赛历方案.md`

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 公司主体 | 聪投（北京）信息技术有限公司 |
| 主域名 | `https://www.mararun.com`（导流页） |
| 报名/赛事专属子域 | `{city}-registration.mararun.com` 或 `{city}-marathon.mararun.com` |
| 本质 | **北马、广马、武马、深马、成马等顶级赛事的官方唯一指定移动端报名通道** |
| 反爬程度 | 主站基本无可用数据；子域名是 SPA + 登录墙才能下单，但赛事元信息（名称/日期/状态）直接渲染 |

---

## 2. 子域名规律（**最重要**）

```
{city}-registration.mararun.com    ← 默认全国统一规则（北马/广马/武马/深马/南马都用这个）
{city}-marathon.mararun.com        ← 部分赛事变体（成马用此）
{name}-mararun.mararun.com         ← 赛事品牌型变体（汉马备用 hm-mararun）
{slug}.mararun.com                 ← 个性化子域（光谷 guanggumarathon、太湖 taihu、橘子洲 redmarathon）
```

**已验证存活的子域名（2026-05）**：

| 赛事 | 子域名 |
|---|---|
| 北京 | `beijing-registration.mararun.com` |
| 上海 | （无独立子域，上马走自有平台 shang-ma.com） |
| 广州 | `guangzhou-registration.mararun.com` |
| 深圳 | `shenzhen-registration.mararun.com` |
| 成都 | `chengdu-marathon.mararun.com` ✅ + `chengdu-registration.mararun.com`（备用） |
| 武汉 | `wuhan-registration.mararun.com`（汉马备用 `hm-mararun.mararun.com`） |
| 南京 | `nanjing-registration.mararun.com` |
| 厦门 | （无 —— 厦马走自有 xmim.org） |
| 杭州 | （无 —— 杭马走自有 hzim.org） |
| 兰州 | （无） |
| 太原 | （无） |
| 重庆 | （无） |

> **规律**：自带成熟自有平台的赛事不上 mararun（上马、厦马、杭马、兰马、太马等）；其余顶级田协 A1 类赛事基本都上 mararun。

**过期/历史子域名**（已找到，但已停用或迁移）：
- `gzkids-registration.mararun.com` — 广马亲子专场
- `redmarathon.mararun.com` — 橘子洲红色马拉松
- `taihu.mararun.com` — 太湖图影马拉松
- `guanggumarathon.mararun.com` — 光谷马拉松

---

## 3. 标准发现流程（4 步）

### Step 1：用搜索引擎找候选子域名

```js
const r = await webSearch({
  queries: [
    '北京马拉松 site:mararun.com',
    '广州马拉松 site:mararun.com',
    // ...
  ]
});
```

**第一条结果通常就是 `{city}-registration.mararun.com/`**，直接采用即可。

### Step 2：用 `curl` HTTP HEAD 判活

mararun 子域名是 DNS 级别独立解析的，不存在的子域会直接 DNS 失败：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://wuhan-registration.mararun.com/
# 200 = 存活；000 = DNS fail
```

### Step 3：用 `webFetch` 验证当届

mararun 子域名上 **会列出该赛事所有历史届次**，包括"比赛结束"的旧届。要看是否有当届：

```js
const r = await webFetch({ url: 'https://beijing-registration.mararun.com/' });
// markdown 里搜形如 "2026中国银行北京马拉松\n比赛时间: 2026年11月1日"
const hasCurrentYear = /2026.+?马拉松\s*\n.*?2026年/s.test(r.markdown);
```

如果当届还没列出（赛事尚未启动报名），子域名仍然存在，**先绑定，等启动后内容自动出现**。

### Step 4：写入数据库

```sql
WITH mararun AS (SELECT id FROM sources WHERE name = '马拉马拉（Mararun）')
INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
SELECT m.id, mr.id, 'https://beijing-registration.mararun.com/', false
FROM marathons m, mararun mr
WHERE m.canonical_name = 'beijing-marathon-2026'
ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url = EXCLUDED.source_url;

UPDATE marathon_editions
SET registration_url = 'https://beijing-registration.mararun.com/', updated_at = NOW()
WHERE marathon_id = (SELECT id FROM marathons WHERE canonical_name='beijing-marathon-2026')
  AND year = 2026;
```

---

## 4. 已绑定一览（2026-05-02）

| 赛事 | mararun 子域名 |
|---|---|
| `beijing-marathon-2026` | `beijing-registration.mararun.com` |
| `guangzhou-marathon-2026` | `guangzhou-registration.mararun.com` |
| `shenzhen-marathon-2026` | `shenzhen-registration.mararun.com` |
| `chengdu-marathon-2026` | `chengdu-marathon.mararun.com` |
| `wuhan-marathon-2027` | `wuhan-registration.mararun.com` |
| `nanjing-marathon-2026` | `nanjing-registration.mararun.com` |

---

## 5. 数据可提取性（坦诚评估）

mararun 子域名页面 **不做 server render 详细字段**——它是个 SPA 报名表单，赛事信息块本身简单：

```
2026XXX马拉松
比赛时间: 2026年11月1日
比赛地点: 城市
[ 立即报名 / 比赛结束 ]
```

可提取规则：

```ts
const rules = {
  raceName:   /^(20\d{2})(.+?马拉松).*$/m,
  raceDate:   /比赛时间[:：]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/,
  location:   /比赛地点[:：]\s*(.+?)(?=\n)/,
  status:     /(立即报名|即将开始|报名截止|比赛结束)/,
};
```

**它最大的价值不是数据抓取，而是给跑者一个直达报名入口的链接**。所以本项目的策略是：把它写进 `registration_url`，不刻意做字段抓取。

---

## 6. 注意事项 / 红线

1. **绝对不要尝试模拟下单流程**（POST /api/registration/submit 等）。哪怕调通了也会因为缺乏支付凭证而失败，且会被风控拉黑。
2. **不要爬主站 mararun.com**——它就是个 App 下载页，没有数据。
3. **不要爬 `https://mararun.com/argument`、`/cooperation`** 等运营页——纯静态。
4. **抓 SPA 子域名时如果 markdown 为空**，说明 webFetch 没等到 JS 渲染。改成抓 `https://api.mararun.com/...` 或者用 Playwright，但这超出本项目的轻量爬虫范畴。
5. **届次切换窗口**：每年 8-11 月各大赛事陆续启动报名，那段时间在 `webFetch` 子域名能看到当届新增。

---

## 7. 一键复用代码片段

```js
const wanted = [
  ['hangzhou-marathon-2026', 'hangzhou'],
  ['xian-marathon-2026',     'xian'],
  // ...
];

// 1. 探活（curl 替代 fetch，避免 SPA 误判 200 但内容空）
const probes = await Promise.all(wanted.map(async ([canon, city]) => {
  const url = `https://${city}-registration.mararun.com/`;
  const res = await fetch(url, { method: 'HEAD', redirect: 'manual' }).catch(() => null);
  return { canon, url, alive: res?.status === 200 };
}));

// 2. 入库
const live = probes.filter(p => p.alive);
const sql = `BEGIN;\n` + live.map(p => `
  WITH mr AS (SELECT id FROM sources WHERE name='马拉马拉（Mararun）')
  INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
  SELECT m.id, mr.id, '${p.url}', false FROM marathons m, mr
  WHERE m.canonical_name='${p.canon}'
  ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url=EXCLUDED.source_url;`).join('\n')
  + '\nCOMMIT;';
await executeSql({ sqlQuery: sql });
```

---

**结语**：mararun 是国内顶级赛事的"官方报名通道"，子域名极其稳定且 URL 一致。配合最酷做"信息+报名"双源覆盖，几乎能覆盖 80% 国内 A 类马拉松。
