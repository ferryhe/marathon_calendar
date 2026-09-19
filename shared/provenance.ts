/**
 * 批次/巡检留痕该写哪里 —— single source of truth.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `marathon_editions.highlights` 是**详情页上用户能看到的字段**
 * （`client/src/pages/MarathonDetail.tsx`："亮点" 区块直接渲染该列）。
 * 运维留痕（"某批改了哪个字段""cron 把 status 翻了"）写进去 = 站点上出现
 * 内部黑话。2026-09-20 体检发现 32 行 runsignup 行的批次注释正暴露在站点上，
 * 已迁到 `field_sources`（`auditNote` / `auditNoteAt` / `auditNoteWhy`）。
 *
 * 约定：
 *   - **留痕 → `field_sources`**（jsonb，永不渲染）。
 *   - **`highlights` → 只放面向用户的赛事亮点文案**。
 *
 * 用法（纯函数，drizzle / 测试可用）：
 *   const next = mergeAuditNote(row.fieldSources, note, { why: "stale-status flip" });
 * 用法（裸 SQL 脚本）：
 *   const frag = addAuditNoteSql({ noteExpr: "$2", whyExpr: "'stale-status flip'" });
 *   await client.query(`UPDATE marathon_editions SET status='ended', ${frag} WHERE id=$1`, [id, note]);
 */

export interface AuditNoteOpts {
  /** 留痕日期（CST 的 YYYY-MM-DD）。缺省由调用方给，便于测试与幂等。 */
  at?: string;
  /** 为什么写这条留痕（机器可读的短标签）。 */
  why?: string;
}

export const AUDIT_NOTE_KEYS = ["auditNote", "auditNoteAt", "auditNoteWhy"] as const;

/**
 * 把一条留痕并进 `field_sources`（jsonb）。
 * 已有留痕会以换行追加，其它键（raceDate / highlights / … 的来源信息）原样保留。
 */
export function mergeAuditNote(
  fieldSources: unknown,
  note: string,
  opts: AuditNoteOpts = {},
): Record<string, unknown> {
  const base: Record<string, unknown> =
    fieldSources && typeof fieldSources === "object" && !Array.isArray(fieldSources)
      ? { ...(fieldSources as Record<string, unknown>) }
      : {};
  const prev = typeof base.auditNote === "string" ? base.auditNote : "";
  base.auditNote = prev ? `${prev}\n${note}` : note;
  if (opts.at) base.auditNoteAt = opts.at;
  if (opts.why) base.auditNoteWhy = opts.why;
  return base;
}

/**
 * 裸 SQL 片段：`field_sources = COALESCE(field_sources,'{}'::jsonb) || jsonb_build_object(...)`
 *
 * 三个值都是 SQL 表达式（字面量请自带引号，绑定参数写 `$n`）。
 *
 * 语义与 `mergeAuditNote` **必须一致**：已有 `auditNote` 时**换行追加**，不是覆盖。
 * （jsonb 的 `||` 在键冲突时是覆盖语义，直接用会悄悄丢掉上一条留痕 —— 2026-09-20 实测踩到。）
 *
 * 刻意**不**生成任何 `highlights = …` —— 这条约束就是本模块存在的理由。
 */
export function addAuditNoteSql(opts: { noteExpr: string; whyExpr: string; atExpr: string; column?: string }): string {
  const col = opts.column ?? "field_sources";
  const prev = `COALESCE(${col}->>'auditNote','')`;
  const appended = `CASE WHEN ${prev} = '' THEN ${opts.noteExpr} ELSE ${prev} || E'\\n' || ${opts.noteExpr} END`;
  return (
    `${col} = COALESCE(${col},'{}'::jsonb) || jsonb_build_object(` +
    `'auditNote', ${appended}, 'auditNoteAt', ${opts.atExpr}, 'auditNoteWhy', ${opts.whyExpr})`
  );
}
