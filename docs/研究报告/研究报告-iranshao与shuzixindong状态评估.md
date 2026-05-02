# 研究报告：爱燃烧 & 数字心动 & 悦跑圈 & 42travel — 状态评估与放弃理由

> **写作日期**：2026-05-02（首版）/ 2026-05-02 二次扩展（新增 悦跑圈 + 42travel）
> **目标读者**：未来接手本项目数据维护的 Agent
> **结论先行**：这四个平台**都不适合**作为爬取数据源。下面记录调研过程和决策依据，**避免后人重复踩坑**。

---

## 一、爱燃烧 iranshao.com

### 平台介绍（背景）

爱燃烧成立于 2014 年，是国内最早的跑步垂直社区，曾是绝大多数耐力跑爱好者使用的工具。鼎盛时期与 60% 以上国内跑步赛事有合作关系。

### 历史 URL 规律（已失效）

旧 SEO 索引仍能找到：

```
https://iranshao.com/races/{raceId}        ← 主赛事页
https://iranshao.com/races/{raceId}/results
https://iranshao.com/races/{raceId}/racers
https://iranshao.com/races/{raceId}/comments
https://iranshao.com/m/races?type=马拉松    ← 移动版列表
https://iranshao.com/reg/races/{slug}      ← 报名页
```

### 验证结果（2026-05-02 全部失败）

我用 webFetch 试了 10 个最热门马拉松的旧 race ID：

| 赛事 | URL | HTTP |
|---|---|---|
| 上海 | `iranshao.com/races/583` | **404** |
| 北京 | `iranshao.com/races/597` | **404** |
| 杭州 | `iranshao.com/races/859` | **404** |
| 广州 | `iranshao.com/races/564` | **404** |
| 深圳 | `iranshao.com/races/561` | **404** |
| 厦门 | `iranshao.com/races/820` | **404** |
| 武汉 | `iranshao.com/races/3227` | **404** |
| 成都 | `iranshao.com/races/1587` | **404** |
| 兰州 | `iranshao.com/races/684` | **404** |
| 重庆 | `iranshao.com/races/792` | **404** |

**全军覆没**。爱燃烧主站现在仅保留新闻文章（`iranshao.com/{articleId}.html`），赛事数据库已下线。SEO 索引尚未刷新所以 webSearch 仍返回旧 URL，但点开都是 404。

### 当前真实状态

`https://iranshao.com/` 首页只剩资讯流：
- 业界新闻
- 品牌专题（始祖鸟、Columbia 等）
- 赛事报道（事后报道，不含报名信息）

### 处置方案

- ✅ `sources` 表里保留 `爱燃烧（iranshao）` 一条，**`is_active = true`**
- ✅ `notes` 字段更新为："跑步社区与新闻；/races/{id} 旧 URL 已失效，仅用于文章资讯发现，不作为报名链接源"
- ❌ **不绑定到任何 `marathon_sources`**
- ⚠️ 未来若爱燃烧重启赛事数据库（小概率事件），需重新做一次 `site:iranshao.com/races` 搜索 + HTTP 验证

---

## 二、数字心动 shuzixindong.com

### 平台介绍（背景）

数字心动是 **中国田径协会官方指定 APP**，是全国田协认证赛事的官方计时与成绩查询平台。地位上比马拉马拉更"正统"。

### 域名结构

```
https://www.shuzixindong.com/         ← 公司介绍页（无数据）
https://race.shuzixindong.com/        ← 主赛事 SPA（需要登录）
https://race.shuzixindong.com/offline/ ← 线下赛 SPA
https://book.shuzixindong.com/        ← 付费咨询
https://mall.shuzixindong.com/        ← 商城
https://file.shuzixindong.com/...     ← 田协通知 PDF
https://img.shuzixindong.com/...      ← 静态图床
https://{city}marathon.shuzixindong.com/ ← 部分赛事独立子站（注意是连字！）
```

### 子域名探活结果（2026-05-02）

我猜测 `{city}marathon.shuzixindong.com` 模式后批量探了 8 个：

| URL | HTTP |
|---|---|
| `wuhanmarathon.shuzixindong.com` | DNS fail |
| `qingdaomarathon.shuzixindong.com` | DNS fail |
| `xianmarathon.shuzixindong.com` | DNS fail |
| `chongqingmarathon.shuzixindong.com` | DNS fail |
| `dalianmarathon.shuzixindong.com` | DNS fail |
| `suzhoumarathon.shuzixindong.com` | DNS fail |
| `wuximarathon.shuzixindong.com` | DNS fail |
| `hengshuihumarathon.shuzixindong.com` | DNS fail |
| `ningbomarathon.shuzixindong.com` | **200 ✅** |

**8/9 子域名不存在**。`{city}marathon.shuzixindong.com` 不是普遍规律，仅个别赛事（宁马）有独立子站。

### 主 SPA 不可爬

`race.shuzixindong.com` 是纯前端渲染：
- 所有赛事列表通过 ajax `GET /api/...` 拉取
- 接口需要 `Authorization` Bearer token（数字心动 APP 登录获得）
- 没有公开 OpenAPI 文档
- 抓包后构造请求超出本项目轻量爬虫范畴

### 处置方案

- ✅ `sources` 表新增 `数字心动（Shuzixindong）` 一条，**`is_active = true`**
- ✅ 仅绑定一条已验证子域：`ningbo-marathon-2027` → `ningbomarathon.shuzixindong.com`
- ⚠️ 未来若需扩展，必须 **逐个 city 做 DNS 探活**，不要批量假设

---

## 三、悦跑圈 thejoyrun.com

### 平台介绍（背景）

悦跑圈是**国内最大的跑步社交 APP**（用户量曾超 1 亿），主打 GPS 轨迹记录 + 跑团社交 + 线上马拉松首创者。曾与中国田协合作运营 "Run China" 系列赛事。

### 验证结果（2026-05-02）

| 入口 | 返回 | 内容 |
|---|---|---|
| `https://www.thejoyrun.com/` | 200 / 4.3KB | **APP 下载落地页**（讲产品愿景，无任何赛事数据）|
| `https://www.thejoyrun.com/race` | **403** | openresty/1.17.8.2 直接拒绝 |
| `https://www.thejoyrun.com/event` `/events` `/marathon` `/calendar` `/run` `/match` | 全部 200 / 2.7KB | **同一份占位 HTML**（路由没分流，所有路径返回首页变体）|
| `https://web.thejoyrun.com/` | 200 / 5.2KB | 主页占位变体 |
| `https://webevent.thejoyrun.com/runchina/signIn` | 200 / 5.6KB | 早期 RunChina 项目残留页，无数据 |
| `https://www.thejoyrun.com/news.php` | 200 / 9.3KB | **零星新闻文章**，含 1-2 条 2025 年活动 |
| `https://match.thejoyrun.com/` | 200 / 4.3KB | 重定向回主页占位 |

**结论**：悦跑圈**所有赛事数据都封闭在 APP 内**（用 https 拦截 + 私有协议，需要登录态 token）。Web 端仅留 APP 下载落地页和近乎不更新的新闻栏。**没有可爬的赛事数据**。

### 处置方案

- ❌ **不要把悦跑圈加入 sources 表**（除非未来他们重启 web 版赛事日历）
- 📌 仅作为「赛事数据可能的间接信息源」记录在文档：用户提到 "在悦跑圈上看到 XX 赛事" 时，需要去其他 5 个平台 (zuicool/mararun/marathonbm/chinarun/nowrun) 交叉验证

---

## 四、42travel.com

### 平台介绍（背景）

42travel 是早期国内跑步综合社区（"42 公里"得名于马拉松距离），曾与《跑者世界》中文版合作，覆盖国内+海外赛事。

### 验证结果（2026-05-02）

| 测试方式 | 返回 |
|---|---|
| `curl -A "Mozilla/5.0" https://www.42travel.com -m 12` | **exit 000**（连接失败/超时）|
| `curl https://42travel.com -m 12`（去 www）| **exit 000** |
| `webFetch https://www.42travel.com/`（Firecrawl）| **504 Gateway Timeout**（3 次重试全失败）|
| webSearch "42travel.com 2025 2026" | 仅找到同名旅行配件电商 `42-travel.com` 和旅游 B2B `travel-42.com`，**与跑步无关** |

**结论**：原跑步社区 42travel.com **已停运**。域名仍解析但服务器不响应。

### 处置方案

- ❌ **永久从候选源排除**
- ⚠️ 如果未来 webSearch 仍把 `42travel.com/race/...` 列在结果里，那是 2018-2020 年的 SEO 残留索引，**不要点开** —— 直接跳过

---

## 五、统一结论（2026-05-02 终版）

### 5.1 已验证可爬平台（5 个）

| 平台 | sources.is_active | priority | 角色 | 详细方案 |
|---|---|---|---|---|
| 最酷 zuicool | ✅ | 90 | 国内主聚合源 | `研究报告-最酷zuicool爬取方案.md` |
| 马拉马拉 mararun | ✅ | 88 | 顶级赛事专供 | `研究报告-马拉马拉mararun爬取方案.md` |
| 百马汇 marathonbm | ✅ | 89 | 候选池 + 月份分布 | `研究报告-百马汇marathonbm爬取方案.md` |
| CHINARUN 玩比赛 | ✅ | 92（海外） | **海外/六大满贯独家** | `研究报告-chinarun玩比赛爬取方案.md` |
| 跑IN中国 runninginchina | ✅ | 85 | **官方网址补全** + 全省份 | `研究报告-runninginchina跑IN中国爬取方案.md` |

### 5.2 已验证不可爬平台（4 个，本报告覆盖）

| 平台 | 状态 | 不可爬原因 | 残留价值 |
|---|---|---|---|
| 爱燃烧 iranshao | ❌ | 赛事库已下线，仅留资讯 | 旧文章中的城市/年份提示可作为 webSearch query 灵感 |
| 数字心动 shuzixindong | ⚠️ | 主 SPA 需要 APP 登录 token；个别 city 子站可绑 | 已绑宁波 1 例，未来逐城探活 |
| 悦跑圈 thejoyrun | ❌ | 所有赛事数据封闭在 APP 内 | 仅可用作"用户提及→交叉验证"线索 |
| 42travel | ❌ | 域名已停运（504 / 连接超时） | 无 |

### 5.3 已知专项源（其他报告覆盖）

| 平台 | 状态 | 详细 |
|---|---|---|
| 田协 runchina | ⚠️ PDF only | `研究报告-runchina田协赛历方案.md` |
| NowRun 闹跑 | ✅ priority 87，对标参考 | `研究报告-NowRun-nowrun爬取方案.md` |

---

**核心建议给后人**：
1. **不要重新探活** iranshao / 42travel，它们已是死站
2. 不要假设 shuzixindong 有规律的子域名，只在搜索引擎确认存在后才绑
3. **不要试图绕过悦跑圈 APP token**，这是抓取边界外的事
4. 优先扩展 zuicool（国内）和 chinarun（海外）的覆盖
5. 用 runninginchina 详情页补全 `marathons.website_url` 字段是性价比最高的"补强动作"
