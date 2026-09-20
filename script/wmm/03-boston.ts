/**
 * 兼容入口（薄壳）—— 站点配置已抽到 `sites/boston.ts`，公用流程在 `run.ts`。
 *
 * 用法与之前一致：
 *   npx tsx script/wmm/03-boston.ts [--html=<文件>] [--json=<文件>] [--today=YYYY-MM-DD] [--check-db]
 */
import { runSiteCli } from "./run.js";
import { boston } from "./sites/boston.js";

runSiteCli(boston).catch((e) => {
  console.error(e);
  process.exit(1);
});
