# script/wmm/ —— 世界马拉松大满贯（WMM）逐站读取器

八个官方站点各写一个独立程序（用户 2026-09-20 定的做法：**一个站一个程序**，不搞通用解析器）。

| 程序 | 站点 | 状态 |
|---|---|---|
| `01-london.ts` | tcslondonmarathon.com | ✅ 已写（含**两天赛**支持） |
| `02-berlin.ts` | bmw-berlin-marathon.com | ⬜ 待写 |
| `03-boston.ts` | baa.org | ⬜ 待写 |
| `04-chicago.ts` | chicagomarathon.com | ⬜ 待写 |
| `05-nyc.ts` | nyrr.org | ⬜ 待写（抓取被挡，要换 UA/Cookie 或换页面） |
| `06-tokyo.ts` | marathon.tokyo | ⬜ 待写（页面残留 2007 年老文案，要避开） |
| `07-capetown.ts` | capetownmarathon.com | ⬜ 待写 |
| `08-sydney.ts` | sydneymarathon.com | ⬜ 待写（3.7MB 页面，日期在 Next.js payload 里） |

## 约定

- **只读**：抓页面 + 解析，打印 JSON；**绝不写库**。落库由单独的数据批次做（备份 + 旧值守卫 + 回滚演练）。
- 每个程序输出：`chosen`（挑中的届次与日期）+ `allCandidates`（所有日期候选 + 挑中它的原句）+ `pages`（抓取状态）。
  **候选一律全量打印**，因为官网正文里常混着抽签窗口、报名期等其他日期，必须人工能一眼复核。
- 多日赛/两天赛：输出 `date`（**首日**）+ `dateEnd`（**末日**）。
  库里对应 `marathon_editions.race_date` / `race_end_date`
  （见 `script/db-ensure-race-end-date.ts`，schema 在 `shared/schema.ts` 的 `raceEndDate`）。
- 站点没有 JSON-LD 结构化数据时（伦敦就是），一律从正文句子抽，并把原句当证据一起打印。

## 用法

```bash
npx tsx script/wmm/01-london.ts --json=/tmp/london.json     # 抓 + 解析 + 落盘 JSON
```
