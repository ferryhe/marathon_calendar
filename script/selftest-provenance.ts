/**
 * Offline self-test for `shared/provenance.ts`（留痕只写 field_sources）。
 *
 *   npx tsx script/selftest-provenance.ts
 *
 * 纯函数、无 DB、无网络。
 */
import { AUDIT_NOTE_KEYS, addAuditNoteSql, mergeAuditNote } from "../shared/provenance.js";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
  }
}

console.log("\n## 1. mergeAuditNote：留痕进 field_sources，其它来源信息保留");
{
  const empty = mergeAuditNote(null, "note A", { at: "2026-09-20", why: "stale-status flip" });
  check("null → 建出 3 个键", AUDIT_NOTE_KEYS.every((k) => k in empty), empty);
  check("auditNote 原文在", empty.auditNote === "note A", empty);

  const existing = { raceDate: { value: "2026-07-02", source: "runsignup" }, highlights: { sourceKey: "RunSignup" } };
  const merged = mergeAuditNote(existing, "note B", { at: "2026-09-20", why: "series-first-day" });
  check("已有键（raceDate/highlights）不被覆盖", merged.raceDate === existing.raceDate && merged.highlights === existing.highlights, merged);
  check("首次留痕不追加空行", merged.auditNote === "note B", merged);

  const twice = mergeAuditNote(merged, "note C", { at: "2026-09-21", why: "rollover" });
  check("第二条留痕换行追加", twice.auditNote === "note B\nnote C", twice);
  check("auditNoteAt 更新为最新", twice.auditNoteAt === "2026-09-21", twice);

  const arr = mergeAuditNote([1, 2, 3], "note D");
  check("非对象（数组）输入不炸、当作空对象", arr.auditNote === "note D" && !Array.isArray(arr), arr);
  check("空字符串 note 也照写（调用方负责内容）", mergeAuditNote(null, "").auditNote === "", mergeAuditNote(null, ""));
}

console.log("\n## 2. addAuditNoteSql：只动 field_sources，绝不碰 highlights");
{
  const frag = addAuditNoteSql({ noteExpr: "$2", whyExpr: "'stale-status flip'", atExpr: "to_char(NOW(),'YYYY-MM-DD')" });
  check("包含 field_sources 合并", frag.includes("field_sources = COALESCE(field_sources,'{}'::jsonb)"), frag);
  check("提到 auditNote 三键", ["auditNote", "auditNoteAt", "auditNoteWhy"].every((k) => frag.includes(`'${k}'`)), frag);
  check("绝不出现 highlights（本模块存在的理由）", !/highlights/i.test(frag), frag);
  check(
    "已有 auditNote 时换行追加（与 mergeAuditNote 语义一致）",
    frag.includes("COALESCE(field_sources->>'auditNote','')") && frag.includes("|| E'\\n' ||"),
    frag,
  );
  const custom = addAuditNoteSql({ noteExpr: "'x'", whyExpr: "'y'", atExpr: "'z'", column: "field_sources" });
  check("column 可显式指定", custom.startsWith("field_sources = COALESCE(field_sources"), custom);
}

console.log(`\n# ${passed} assertion(s) passed, ${failures.length} failed`);
if (failures.length) {
  console.log("# FAILED:", failures.join(" | "));
  process.exit(1);
}
