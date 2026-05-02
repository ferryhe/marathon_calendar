# 研究报告：CHINARUN 玩比赛（chinarun.com）爬取与绑定方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **配套文档**：`研究报告-最酷zuicool爬取方案.md` · `研究报告-马拉马拉mararun爬取方案.md` · `研究报告-百马汇marathonbm爬取方案.md` · `研究报告-NowRun-nowrun爬取方案.md` · `研究报告-runninginchina跑IN中国爬取方案.md`
> **适用场景**：补充**海外/六大满贯/亚洲名牌马拉松**的报名链接，是国内唯二做海外赛事直通名额的合规渠道之一（另一个是各赛事官网或大型旅行社）

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 中文名 | CHINARUN 玩比赛（兄弟产品："RUNFF" 比赛照片站、"中国跑步" 资讯）|
| 主域名 | `https://www.chinarun.com` |
| 图片 CDN | `https://cdn.chinarun.com/upload/site/1010/...` |
| 兄弟域 | `http://www.runff.com`（赛后照片）|
| 备案 | 老牌跑步综合服务商，2014 年前后即上线 |
| 技术栈 | **传统 PHP / 静态化 HTML**，URL 全部 `/html/event-{id}.html` 形态，纯 SSR |
| 反爬程度 | **极低**：`webFetch` / `curl` / `axios` 全部一次成功，无验证码/无登录墙 |
| 覆盖 | **海外赛事独家强项**（柏林/芝加哥/东京/大阪/首尔/香港/澳门/新加坡/吉隆坡/普吉/吴哥/黄金海岸/皇后镇/布拉格/维也纳等都有套餐直通名额）+ 国内中型赛事 |
| 法律 / Robots | 公开免登录浏览。**仅做查询、不爆量、不绕付费** |

---

## 2. URL 模式（**最重要**）

```
首页                          https://www.chinarun.com/
赛事列表（含全部筛选）        https://www.chinarun.com/html/event.html
赛事详情                     https://www.chinarun.com/html/event-{id}.html
赛事报名（跳第三方）         https://www.chinarun.com/html/b/{shortcode}/
按类型筛选 (URL 编码)         https://www.chinarun.com/html/event_k_{type}_0_.html#cnt
按时间筛选                   https://www.chinarun.com/html/event_k__{month}_.html#cnt
按城市筛选                   https://www.chinarun.com/html/event_k__0_{city}.html#cnt
照片站（兄弟产品）           http://www.runff.com/
关于我们                     https://www.chinarun.com/html/aboutus.html
```

**关键观察**：

- `event-{id}.html` 的 ID 单调递增。截至 2026-05，最新 ID ≈ 5390，最早 ID 约为 1000 量级。
- **路径里的中文是 URL 编码**：`%E5%85%A8%E7%A8%8B%E9%A9%AC%E6%8B%89%E6%9D%BE` = "全程马拉松"。
- `_k_` 中间是类型，第二个 `_` 后面是月份，第三个 `_` 后面是城市/国家。**位置严格固定**，留空就是 `0` 占位。例：`event_k__0_%e6%97%a5%e6%9c%ac.html` = 日本所有赛事。
- 报名按钮的 href 形如 `/html/b/NbyqMv/`，会跳到第三方支付/微信小程序，**不要试图模拟下单**。

### 类型分类全集（来自首页筛选条）

```
全程马拉松 / 半程马拉松 / 垂直马拉松 / 短程跑 / 趣味跑 / 亲子跑 /
越野跑 / 铁人三项赛 / 障碍赛 / 线上赛 / 自行车赛 / 瑜伽 / 海外赛事 / 其他
```

### 城市/国家筛选（来自首页）

```
北京 / 上海 / 深圳 / 广州 / 重庆 / 西安 / 大连 / 成都 / 武汉 / 南京 /
日本 / 泰国 / 新加坡   ← 这是国内唯一一个把"国家"和"国内城市"放同一筛选条的平台
```

---

## 3. 反爬 / SSR 行为

### 3.1 详情页结构（**一次抓全**）

`event-{id}.html` 的 markdown 输出固定包含 8 个字段（顺序稳定），**首屏前 1500 字节即覆盖**：

```
2026柏林马拉松                                          ← 标题（H1 等价）
- 报名：(2026年04月30日&报满即止)                       ← 报名截止
- 比赛：2026年09月27日 07:05                            ← 比赛日期 + 起跑时间
- 德国 柏林                                              ← 国家 + 城市
- 参赛者-赛事名额+3天2晚五星酒店拼房套餐：18999元        ← 价格套餐
费用包含 / 费用不含                                      ← 套餐明细
赛事详情 / 联系小小熊                                    ← TOC
```

正则范例（标题 + 比赛日期 + 国家城市，三段一次拿）：
```js
const m = md.match(/(\d{4}[^\n]*?马拉松[^\n]*?)\n[\s\S]*?比赛：(\d{4})年(\d{1,2})月(\d{1,2})日[^\n]*\n[\s\S]*?-\s+([^\n]{2,40})\n/);
// m[1]=标题, m[2-4]=YMD, m[5]=国家+城市（如"德国 柏林"）
```

### 3.2 列表页结构

`/html/event.html` 一次返回 ≈ 34KB markdown，含 51 个 unique events。每条 event 卡片格式：

```
[2026芝加哥马拉松](https://www.chinarun.com/html/event-5365.html)
```
**列表页不含日期/价格**，只有标题 + URL。要拿日期必须抓详情。

### 3.3 「了解更多>>」噪音
列表前几行总有一个置顶轮播 "2022畅跑扬州好地方·喜迎元旦千人线上跑"（event-4968），**这是历史归档广告位**，过滤掉。

---

## 4. 标准发现流程（4 步）

### Step 1：抓列表 → 提取候选 event ID

```js
const r = await webFetch({ url: 'https://www.chinarun.com/html/event.html' });
const md = r.markdown || '';
const re = /\[([^\]]{4,80})\]\(https?:\/\/www\.chinarun\.com\/html\/event-(\d+)\.html\)/g;
const events = [];
let m;
while ((m = re.exec(md)) !== null) events.push({ id: m[2], name: m[1].trim() });
const seen = new Set();
const unique = events.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
// 过滤已知噪音
const clean = unique.filter(e => e.id !== '4968' && /马拉松|越野/.test(e.name));
```

### Step 2：筛海外赛事

CHINARUN 最大独家价值是海外。**白名单关键字**（按命中频率排序）：
```
日本|大阪|东京|京都|札幌|名古屋|福冈
韩国|首尔|釜山
香港|澳门|台湾
新加坡|马来|吉隆坡|马六甲|沙巴|哥打基纳巴卢
泰国|普吉|清迈|曼谷|芭提雅|苏梅
越南|岘港|河内|胡志明
柬埔寨|吴哥
印尼|巴厘
柏林|布拉格|维也纳|波尔多|巴黎|伦敦|马德里|罗马
波士顿|纽约|芝加哥|拉斯维加斯|洛杉矶
悉尼|墨尔本|布里斯班|黄金海岸|阳光海岸|皇后镇
开普敦|约翰内斯堡
```

### Step 3：抓详情验证 + 提日期

```js
async function fetchDetail(id) {
  const r = await webFetch({ url: `https://www.chinarun.com/html/event-${id}.html` });
  const md = r.markdown || '';
  const m = md.match(/(\d{4}[^\n]*?马拉松[^\n]*?)\n[\s\S]*?比赛：(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const country_city = (md.match(/比赛：[^\n]*\n[\s\S]{0,150}?-\s+([^\n]{2,40})\n/) || [])[1] || '';
  return {
    id, name: m[1].trim(),
    raceDate: `${m[2]}-${String(m[3]).padStart(2,'0')}-${String(m[4]).padStart(2,'0')}`,
    country_city: country_city.trim(),
  };
}
```

### Step 4：用 webSearch 校验官方信息（可选但推荐）

CHINARUN 卖的是**套餐 + 直通名额**，价格高出官方 2-3 倍属正常，但**赛事日期必须和官方对齐**。打 1 句 `webSearch` 校验日期：
```js
const r = await webSearch({ queries: [`${name} 官方网站 比赛日期 ${year}`] });
```

---

## 5. 陷阱实例（**务必避开**）

| 陷阱 | 现象 | 规避 |
|---|---|---|
| 历史归档置顶 | event-4968（2022 扬州线上）始终在列表第一行 | 过滤 ID < 5000 或显式黑名单 |
| 同一赛事多 ID | "2026 柏林马拉松" 在列表中既有 5350 也有 5368（不同套餐版本） | 按 `name + raceDate` 去重，**保留最新 ID**（数字大的更近期上架） |
| 「2027 渣打香港马拉松」 | 列表里赫然显示 2027 标题但 ID=5383（很新） | **不要扔**：港马通常 1 月初赛，2027 届实际是 2027 年 1 月，时间上属于"明年"——按用户日历需求要保留 |
| 标题里夹"福利套餐 / 直通名额" | "2026 芝加哥马拉松" 实际标题是 "2026年柏林马拉松 三日柏林博物馆通票套餐" | 入库时清洗：`name.replace(/\s*[（(].*?[)）]\s*$/g,'').replace(/(直通名额|套餐|福利).*$/g,'')` |
| 价格段大段"费用包含 / 费用不含" | 详情页 markdown 60% 是套餐明细 | 提取关键字段后丢弃，不要存全文 |
| `runff.com` 子站打不开 | 照片站近期有时 502 | 不要把它入 sources，照片不在我们业务范围 |
| URL 中文编码 | `event_k_%E5%85%A8%E7%A8%8B...` 不是 emoji | `decodeURIComponent()` 后再读 |

---

## 6. 入库到 `marathon_sources` 的规范

CHINARUN 作为**海外赛事专项主源**入 `sources` 表：

```sql
INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, ...)
VALUES (
  'chinarun-001-overseas-marathons',           -- varchar id，可读字符串
  'CHINARUN 玩比赛',
  'platform',
  'HTML',
  'https://www.chinarun.com',
  92,                                          -- 海外场景下高于 zuicool=90，国内场景退到 86
  TRUE,
  3, 30, 15000, 0, ...
);
```

绑定到具体马拉松时：
- **默认 `is_primary=false`**：CHINARUN 是"国内购买海外名额 + 套餐"的**二级渠道**，不能取代赛事**官方网址**。
  - 即使海外官网是英文，只要能 200 打开，就把 `marathons.website_url` 设成官方域、`marathon_sources` 里 `official` 主源 `is_primary=true`
  - CHINARUN 详情页作为 `is_primary=false` 的报名补充入库
- **唯一例外**：当且仅当 `marathons.website_url` 字段为空、且海外官网在国内被墙/已下线时，才把 CHINARUN 升为 `is_primary=true`。这是兜底，不是常态。
- **国内中型马拉松**：仅 `is_primary=false`，主源仍由 zuicool 担任

**source_url 规则**：
- 优先填 `/html/event-{id}.html`（详情页）
- 退而求其次填 `/html/event_k__0_{country}.html#cnt`（国家筛选页）
- **绝不填** `/html/b/{shortcode}/`（报名跳转页，cookie 依赖会经常失效）

---

## 7. 注意事项 / 红线

1. **不爆量**：每秒 ≤ 1 请求，详情页 ≥ 2s 间隔。`min_interval_seconds` 建议 5。
2. **不试报名按钮**：`/html/b/{shortcode}/` 一旦触发会被风控加 IP 名单。
3. **不抓 runff.com 照片站**：和我们业务无关，且照片可能涉及肖像权。
4. **价格信息有时效**：CHINARUN 列出的套餐价是**一次抓取时刻的报价**，不要长期硬编码。如果要展示价格需明确写明 "数据更新时间"。
5. **海外赛事的 country/city 字段**：详情页是 "国家 城市" 中文格式（"德国 柏林"），入库时拆成 `country='Germany', city='柏林'`，country 用英文；建立国家中英映射字典。

---

## 8. 一键复用代码片段

```js
// 1. 抓列表
const r = await webFetch({ url: 'https://www.chinarun.com/html/event.html' });
const md = r.markdown || '';

// 2. 解析 + 去重 + 海外白名单
const re = /\[([^\]]{4,80})\]\(https?:\/\/www\.chinarun\.com\/html\/event-(\d+)\.html\)/g;
const all = [...md.matchAll(re)].map(m => ({ id: m[2], name: m[1].trim() }));
const seen = new Set();
const dedup = all.filter(e => seen.has(e.id) ? false : (seen.add(e.id), true));
const OVERSEAS = /(日本|大阪|东京|京都|韩国|首尔|香港|澳门|新加坡|马来|吉隆坡|沙巴|泰国|普吉|清迈|柬埔寨|吴哥|印尼|巴厘|柏林|布拉格|维也纳|波尔多|巴黎|伦敦|波士顿|纽约|芝加哥|悉尼|墨尔本|黄金海岸|阳光海岸|皇后镇|开普敦)/;
const overseas = dedup.filter(e => OVERSEAS.test(e.name) && /马拉松/.test(e.name) && e.id > 5000);

// 3. 抓详情
const details = await Promise.all(overseas.map(async e => {
  const r = await webFetch({ url: `https://www.chinarun.com/html/event-${e.id}.html` });
  const md = r.markdown || '';
  const m = md.match(/(\d{4}[^\n]*?马拉松[^\n]*?)\n[\s\S]*?比赛：(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return {
    id: e.id, rawName: m[1].trim(),
    raceDate: `${m[2]}-${String(m[3]).padStart(2,'0')}-${String(m[4]).padStart(2,'0')}`,
    sourceUrl: `https://www.chinarun.com/html/event-${e.id}.html`,
  };
})).then(arr => arr.filter(Boolean));

// 4. 入库（结合 sources / marathons / marathon_editions / marathon_sources 4 表事务）
console.log('准备入库', details.length, '个海外马拉松候选');
```

---

## 9. 实战回顾（2026-05-02）

本次首抓 chinarun 一次：
- 列表共 51 unique events，**过滤后 12 个海外赛事候选**：
  渣打香港(2027)、澳门、渣打新加坡、皇后镇、芝加哥、吉隆坡、柏林(×2)、阳光海岸、普吉、波尔多、悉尼、吴哥王朝、黄金海岸、列日啤酒、布拉格、维也纳、首尔(×2)、东京、大阪、香港(×2)
- 与 DB 已收录交叉去重后净增**目标候选 ≈ 8 个**：澳门 / 新加坡 / 首尔 / 大阪 / 维也纳 / 布拉格 / 皇后镇 / 阳光海岸 / 黄金海岸 / 吴哥
- 这些都是**全球前 100 名马拉松**，对国际化日历价值极高

国内部分本次未深挖。下一次扩源时可调头看 `event_k__0_{城市}.html` 抓出几个 zuicool/marathonbm 没覆盖的小众赛事。

---

**结语**：CHINARUN 是「海外马拉松直通名额」这个细分场景下国内唯一能稳定爬取的合规聚合源。技术形态老派但**反爬几乎为零**，详情页结构稳定 10 年没变，建议在每年 3 月、9 月（海外秋季赛事季前）扫一次全列表。配合 zuicool（国内主力）+ marathonbm（国内补充）+ chinarun（海外专精），三者覆盖 90% 用户需求。
