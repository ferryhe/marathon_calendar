# 数据库变更（Migrations）

本目录存放对生产数据库的**数据级变更脚本**（非 schema 变更）。

## 已应用变更索引

| 文件 | 时间 | 影响 |
|---|---|---|
| `2026-05-02-第三方平台绑定与赛事数据修正.sql` | 2026-05-02 | 第一批第三方平台 sources + marathon_sources 绑定 |
| `2026-05-02b-overseas-marathons-batch.sql` | 2026-05-02 | 新增首批海外马拉松（伦敦/纽约/东京/波士顿等） |
| `2026-05-02c-china-marathons-batch.sql` | 2026-05-02 | 新增国内中型马拉松批次 |
| `2026-05-02d-zuicool-bindings.sql` | 2026-05-02 | zuicool 直链绑定（上海/杭州/广州/深圳/太原/兰州） |
| `2026-05-02e-mararun-bindings.sql` | 2026-05-02 | mararun 子域名绑定（北京/广州/深圳/南京/武汉/成都） |
| `2026-05-02f-marathonbm-batch.sql` | 2026-05-02 | marathonbm 批次（含 source 注册） |
| `2026-05-02g-platform-expansion-overseas-batch.sql` | 2026-05-02 | **chinarun/nowrun/runninginchina 三平台 source + 10 个 chinarun 海外赛事**（澳门/新加坡/首尔/大阪/维也纳/布拉格/皇后镇/吴哥/黄金海岸/阳光海岸） |
| `2026-05-02h-nowrun-cn-batch-58.sql` | 2026-05-02 | **NowRun 候选去重批次：+57 个国内赛事**（30 全马 + 27 半马，覆盖石家庄/雄安/保定/芜湖/蚌埠/阜阳/荆州/十堰/咸宁/岳阳/永州/安阳/九江/上饶/济宁/德州/荣成/茂名/清远/佛山/柳州/钦州/宜宾/丽水/湖州/宁海/奉化/盐城/淮安/万宁；以及北京/天津/上海/沧州/南京/苏州/扬州/杭州/桐乡/广州/石狮/福州/南平/南昌/吉安/抚州/合肥/安庆/聊城/南宁/重庆/贵阳的 27 个半马；全部已完赛，作为历史档案 + 2027 届回归基准） |
| `2026-05-02i-nowrun-cn-upcoming-277.sql` | 2026-05-02 | **NowRun 上半年后段未结束赛事大批次：+277 个国内赛事**（5 月 24 / 6 月 13 / 7 月 6 / 8 月 20 / 9 月 35 / 10 月 53 / 11 月 92 / 12 月 34；canonical_name 用机械约定 `nowrun-{race_id}-2026`；全部 status=待公布，绑定 nowrun-001-cn-2026 为非主源） |
| `2026-05-02j-fix-nowrun-city-corruption.sql` | 2026-05-02 | **修复批次 i 中 19 条被 markdown 解析污染的 city 字段**（北京/天津/上海/重庆下辖区归到主城；横琴→珠海；伊犁塔城地区→塔城；永川/忠县/涪陵→重庆等） |


> Schema 级变更（CREATE TABLE / ALTER TABLE 等）由 Drizzle 在 Replit Publish 流程中自动 diff 与同步，不在此目录维护。
> 本目录专门用于跨环境（dev → production）的**数据迁移**。

---

## 命名规范

```
{YYYY-MM-DD}-{简短描述}.sql       ← 主脚本（必带 BEGIN/COMMIT）
{YYYY-MM-DD}-{简短描述}.down.sql  ← 回滚脚本（可选）
{YYYY-MM-DD}-{简短描述}.md        ← 配套说明文档（可选）
```

每个 SQL 脚本必须满足：

- ✅ **幂等**：使用 `INSERT ... ON CONFLICT DO UPDATE`、`UPDATE ... WHERE`，可重复执行不报错
- ✅ **事务**：以 `BEGIN;` 开头，`COMMIT;` 结尾
- ✅ **校验**：末尾包含 `SELECT` 校验语句确认行数符合预期
- ✅ **注释**：脚本头部说明目的、影响表、执行环境

---

## 执行流程

### 在开发库（已自动应用）
开发期间通过 Agent 调用 `executeSql()` 应用变更，无需手动操作。

### 同步到生产库

**Replit 生产数据库需要先解冻**（Deployments → Database → Unfreeze）。

```bash
# 1. 取得生产库连接串（Replit 部署面板 → Database → Connection String）
export PROD_DATABASE_URL="postgresql://..."

# 2. 干跑校验（重要！只跑 SELECT 部分）
psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) FROM marathons;"

# 3. 执行迁移
psql "$PROD_DATABASE_URL" -f docs/数据库变更/2026-05-02-第三方平台绑定与赛事数据修正.sql

# 4. 复核（脚本末尾的 SELECT 校验输出会跟着出现）
```

> ⚠️ Agent 通过 `executeSql({ environment: "production" })` **只能 SELECT，不能写**。
> 所有写入必须由你（人类操作者）通过 `psql` 或部署的 Admin API 完成。

---

## 变更索引

| 日期 | 脚本 | 影响 | 状态 |
|---|---|---|---|
| 2026-05-02 | [第三方平台绑定与赛事数据修正](./2026-05-02-第三方平台绑定与赛事数据修正.sql) | sources +5 / marathon_sources +13 / marathon_editions update 11（含开普敦 10→5 月修正） | ✅ 已包含在 c 里同步 |
| 2026-05-02c | [生产库初始化（dev 全量导出）](./2026-05-02c-prod-initial-seed.sql) | sources 20 / marathons 37 / marathon_editions 41 / marathon_sources 45 | ✅ 已对 prod 执行（2026-05-02 16:49 UTC） |
| 2026-05-02d | [开普敦报名状态修正](./2026-05-02d-cape-town-status-closed.sql) | marathon_editions update 1（开普敦：报名中→已截止，只剩国际旅行社打包名额） | ✅ 已对 dev + prod 执行 |
| 2026-05-02e | [Zuicool 批量补绑 + 12 新赛事](./2026-05-02e-zuicool-batch-binding.sql) | marathons +12 / marathon_editions +12 / marathon_sources +15（zuicool 6→21）| ✅ 已对 dev + prod 执行 |
| 2026-05-02f | [Marathonbm 探源 + 10 个省会/区域马拉松](./2026-05-02f-marathonbm-batch.sql) | sources +1（marathonbm）/ marathons +10（哈尔滨/长春/沈阳/郑州/福州/临泽/镇宁黄果树/银川/长沙/南宁）/ marathon_editions +10 / marathon_sources +12 | ✅ 已对 dev + prod 执行 |

> 说明：
> - `2026-05-02c-prod-initial-seed.sql` 是 dev 库当前**完整快照**，已经把上一条增量包在里面。生产库已用此脚本一次性初始化完成。
> - 生成器注意：`marathon_sources` 表**没有 `updated_at` 列**，ON CONFLICT 子句不要写 `updated_at = NOW()`（已修正）。
> - 后续做小修小改时，用单独的增量脚本，按上面格式继续往下追加索引。

---

## 配套研究文档

每条变更通常对应一份研究报告，位于 `../研究报告/`：

- 2026-05-02 第三方平台绑定 → 见以下 4 份报告：
  - [研究报告-最酷zuicool爬取方案](../研究报告/研究报告-最酷zuicool爬取方案.md)
  - [研究报告-马拉马拉mararun爬取方案](../研究报告/研究报告-马拉马拉mararun爬取方案.md)
  - [研究报告-iranshao与shuzixindong状态评估](../研究报告/研究报告-iranshao与shuzixindong状态评估.md)
  - [研究报告-runchina田协赛历方案](../研究报告/研究报告-runchina田协赛历方案.md)
