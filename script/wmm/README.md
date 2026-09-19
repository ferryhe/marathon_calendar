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
- 每个程序输出：
  - `chosen`：挑中的届次与日期（含 `raceLike` 判定与证据原句）
  - `allCandidates`：页面正文里**所有**日期候选 + 所在句子（全量，不丢）
  - `droppedCandidates`：**没被采用**的候选 + 没采用的原因（不是目标届 / 句子不含赛事语义或含 expo·ballot 等词）
  - `pages`：每个页面的 status / bytes / textChars / **error**（抓取失败原因不再被吞）
  - `notes`：告警（没解析到、目标届有多个候选、挑了非下一届…）
- **退出码**：`0` = 正常；`2` = 没解析到比赛日（含抓取失败）—— 批量/定时跑不会静默"成功"。
- **选择规则**：只认"带赛事语义"的句子（含 marathon/race/run，且不含 expo/ballot/registration/running show 等）；
  目标届默认"当前年+1"（没有则取最大年份）；同届多个候选时取**最近的未来日期**，并给出告警。
  两天赛优先于单日（但同样必须先过赛事语义）。
- 多日赛/两天赛：输出 `date`（**首日**）+ `dateEnd`（**末日**）。
  库里对应 `marathon_editions.race_date` / `race_end_date`
  （见 `script/db-ensure-race-end-date.ts`，schema 在 `shared/schema.ts` 的 `raceEndDate`）。
- 站点没有 JSON-LD 结构化数据时（伦敦就是），一律从正文句子抽，并把原句当证据一起打印。

## 用法

```bash
npx tsx script/wmm/01-london.ts --json=/tmp/london.json     # 抓 + 解析 + 落盘 JSON
```
