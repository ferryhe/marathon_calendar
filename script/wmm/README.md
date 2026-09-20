# 官网数据线（official-sites）

从**赛事官网**直接读取比赛日期/信息的独立数据线。目前覆盖 8 站（WMM 全量），目标是
**再加一个站只写一个描述符文件**，不动公用逻辑。

```
script/wmm/
  lib.ts                  # 公用：抓页 / HTML→文本 / 日期候选抽取 / 判定与选择（不发散到各站）
  run.ts                  # 统一入口：--site= / --all（巡检）/ --list / --check-db / --html= / --html-dir=
  sites/
    types.ts              # SiteDescriptor 接口（站点只声明"自己的特殊之处"）
    index.ts              # 注册表（加站＝这里加一行）
    london.ts … sydney.ts # 每站一个描述符
  01-london.ts … 08-sydney.ts   # 兼容入口（薄壳，内部调 run.ts）
  selftest-*.ts           # 离线自测（无网络、无 DB）
```

## 常用命令

```bash
cd /data/disk/opt/marathon_calendar-src

# 列出已注册站点
npx tsx script/wmm/run.ts --list

# 单站（可与库对照）
npx tsx script/wmm/run.ts --site=tokyo --check-db

# 八站巡检：一条命令看全部，与库不一致会以退出码 2 结束
npx tsx script/wmm/run.ts --all --check-db --html-dir=/home/ubuntu/wmm-pages

# 被反爬/JS 渲染挡住的站：先用真实浏览器存页面，再喂进去
#   /home/ubuntu/wmm-pages/<slug>.html   （--html-dir 会按站点 slug 自动匹配）
npx tsx script/wmm/run.ts --site=nyc --html=/home/ubuntu/wmm-pages/nyc.html --check-db

# 自测（九套，离线，改 lib 后必跑）
for f in selftest-lib selftest-{london,berlin,boston,chicago,nyc,tokyo,capetown,sydney}; do
  npx tsx script/wmm/$f.ts | tail -1
done
```

约定：**只读**。读取器不写库；`--check-db` 只做 SELECT。要改库走"备份 → 旧值守卫 → 事务演练（含回滚等价性）→ 写入 → 复验"，
留痕只写 `marathon_editions.field_sources->auditNote`（**绝不写 `highlights`**，那是用户可见字段）。

## 加一个新站（3 步）

1. **抄一个描述符**：新建 `script/wmm/sites/<slug>.ts`，导出 `SiteDescriptor`（见 `sites/types.ts`）。
   必填只有这几项：`slug / index / name / canonicalName（对齐库里 marathons.canonical_name）/ officialUrl /
   pages / mainEventHint / dateSource`，特殊之处再补 `fetch / twoDayPick / timezone / notes`。
2. **注册**：在 `sites/index.ts` 里 import 并加进 `SITES` 数组（一行）。
3. **验证**：`npx tsx script/wmm/run.ts --site=<slug> --check-db`；
   再为它补一套 `selftest-<slug>.ts`（用实测原文当样本，把踩过的坑变成断言）。

同时建议补一条 skill 记录（见 `.hermes/skills/.../marathon-source-*`）：站点特有坑写进描述符 `notes` 与 skill 里，
下次改版能一眼看出。

## 八站现状（2026-09-20）

| 序 | slug | 赛事 | 日期源 | 取页 | 与库 |
|---|---|---|---|---|---|
| 01 | london | TCS London Marathon | 公告句（两天赛：24–25 April 2027） | fetch | 一致（含末日） |
| 02 | berlin | BMW BERLIN-MARATHON | 报名信息页 `will take place on …` | fetch | 一致 |
| 03 | boston | Boston Marathon | **新闻公告页**（赛事页不写日期） | **浏览器存页** | 一致 |
| 04 | chicago | Chicago Marathon | 首页（美国式 `October 11, 2026`） | curl | 一致 |
| 05 | nyc | TCS New York City Marathon | 首页**倒计时模块** | **浏览器存页** | 一致 |
| 06 | tokyo | Tokyo Marathon | **赛事概要页** `Date \| Sunday, March 7, 2027` | curl | 一致 |
| 07 | capetown | Sanlam Cape Town Marathon | 首页区间 `22–23 May 2027`（周末 → 取末日 23 日） | curl | 一致 |
| 08 | sydney | TCS Sydney Marathon | 首页 H1 数字式 `29.08.2027` | curl | 一致 |

## 判定逻辑为什么长这样（每一条都是实测/审计逼出来的）

解析出的**每个日期候选**都要过三层判据，三层的"窗口"各不相同——这是关键：

| 判据 | 窗口 | 为什么不能用别的 |
|---|---|---|
| 赛事语义（`RACE_SEM`） | **宽窗口**（日期前 110 / 后延伸到本句句号） | 芝加哥首页比赛日紧邻的是导航文字，句内窗口里没有 race 语义 |
| 非赛事**事件类型**（`NON_RACE`：expo/kids/maintenance/press…） | **句内窗口**（句号/分号截断） | 否则上一句提到的 Expo 会把真比赛日判死（审计 D7） |
| **管理类短语**（`ADMIN_NEAR`：`registration opens`/`ballot window`…） | **紧邻窗口**（±40/20） | 否则开普敦横幅 `BALLOT CLOSED 24 JUNE 22–23 May 2027` 会误伤真比赛日 |

在此之上还有三件事防止"静默给错日期"：

1. **宣告句式优先**：同届内优先取 `will take place / will be held / to be run / is on` 的日期（抽签/报名句不算）
2. **区间不压过宣告式单日**：页面上"周末 17–19 April"的区间句不得盖过 `the race will be held on 19 April`（审计 D7）
3. **届次年份提示**：页面写 `the 2027 Boston Marathon` 时，该年份计入届次依据 → 只写报名日、比赛日未公布的页面会**报读不到**
   （退出码 2）而不是把报名日当比赛日

区间语义由站点声明：`twoDayPick: "first"`（默认，伦敦那种**马拉松真跨两天** → race_date=首日 + race_end_date=末日）
或 `"last"`（开普敦那种**区间是赛事周末、本赛只在末日** → race_date=末日，不设 race_end_date）。

## 待办 / 遗留（来自独立审计，均非阻断）

* 见 PR #14 的评论（Gitee 这个仓库 issue 接口不可用）。D1/D3/D7 已在本次修复并加了回归断言。
* 建议后续把"被反爬挡住的站"改成**自动用浏览器取页**（现在需人工存页面到 `--html-dir`）。
