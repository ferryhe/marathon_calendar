/**
 * 兼容入口（薄壳）—— 站点配置已抽到 `sites/sydney.ts`，公用流程在 `run.ts`。
 *
 * 用法与之前一致：
 *   npx tsx script/wmm/08-sydney.ts [--html=<文件>] [--json=<文件>] [--today=YYYY-MM-DD] [--check-db]
 */
import { runSiteCli } from "./run.js";
import { sydney } from "./sites/sydney.js";

runSiteCli(sydney).catch((e) => {
  console.error(e);
  process.exit(1);
});
