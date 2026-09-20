/**
 * 站点注册表 —— **加一个站只需要在这里加一行**。
 *
 * 步骤（详见 ../README.md）：
 *  1. 新建 `sites/<slug>.ts` 并导出 `SiteDescriptor`
 *  2. 在下面 import + 加进 SITES
 *  3. `npx tsx script/wmm/run.ts --site=<slug> --check-db` 验证
 */
import type { SiteDescriptor } from "./types.js";
import { london } from "./london.js";
import { berlin } from "./berlin.js";
import { boston } from "./boston.js";
import { chicago } from "./chicago.js";
import { nyc } from "./nyc.js";
import { tokyo } from "./tokyo.js";
import { capetown } from "./capetown.js";
import { sydney } from "./sydney.js";

export const SITES: SiteDescriptor[] = [
  london,
  berlin,
  boston,
  chicago,
  nyc,
  tokyo,
  capetown,
  sydney,];

export function bySlug(slug: string): SiteDescriptor | undefined {
  const k = slug.trim().toLowerCase();
  return SITES.find((s) => s.slug === k || s.canonicalName === k || s.index === k);
}

export type { SiteDescriptor } from "./types.js";
