# 研究报告：中国田径协会（runchina.org.cn）赛历爬取方案

> **写作日期**：2026-05-02
> **目标读者**：未来接手本项目数据维护的 Agent
> **配套文档**：`研究报告-最酷zuicool爬取方案.md`、`研究报告-马拉马拉mararun爬取方案.md`

---

## 1. 平台速览

| 维度 | 说明 |
|---|---|
| 主体 | 中国田径协会（CAA） |
| 主域名 | `https://www.runchina.org.cn` |
| 备用 | `https://runchina.org.cn`、移动版 `https://m.zx42195.com/Calendar` |
| 角色 | **国内马拉松最权威信息源**——所有 A1/A2 类赛事必须在此挂牌 |
| 反爬 | 主站列表静态可读，**详情页是 React SPA，需要点击展开后 ajax 拉取** |

---

## 2. URL 模式

```
赛历主页（列表）         http://www.runchina.org.cn/portal.php?mod=calendar&ac=caa
赛历列表（替代）         http://www.runchina.org.cn/portal.php?mod=calendar&ac=list
分类筛选（金/银/铜标）   ?mod=calendar&ac=caa&type=badge
赛事详情页（SPA）        http://www.runchina.org.cn/portal.php?ac=detail&id={raceId}&mod=calendar
新闻/通知               http://www.runchina.org.cn/portal.php?mod=view&aid={articleId}
移动版日历              https://m.zx42195.com/Calendar
2026 田协赛事目录 PDF   https://file.shuzixindong.com/changzheng/84554/{hash}.pdf
```

**注意**：`runchina.org.cn` 详情页面用的图片 CDN 是 `img.shuzixindong.com`——可见田协跟数字心动是同一套技术栈。

---

## 3. 数据可获取性（实测）

### 主页列表 ✅ 可读

`webFetch('http://www.runchina.org.cn/portal.php?mod=calendar&ac=caa')` 返回的 markdown 包含 **"近期开赛"区块**：

```
2026.04.26  2026宜城半程马拉松
2026.04.26  2026伊犁河马拉松
2026.04.26  2026大连马拉松
2026.04.26  2026湘江半程马拉松
2026.04.26  2026密云马拉松
...
```

约 10-20 条最近开赛事件直接渲染在 HTML 中。

### 详情页 ❌ SPA 阻塞

`portal.php?ac=detail&id={id}` 返回的 HTML 跟主页几乎一样（同一套外层框架），**详细字段**（参赛人数、时长、奖金、报名链接、官方电话）**通过 JS 调 ajax 后注入**。`webFetch` 只看到外层导航不见详情。

### 替代方案

**金标/银标/铜标官方 PDF 列表更靠谱**：

```
https://file.shuzixindong.com/changzheng/84554/fddbe29f6e434035918201d2a17dbcac.pdf
（中国田径协会关于公布 2026 年马拉松赛事目录的通知）
```

PDF 内含完整 200+ 场认证赛事的：赛事名称、月份、举办地、级别认证。可下载后用 PDF 解析提取，每年更新一次即可。

---

## 4. 标准接入流程

### 方案 A：通用 calendar URL（已采用）

把田协赛历主页作为 **所有 CHN 马拉松的通用权威源**：

```sql
INSERT INTO sources (name, type, strategy, base_url, priority, is_active, notes)
VALUES ('中国田径协会（runchina）', 'official', 'HTML',
        'https://www.runchina.org.cn', 92, true,
        '田协权威赛历，含金/银/铜标赛事认证');
```

不绑定到具体 marathon_sources，作为兜底信息查询。

### 方案 B：每年一次 PDF 同步（推荐）

每年 1 月田协会发布当年完整赛事目录 PDF。脚本：

```js
// 1. 拉 sources='runchina' 主页，提取 PDF 链接
const home = await webFetch({ url: 'https://www.runchina.org.cn/' });
const pdfMatch = home.markdown.match(/(file|img)\.shuzixindong\.com\/[^\s)]+\.pdf/);

// 2. 下载 PDF
const pdf = await fetch(`https://${pdfMatch[0]}`).then(r => r.arrayBuffer());

// 3. 用 pdf-parse 解析（已在 package.json 里）
import pdfParse from 'pdf-parse';
const { text } = await pdfParse(Buffer.from(pdf));

// 4. 正则提取 (赛事名 / 月份 / 地点 / 标牌)
const races = [...text.matchAll(
  /(\d+)\s+([\d.]+)\s+(.+?马拉松.+?)\s+(白金|金|银|铜)?标?\s+(.+?)(?=\n)/g
)];
```

### 方案 C：详情页逆向（不推荐）

如果一定要拿详情字段：

```bash
# 用 Charles 抓数字心动 APP 流量，看到接口形如：
# GET https://race.shuzixindong.com/api/v1/marathon/detail?id=...
# 携带 Authorization Bearer xxx
```

但需要登录态 token，且 token 几小时过期，不适合无人值守。

---

## 5. 与本项目的对接策略

| 用法 | 说明 |
|---|---|
| **作为 source 注册** | ✅ 已建 `中国田径协会（runchina）` 一条，priority=92 |
| **绑定 marathon_sources** | ❌ 不绑定具体赛事（详情页不可爬） |
| **后台 AdminData 显示** | ✅ 在源列表里能看到，作为权威性参考 |
| **赛事信息校对** | ✅ 人工核对时主页"近期开赛"是最快入口 |
| **未来 PDF 入库** | ⚠️ 未实现，需要时按方案 B 写脚本 |

---

## 6. 注意事项

1. **PDF 链接每年变 hash**——不能硬编码，必须每次从主页解析。
2. **runchina.org.cn 偶尔 502**——建议加重试 3 次。
3. **境外访问可能被墙**——Replit 主流出口尚可访问，但生产环境如部署在境外节点需要代理。
4. **田协对爬虫敏感度低但建议加 User-Agent**——伪装成浏览器避免触发风控。
5. **同一赛事在不同年份会有不同 raceId**——田协 raceId 不是主键，只是届次 ID。

---

## 7. 已配置（2026-05-02）

```sql
SELECT name, base_url, is_active, priority
FROM sources
WHERE name LIKE '%runchina%' OR name LIKE '%田径协会%';
-- → 中国田径协会（runchina） | https://www.runchina.org.cn | true | 92
```

**结语**：runchina 是"权威但难抓"的典型代表。本项目把它作为信息背书源（"田协认证 = 高可信度"），实际数据抓取仍依赖最酷+马拉马拉。如未来需要扩展到全部 200+ 国内赛事，就要走"每年一次 PDF 解析"的方案 B。
