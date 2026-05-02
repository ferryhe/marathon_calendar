# 数据库变更（Migrations）

本目录存放对生产数据库的**数据级变更脚本**（非 schema 变更）。

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
| 2026-05-02 | [第三方平台绑定与赛事数据修正](./2026-05-02-第三方平台绑定与赛事数据修正.sql) | sources +5 / marathon_sources +13 / marathon_editions update 10 | ⏳ 待同步至 prod |

---

## 配套研究文档

每条变更通常对应一份研究报告，位于 `../研究报告/`：

- 2026-05-02 第三方平台绑定 → 见以下 4 份报告：
  - [研究报告-最酷zuicool爬取方案](../研究报告/研究报告-最酷zuicool爬取方案.md)
  - [研究报告-马拉马拉mararun爬取方案](../研究报告/研究报告-马拉马拉mararun爬取方案.md)
  - [研究报告-iranshao与shuzixindong状态评估](../研究报告/研究报告-iranshao与shuzixindong状态评估.md)
  - [研究报告-runchina田协赛历方案](../研究报告/研究报告-runchina田协赛历方案.md)
