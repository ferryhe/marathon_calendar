# 研究报告：跑IN中国（runninginchina.org）爬取与绑定方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **配套文档**：`研究报告-最酷zuicool爬取方案.md` · `研究报告-马拉马拉mararun爬取方案.md` · `研究报告-百马汇marathonbm爬取方案.md` · `研究报告-chinarun玩比赛爬取方案.md` · `研究报告-NowRun-nowrun爬取方案.md`

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 中文名 | 跑IN中国 / RunningInChina |
| 主域名 | `https://www.runninginchina.org` |
| 图床 | `http://img.runninginchina.org/` |
| 公司主体 | 北京拓乐互动科技（早期） |
| 备案 | 2014 年前后即上线，**国内最早的赛事综合查询站之一** |
| 技术栈 | **PHP + Yii Framework**（HTML 内有 `csrf-token` meta、`/assets/{hash}/...` 资源），传统 SSR |
| 反爬程度 | **极低**：纯 HTML，无登录墙；**自带 RESTful 风格的 URL 参数**（`?type_id=` `&page=` `&province=` `&run_state=`），分页可控 |
| 覆盖 | 自称「230+ 全国赛事」，含**马拉松、铁人三项、越野跑、10K/5K、趣味活动**5 大类，**港/澳/台**作为独立省份 |
| 法律 / Robots | 公开免登录浏览。**仅做查询、不爆量、不绕付费** |

---

## 2. URL 模式（**最重要**）

```
赛事列表（含全部筛选）        https://www.runninginchina.org/event.html
赛事列表（指定类型）          https://www.runninginchina.org/event/index.html?type_id={1-6}
赛事列表（指定类型+月+省+状态） https://www.runninginchina.org/event/index.html?type_id=1&page=1&month=10&province=215&run_state=2
赛事详情                     https://www.runninginchina.org/event/event_view/{id}.html
赛事跳转报名                 https://www.runninginchina.org/enroll/jump/{id}.html?apply=0
赛事照片                     https://www.runninginchina.org/event/photo/{id}.html
赛事相册                     https://www.runninginchina.org/event/album/{id}.html
成绩查询                     https://www.runninginchina.org/event/result/{id}.html
证书下载                     https://www.runninginchina.org/event/certificate/{id}.html
发布赛事                     https://www.runninginchina.org/event/publish.html
```

**关键观察**：

- **本平台是少数支持 query string 真分页**的爬取目标。`?page=2` `?page=3` 切换实际起作用，每页约 24 events。
- `type_id` 取值（来自 HTML 内置筛选条）：
  - `1` = 马拉松（**我们目标**）
  - `2` = 铁人三项
  - `3` = 越野跑
  - `4` = 10KM && 5KM
  - `6` = 趣味活动
- `province` 取值（部分）：`215=北京 216=天津 217=河北 218=山西 219=内蒙古 220=辽宁 221=吉林 222=黑龙江 223=上海 224=江苏 225=浙江 226=安徽 227=福建 228=江西 229=山东 230=河南 231=湖北 232=湖南 233=广东 234=广西 235=海南 236=重庆 237=四川 238=贵州 239=云南 240=西藏 241=陕西 242=甘肃 243=青海 244=宁夏 245=新疆 246=香港 247=澳门 248=台湾`
- `country=3456` = 境外赛事
- `run_state` 取值：`1=报名还未开始 2=报名正在进行 3=报名已经截止 4=报名时间未定 5=敬请期待下届`

### 🎯 这套 URL 设计是**所有平台里最优的**
chinarun 用静态化 `/html/event_k_..._.html`（中文 URL 编码、参数位置固定），mararun 用子域名硬编码，marathonbm 是 SPA 内部状态——**只有 runninginchina 让你写一行 query string 就能精确按"类型 + 月份 + 省份 + 状态"筛选**。

---

## 3. 反爬 / SSR 行为

### 3.1 列表页结构（**结构最完整**）

`?type_id=1&page=1` 一次返回 ≈ 13KB markdown，含 24 个 events。每条卡片格式（**4 行固定模板**）：

```
[![](http://img.runninginchina.org/2026/.../xxx.jpeg)](https://www.runninginchina.org/event/event_view/{id}.html)
[赛事名](https://www.runninginchina.org/event/event_view/{id}.html)

地点：大陆 上海市 市辖区 徐汇区

比赛时间：2026.12.06 **报名正在进行**

* * *

报名中：25天21小时54分01秒
```

**4 字段一次抓全**：
- 名称（标题）
- 地点（粒度：大陆/海外 + 省 + 市 + 区）
- 比赛日期（`YYYY.MM.DD` 格式）
- 报名状态（`报名正在进行` / `报名已经截止` / `敬请期待下届` / 等）
- 倒计时（仅"报名正在进行"才有）

### 3.2 详情页结构（**13KB 重磅信息**）

`/event/event_view/{id}.html` 一次返回 ≈ 13KB markdown，含 11 个章节：

```
# 上海马拉松
地点：大陆 上海市 市辖区 徐汇区
官方网址：http://www.shmarathon.com           ← 极重要，可拿官方主域

### 下届比赛
比赛时间：2026.12.06
报名时间：2026.04.29 - 2026.05.29

### 往届比赛  (含照片/相册/成绩/证书查询入口)

01 主办单位: ...
02 承办/运营单位: ...
03 协办单位: ...
04 技术认证: 中国田径协会
05 竞赛时间: 竞速轮椅马拉松：2026年12月6日（星期日）6:45 / 马拉松：2026年12月6日（星期日）7:00
06 竞赛项目: 竞速轮椅马拉松 20人 / 马拉松 30000人
07 比赛路线: ...
08 报名时间: ...大段抽签流程详解...
```

详情页是**所有平台中最像「竞赛规程原文」**的，特别适合用来交叉验证 zuicool/chinarun 的简洁信息。

### 3.3 字段提取要点

```js
// 列表页一次抓 4 字段
const re = /\[([^\]\n]{2,40}?)\]\(https:\/\/www\.runninginchina\.org\/event\/event_view\/(\d+)\.html\)\s*\n\s*地点：([^\n]*)\n\s*比赛时间：(\d{4}\.\d{2}\.\d{2})\s*\*\*([^*]+)\*\*/g;
// m[1]=name, m[2]=id, m[3]=location, m[4]=date(YYYY.MM.DD), m[5]=status
```

```js
// 详情页拿官方网址（极有价值）
const officialUrl = (md.match(/官方网址：\s*\[?(https?:\/\/[^\s\)]+)/) || [])[1];
```

---

## 4. 标准发现流程（5 步）

### Step 1：分省抓全国马拉松

```js
const provinces = [215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248];
const all = [];
for (const pid of provinces) {
  for (let page = 1; page <= 5; page++) {
    const r = await webFetch({ url: `https://www.runninginchina.org/event/index.html?type_id=1&page=${page}&province=${pid}` });
    const md = r.markdown || '';
    const re = /\[([^\]\n]{2,40}?)\]\(https:\/\/www\.runninginchina\.org\/event\/event_view\/(\d+)\.html\)\s*\n\s*地点：([^\n]*)\n\s*比赛时间：(\d{4}\.\d{2}\.\d{2})\s*\*\*([^*]+)\*\*/g;
    const events = [...md.matchAll(re)].map(m => ({
      id: m[2], name: m[1].trim(), location: m[3].trim(),
      date: m[4].replace(/\./g,'-'), status: m[5].trim(),
      province_id: pid,
    }));
    if (!events.length) break;
    all.push(...events);
    await new Promise(r => setTimeout(r, 1500));
  }
}
```

> ⚠️ **34 省 × 5 页 ≈ 170 次 fetch**。建议：先只跑 page=1（拿 24 件×34 = 816 候选已经够用），page=2+ 按需。

### Step 2：去重 + 过滤

```js
const seen = new Set();
const dedup = all.filter(e => seen.has(e.id) ? false : (seen.add(e.id), true));

// 只要"报名正在进行" + "敬请期待下届" 两种状态（活跃赛事）
const active = dedup.filter(e => /(报名正在进行|敬请期待下届|报名时间未定|报名还未开始)/.test(e.status));

// 只要 2026/2027
const future = active.filter(e => /^202[6-9]/.test(e.date));
```

### Step 3：与 DB diff

```js
const dbRows = await executeSql({ sqlQuery: `SELECT canonical_name, city FROM marathons` });
const haveCities = new Set(/* 解析 dbRows.output 得到的城市集合 */);
const newCandidates = future.filter(e => {
  const cityMatch = e.location.match(/(?:大陆\s+\S+\s+|^)(.+?[市州])/);
  const city = cityMatch ? cityMatch[1] : '';
  return city && !haveCities.has(city);
});
```

### Step 4：抓详情拿官方网址（**金矿**）

```js
const withOfficial = await Promise.all(newCandidates.slice(0, 10).map(async e => {
  const r = await webFetch({ url: `https://www.runninginchina.org/event/event_view/${e.id}.html` });
  const md = r.markdown || '';
  const officialUrl = (md.match(/官方网址：\s*\[?(https?:\/\/[^\s\)]+)/) || [])[1];
  return { ...e, officialUrl };
}));
```

### Step 5：用 zuicool / chinarun 交叉验证后入库

参见 `研究报告-最酷zuicool爬取方案.md` 第 3 节 Step 2 的 H1 校验流程。

---

## 5. 陷阱实例（**务必避开**）

| 陷阱 | 现象 | 规避 |
|---|---|---|
| 同一赛事跨届无关 ID | 上海马拉松 ID=6 永远不变（即使从 2014 持续到 2026） | 每个 ID 是**赛事系列**，不是**届次**。看 "下届比赛" 字段才是 2026 届的具体日期 |
| 历史届次还在列表 | 2026.04 月很多赛事状态是 "报名已经截止"——它是真截止还是已结束？ | 配合 "比赛时间" 判断：日期 < today → 已结束（应 status=已完赛）；日期 > today → 真截止 |
| `country=3456` 境外只列出几个名牌 | 这个站对海外覆盖弱，主要是港澳台 | 海外别用 runninginchina，用 chinarun |
| 地点字段里夹"市辖区" | "大陆 上海市 市辖区 徐汇区" 字面有"市辖区"这种行政废话 | 解析时用 `replace(/\s*市辖区\s*/g, ' ')` 清理 |
| `enroll/jump/{id}.html` 跳到外站 | 跳转目标可能是失效的官网/旧报名通道 | **不要把 enroll/jump 链接入库**，只用 `event_view/{id}.html` 详情页 URL |
| 主办单位是政府机构全名 | "上海市体育总会、黄浦区人民政府、静安区人民政府..." | 全文很长，不入库 marathons 表，只做参考 |

---

## 6. 入库到 `marathon_sources` 的规范

```sql
INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, ...)
VALUES (
  'runninginchina-001-cn-events',
  '跑IN中国（RunningInChina）',
  'platform',
  'HTML',
  'https://www.runninginchina.org',
  85,                                          -- 略低于 zuicool=90，是辅助验证源
  TRUE,
  3, 30, 15000, 0, ...
);
```

**绑定规则**：
- ✅ **永远 `is_primary=false`**：站本身偏老，部分赛事详情没及时更新
- ✅ `source_url` 填 `/event/event_view/{id}.html`（详情页最稳）
- 🌟 **`官方网址` 字段单独价值**：可用来填 `marathons.website_url` 字段（很多赛事我们之前没找到官网）
- 🌟 详情页里的 **04 技术认证 = 中国田径协会** 可作为「田协 A1/A2 类」候选打标签

---

## 7. 注意事项 / 红线

1. **绝不超过 1 req/s**：站点偏老，承载力有限，被风控可能直接对 IP 段封禁。
2. **不抓 `/event/result/{id}` 成绩页**：成绩涉及个人隐私（身份证 ID 哈希等），完全不在我们业务范围。
3. **不抓 `/event/photo/{id}` 照片页**：照片有肖像权问题。
4. **图片 CDN 不要直链**：`http://img.runninginchina.org/` 是 HTTP（无 HTTPS），现代浏览器会 mixed content 警告。
5. **保持优雅署名**：如果将来 runninginchina 团队联系（这是非商业老站），优先沟通而非对抗。

---

## 8. 一键复用代码片段

```js
// 简化版：只抓 type_id=1 (马拉松) 的 page 1，覆盖大半场景
const r = await webFetch({ url: 'https://www.runninginchina.org/event/index.html?type_id=1&page=1' });
const md = r.markdown || '';
const re = /\[([^\]\n]{2,40}?)\]\(https:\/\/www\.runninginchina\.org\/event\/event_view\/(\d+)\.html\)\s*\n\s*地点：([^\n]*)\n\s*比赛时间：(\d{4}\.\d{2}\.\d{2})\s*\*\*([^*]+)\*\*/g;
const events = [...md.matchAll(re)].map(m => ({
  id: m[2], name: m[1].trim(),
  location: m[3].trim().replace(/\s*市辖区\s*/g, ' '),
  date: m[4].replace(/\./g,'-'), status: m[5].trim(),
}));

// 抓详情拿官方网址
async function withOfficialUrl(e) {
  const d = await webFetch({ url: `https://www.runninginchina.org/event/event_view/${e.id}.html` });
  const md = d.markdown || '';
  const u = (md.match(/官方网址：\s*\[?(https?:\/\/[^\s\)]+)/) || [])[1];
  return { ...e, officialUrl: u };
}

const enriched = await Promise.all(events.slice(0, 10).map(withOfficialUrl));
console.log(enriched);
```

---

## 9. 实战回顾（2026-05-02）

- **首抓**：`?type_id=1&page=1` → 24 events，覆盖 2026 全年大型马拉松（厦门/上海/北京/西安/杭州/兰州/呼和浩特/长春/吉林市/...）
- **第二页**：`page=2` → 又 24 events，主要是 04-05 月赛事（汶川/大连/蚌埠/保定/...）
- **样本详情页**：`/event/event_view/6.html` (上海马拉松) 13KB，含 11 个结构化章节，**官方网址 `http://www.shmarathon.com` 直接可拿**
- **省份枚举**：理论上 34 省 × 平均 1-3 页，全国马拉松约能抓出 200-400 unique。我们 DB 现有 47 China marathons，**潜在 diff 空间 ≈ 150-300**——和 nowrun 高度重叠
- **本次未做大批量入库**：策略上以 zuicool/chinarun/marathonbm 为主，runninginchina 主要价值是**补全 `marathons.website_url` 字段** —— 这是另两个平台都没有的独家字段

---

**结语**：跑IN中国是国内**最 RESTful 友好**的赛事平台（query string 分页 + 类型/省份/状态四维筛选 + 详情页固定 11 段结构）。最大独家价值是**详情页里的 "官方网址"** —— 这是其他三方平台都不暴露的字段。建议作为"补全官方信息"的辅助源使用，不要靠它做发现（覆盖虽广但更新慢于 nowrun/zuicool）。配合 zuicool（主源）+ marathonbm（首屏候选）+ nowrun（对标参考）+ chinarun（海外）+ runninginchina（官网补全），五者形成完整数据矩阵。
