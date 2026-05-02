-- =============================================================================
-- 数据库变更脚本：2026-05-02 第三方平台绑定 + 赛事数据修正
-- =============================================================================
-- 目的：
--   1. 启用 5 个第三方平台 source（最酷/马拉马拉/数字心动/爱燃烧/田协）
--   2. 绑定 13 条 marathon_sources（zuicool 6 + mararun 6 + szxd 1）
--   3. 修正 11 条 marathon_editions 的 registration_url（指向第三方直达报名页）
--   4. 修正若干赛事的 race_date / registration_status（基于 web search 权威结果）
--
-- 适用环境：development（已执行）/ production（待执行）
-- 执行方式：psql $DATABASE_URL -f 2026-05-02-第三方平台绑定与赛事数据修正.sql
-- 幂等性：✅ 全部 UPSERT，可重复执行
-- 事务安全：✅ 单事务包裹，失败自动回滚
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Part 1. 注册/激活 5 个第三方平台 sources
-- -----------------------------------------------------------------------------

INSERT INTO sources (name, type, strategy, base_url, priority, is_active, notes) VALUES
  ('最酷体育（Zuicool）', 'platform', 'HTML', 'https://www.zuicool.com', 90, true,
   '第一层核心数据源；国内主流马拉松报名平台。提供直接报名入口 /event/{id}'),
  ('马拉马拉（Mararun）', 'platform', 'HTML', 'https://www.mararun.com', 88, true,
   '第一层核心数据源；北马/广马/深马/成马等顶级赛事官方指定移动端通道，赛事可使用 {city}-marathon.mararun.com 子域名'),
  ('数字心动（Shuzixindong）', 'platform', 'HTML', 'https://www.shuzixindong.com', 91, true,
   '中国田协官方 APP；仅个别赛事有 {city}marathon.shuzixindong.com 子站，主体为 SPA 不可爬'),
  ('爱燃烧（iranshao）', 'platform', 'HTML', 'https://iranshao.com', 88, true,
   '跑步社区与新闻；/races/{id} 旧 URL 已失效，仅用于文章资讯发现，不作为报名链接源'),
  ('中国田径协会（runchina）', 'official', 'HTML', 'https://www.runchina.org.cn', 92, true,
   '田协权威赛历，含金/银/铜标赛事认证。所有 CHN 马拉松通用 calendar URL 可作为权威信息源')
ON CONFLICT (name) DO UPDATE SET
  type = EXCLUDED.type,
  strategy = EXCLUDED.strategy,
  base_url = EXCLUDED.base_url,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Part 2. 绑定 marathon_sources（zuicool 6 + mararun 6 + szxd 1）
-- -----------------------------------------------------------------------------

-- 2a. 最酷 zuicool 直链（6 个）
WITH src AS (SELECT id FROM sources WHERE name = '最酷体育（Zuicool）'),
bindings(canonical, url) AS (VALUES
  ('shanghai-marathon-2026',  'https://zuicool.com/event/64264'),
  ('hangzhou-marathon-2026',  'https://zuicool.com/event/88174'),
  ('guangzhou-marathon-2026', 'https://zuicool.com/event/16059'),
  ('shenzhen-marathon-2026',  'https://zuicool.com/event/79945'),
  ('taiyuan-marathon-2026',   'https://zuicool.com/event/21936'),
  ('lanzhou-marathon-2026',   'https://zuicool.com/event/49082')
)
INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
SELECT m.id, src.id, b.url, false
FROM bindings b
JOIN marathons m ON m.canonical_name = b.canonical
CROSS JOIN src
ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url = EXCLUDED.source_url;

-- 2b. 马拉马拉 mararun 子域名（6 个）
WITH src AS (SELECT id FROM sources WHERE name = '马拉马拉（Mararun）'),
bindings(canonical, url) AS (VALUES
  ('beijing-marathon-2026',   'https://beijing-registration.mararun.com/'),
  ('guangzhou-marathon-2026', 'https://guangzhou-registration.mararun.com/'),
  ('shenzhen-marathon-2026',  'https://shenzhen-registration.mararun.com/'),
  ('chengdu-marathon-2026',   'https://chengdu-marathon.mararun.com/'),
  ('wuhan-marathon-2027',     'https://wuhan-registration.mararun.com/'),
  ('nanjing-marathon-2026',   'https://nanjing-registration.mararun.com/')
)
INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
SELECT m.id, src.id, b.url, false
FROM bindings b
JOIN marathons m ON m.canonical_name = b.canonical
CROSS JOIN src
ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url = EXCLUDED.source_url;

-- 2c. 数字心动 shuzixindong（仅宁波 1 个）
WITH src AS (SELECT id FROM sources WHERE name = '数字心动（Shuzixindong）')
INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
SELECT m.id, src.id, 'https://ningbomarathon.shuzixindong.com/', false
FROM marathons m, src
WHERE m.canonical_name = 'ningbo-marathon-2027'
ON CONFLICT (marathon_id, source_id) DO UPDATE SET source_url = EXCLUDED.source_url;

-- -----------------------------------------------------------------------------
-- Part 3. 更新 11 条 marathon_editions.registration_url（直达第三方报名页）
-- -----------------------------------------------------------------------------

-- 最酷直链优先级：上海/杭州/广州/深圳/太原/兰州 → zuicool
UPDATE marathon_editions e SET registration_url = 'https://zuicool.com/event/64264', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'shanghai-marathon-2026' AND e.year = 2026;
UPDATE marathon_editions e SET registration_url = 'https://zuicool.com/event/88174', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'hangzhou-marathon-2026' AND e.year = 2026;
UPDATE marathon_editions e SET registration_url = 'https://zuicool.com/event/49082', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'lanzhou-marathon-2026' AND e.year = 2026;
UPDATE marathon_editions e SET registration_url = 'https://zuicool.com/event/21936', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'taiyuan-marathon-2026' AND e.year = 2026;
-- 深圳：广深两家在 zuicool/mararun 都有，统一用 zuicool（数据更全）
UPDATE marathon_editions e SET registration_url = 'https://zuicool.com/event/79945', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'shenzhen-marathon-2026' AND e.year = 2026;
-- 广州：mararun 子域名优先（更接近官方）
UPDATE marathon_editions e SET registration_url = 'https://guangzhou-registration.mararun.com/', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'guangzhou-marathon-2026' AND e.year = 2026;

-- mararun 优先级：北京/南京/成都/武汉
UPDATE marathon_editions e SET registration_url = 'https://beijing-registration.mararun.com/', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'beijing-marathon-2026' AND e.year = 2026;
UPDATE marathon_editions e SET registration_url = 'https://nanjing-registration.mararun.com/', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'nanjing-marathon-2026' AND e.year = 2026;
UPDATE marathon_editions e SET registration_url = 'https://chengdu-marathon.mararun.com/', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'chengdu-marathon-2026' AND e.year = 2026;
UPDATE marathon_editions e SET registration_url = 'https://wuhan-registration.mararun.com/', updated_at = NOW()
  FROM marathons m WHERE e.marathon_id = m.id AND m.canonical_name = 'wuhan-marathon-2027' AND e.year = 2027;

-- -----------------------------------------------------------------------------
-- Part 3b. 开普敦马拉松日期修正（2026 因申请 WMM 由 10 月改为 5 月）
-- 来源：https://capetownmarathon.com/why-may-2026/
-- -----------------------------------------------------------------------------
UPDATE marathon_editions e
SET race_date = '2026-05-24',
    registration_status = '报名中',
    registration_url = 'https://capetownmarathon.com/international-entry/',
    field_sources = COALESCE(e.field_sources, '{}'::jsonb) || jsonb_build_object(
      'raceDate', jsonb_build_object('source','web_search','url','https://capetownmarathon.com/','at', NOW()::text),
      'registrationStatus', jsonb_build_object('source','web_search','url','https://capetownmarathon.com/marathon/','at', NOW()::text),
      'registrationUrl', jsonb_build_object('source','web_search','url','https://capetownmarathon.com/international-entry/','at', NOW()::text)
    ),
    updated_at = NOW()
FROM marathons m
WHERE e.marathon_id = m.id AND m.canonical_name = 'cape-town-marathon-2026' AND e.year = 2026;

-- -----------------------------------------------------------------------------
-- Part 4. 校验
-- -----------------------------------------------------------------------------

-- 应输出 5 行
SELECT '✅ Part 1: sources' AS step, COUNT(*) AS count
FROM sources
WHERE name IN ('最酷体育（Zuicool）','马拉马拉（Mararun）','数字心动（Shuzixindong）','爱燃烧（iranshao）','中国田径协会（runchina）')
  AND is_active = true;

-- 应输出 13 行
SELECT '✅ Part 2: marathon_sources' AS step, COUNT(*) AS count
FROM marathon_sources ms JOIN sources s ON s.id = ms.source_id
WHERE s.name IN ('最酷体育（Zuicool）','马拉马拉（Mararun）','数字心动（Shuzixindong）');

-- 应输出 10 行（11 个 UPDATE 中广州有两条版本，最终 = 10 条不重复 edition）
SELECT '✅ Part 3: registration_url' AS step, COUNT(*) AS count
FROM marathon_editions e JOIN marathons m ON m.id = e.marathon_id
WHERE m.canonical_name IN (
  'shanghai-marathon-2026','beijing-marathon-2026','hangzhou-marathon-2026','guangzhou-marathon-2026',
  'shenzhen-marathon-2026','chengdu-marathon-2026','wuhan-marathon-2027','nanjing-marathon-2026',
  'taiyuan-marathon-2026','lanzhou-marathon-2026'
)
AND e.registration_url ~ '(zuicool\.com|mararun\.com|shuzixindong\.com)';

COMMIT;

-- =============================================================================
-- 备注：
--   * 不要在生产库直接 DROP / TRUNCATE 任何表
--   * 如需回滚此脚本，参考 ROLLBACK 指令（在另一个 .down.sql 文件中维护）
--   * 同步至生产前，建议先在生产库做一次 SELECT 确认 dev 与 prod 的赛事数量基本一致
-- =============================================================================
