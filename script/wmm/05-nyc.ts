/**
 * 兼容入口（薄壳）—— 站点配置已抽到 `sites/nyc.ts`，公用流程在 `run.ts`。
 *
 * 用法与之前一致：
 *   npx tsx script/wmm/05-nyc.ts [--html=<文件>] [--json=<文件>] [--today=YYYY-MM-DD] [--check-db]
 */
import { runSiteCli } from "./run.js";
import { nyc } from "./sites/nyc.js";

runSiteCli(nyc).catch((e) => {
  console.error(e);
  process.exit(1);
});
