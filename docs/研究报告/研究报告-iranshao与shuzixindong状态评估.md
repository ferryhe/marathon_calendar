# 研究报告：爱燃烧 & 数字心动 — 状态评估与放弃理由

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **结论先行**：这两个平台**都不适合**作为爬取数据源。下面记录调研过程和决策依据，**避免后人重复踩坑**。

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

## 三、统一结论

| 平台 | sources.is_active | 绑定数 | 未来潜力 |
|---|---|---|---|
| 最酷 zuicool | ✅ | 6 | ⭐⭐⭐⭐⭐ 最稳，建议持续扩展 |
| 马拉马拉 mararun | ✅ | 6 | ⭐⭐⭐⭐ 顶级赛事必备 |
| 田协 runchina | ✅ | 0（暂用 calendar 通用） | ⭐⭐⭐ 权威源，详情页需逆向 |
| **爱燃烧 iranshao** | ✅ | **0** | **⭐ 已是死站，仅留文章** |
| **数字心动 shuzixindong** | ✅ | **1（宁波）** | **⭐⭐ 个别子站，主 SPA 不可爬** |

**核心建议给后人**：
1. 不要再花时间在 iranshao 抓比赛数据上——站方已主动下线
2. 不要假设 shuzixindong 有规律的子域名，只在搜索引擎确认存在后才绑
3. 优先扩展最酷和马拉马拉的覆盖
