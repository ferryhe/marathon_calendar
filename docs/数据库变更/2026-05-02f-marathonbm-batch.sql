-- 2026-05-02f：marathonbm.com 探源 + 10 个新省会/区域马拉松批量入库
--
-- 触发：用户 "https://www.marathonbm.com/event 从这里找一些放进列表"
-- 路径：
--   1. 抓 marathonbm.com/event 第一页（SPA，gateway.marathonbm.com 网关 API 不公开）
--      → 直接拿到 2 个未收录马拉松：临泽 / 镇宁黄果树半程
--   2. 横向 webSearch 补全 8 个未收录的省会/区域马拉松，逐个 webFetch 验证 H1
--      → 哈尔滨 / 长春 / 沈阳 / 郑州 / 福州 / 银川 / 长沙 / 南宁
--   3. 跳过：济南 (zuicool ID 失配)、海口 (仅跨年报名页)、贵阳 (4/8 已过)
--
-- 验证：每个 zuicool/event/{id} 已通过 webFetch 解析 H1 = "2026{城市}马拉松"
-- 幂等：ON CONFLICT DO NOTHING

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================
-- 0) 新增数据源：marathonbm.com (百马汇)
-- ============================================================
-- 与 zuicool/mararun 同级第二梯队聚合平台，priority=89
INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active,
                     retry_max, retry_backoff_seconds, request_timeout_ms,
                     min_interval_seconds, notes, created_at, updated_at)
VALUES (
  '8c7f0a14-1234-4abc-9def-marathonbm001',
  '百马汇（Marathonbm）',
  'platform',
  'HTML',
  'https://www.marathonbm.com',
  89,
  TRUE,
  3, 30, 15000, 0,
  '第一层核心数据源；中国马拉松官方合作伙伴报名聚合站。SPA 架构（gateway.marathonbm.com），事件详情走 /eventDetail/{id}。批量列表共 398 页，按区域/项目/年份/赛况/月份筛选',
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 1) 新增 10 个 marathons（ON CONFLICT canonical_name DO NOTHING）
-- ============================================================
INSERT INTO marathons (id, name, canonical_name, city, country, description,
                       created_at, updated_at) VALUES
  (gen_random_uuid(), '2026哈尔滨马拉松', 'harbin-marathon-2026',
   '哈尔滨', 'China',
   '黑龙江省会赛事，中国田协 A 类。8 月在哈尔滨音乐公园起跑，避暑路线，2026 届具体日期待官方公布。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026长春马拉松', 'changchun-marathon-2026',
   '长春', 'China',
   '吉林省会赛事，"跑有境·心无疆" 主题，每年 5 月底举办，沿伊通河南北轴线展开。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026沈阳马拉松', 'shenyang-marathon-2026',
   '沈阳', 'China',
   '辽宁省会赛事，中国田协 A 类认证。9 月 13 日在沈阳奥体中心南门起跑，沿浑河主线。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026郑州马拉松', 'zhengzhou-marathon-2026',
   '郑州', 'China',
   '河南省会赛事（郑马），中国田协 A 类。每年 11 月举办，全程 + 半程双项目。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026福州马拉松', 'fuzhou-marathon-2026',
   '福州', 'China',
   '福建省会赛事，每年 12 月举办。沿闽江南北两岸主干道，福州市民跑步年度盛事。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026临泽马拉松', 'linze-marathon-2026',
   '临泽', 'China',
   '甘肃张掖临泽县七彩镇，中国田协赛事。6 月 28 日清晨起跑，丹霞地貌赛道，规模 6000 人。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026贵州·镇宁黄果树半程马拉松', 'zhenning-huangguoshu-half-marathon-2026',
   '镇宁', 'China',
   '贵州安顺市镇宁布依族苗族自治县，6 月 24 日开赛。半马项目，黄果树景区周边赛道，少数民族风情浓郁。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026蒙牛宁夏银川马拉松', 'yinchuan-marathon-2026',
   '银川', 'China',
   '宁夏首府赛事，5 月 17 日在人民广场西街起跑。"五月必跑的宁夏首府马"，有机会直通厦马。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026长沙马拉松', 'changsha-marathon-2026',
   '长沙', 'China',
   '湖南省会秋季赛事，10 月 25 日在贺龙体育场附近起跑。湘江两岸主干道全马 + 半马双项目。',
   NOW(), NOW()),

  (gen_random_uuid(), '2026南宁马拉松', 'nanning-marathon-2026',
   '南宁', 'China',
   '广西首府赛事，"一城双马" 中的冬季全马场，12 月举办。南宁博物馆为枢纽，邕江两岸赛道。',
   NOW(), NOW())
ON CONFLICT (canonical_name) DO NOTHING;


-- ============================================================
-- 2) 为 10 个新赛事各插入一个 edition
--    race_date NULL + status='待公布'：哈尔滨 / 长春 / 郑州 / 福州 / 南宁
--    race_date 已知 + status='报名中'：沈阳 / 临泽 / 镇宁黄果树 / 银川 / 长沙
-- ============================================================
INSERT INTO marathon_editions (id, marathon_id, year, race_date, registration_status,
                               registration_url, publish_status, published_at,
                               field_sources, created_at, updated_at)
SELECT gen_random_uuid(), m.id, v.year, v.race_date::date, v.status,
       v.reg_url, 'published', NOW(),
       jsonb_build_object(
         'raceDate', jsonb_build_object('source', v.field_source, 'updatedAt', NOW()::text),
         'registrationStatus', jsonb_build_object('source', v.field_source, 'updatedAt', NOW()::text),
         'registrationUrl', jsonb_build_object('source', v.field_source, 'updatedAt', NOW()::text)
       ),
       NOW(), NOW()
FROM marathons m
JOIN (VALUES
  ('harbin-marathon-2026',                     2026, NULL,         '待公布', 'https://zuicool.com/event/40939', 'web_search'),
  ('changchun-marathon-2026',                  2026, NULL,         '待公布', 'https://zuicool.com/event/53194', 'web_search'),
  ('shenyang-marathon-2026',                   2026, '2026-09-13', '待公布', 'http://www.symarathon.com/',     'web_search'),
  ('zhengzhou-marathon-2026',                  2026, NULL,         '待公布', 'https://zuicool.com/event/72606', 'web_search'),
  ('fuzhou-marathon-2026',                     2026, NULL,         '待公布', 'https://zuicool.com/event/76249', 'web_search'),
  ('linze-marathon-2026',                      2026, '2026-06-28', '报名中', 'https://zuicool.com/event/42303', 'marathonbm+zuicool'),
  ('zhenning-huangguoshu-half-marathon-2026',  2026, '2026-06-24', '报名中', 'https://www.marathonbm.com/event','marathonbm'),
  ('yinchuan-marathon-2026',                   2026, '2026-05-17', '报名中', 'https://zuicool.com/event/77933', 'web_search'),
  ('changsha-marathon-2026',                   2026, '2026-10-25', '待公布', 'https://zuicool.com/event/47412', 'web_search'),
  ('nanning-marathon-2026',                    2026, NULL,         '待公布', 'https://zuicool.com/event/86520', 'web_search')
) AS v(canonical_name, year, race_date, status, reg_url, field_source)
  ON v.canonical_name = m.canonical_name
ON CONFLICT (marathon_id, year) DO NOTHING;


-- ============================================================
-- 3) marathon_sources 绑定
--    Zuicool（575c8df8-ef99-4ece-9aa2-cba243352478）：8 个赛事
--    Marathonbm（8c7f0a14-...）：临泽 + 镇宁黄果树
--    赛事官方网站直采（2a21f264-906d-4120-a053-23bc02cb761f）：沈阳 / 长沙
-- ============================================================

-- ===== 3a) Zuicool 绑定 =====
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id,
       '575c8df8-ef99-4ece-9aa2-cba243352478',
       v.url, TRUE, NOW()
FROM marathons m
JOIN (VALUES
  ('harbin-marathon-2026',     'https://zuicool.com/event/40939'),
  ('changchun-marathon-2026',  'https://zuicool.com/event/53194'),
  ('zhengzhou-marathon-2026',  'https://zuicool.com/event/72606'),
  ('fuzhou-marathon-2026',     'https://zuicool.com/event/76249'),
  ('linze-marathon-2026',      'https://zuicool.com/event/42303'),
  ('yinchuan-marathon-2026',   'https://zuicool.com/event/77933'),
  ('changsha-marathon-2026',   'https://zuicool.com/event/47412'),
  ('nanning-marathon-2026',    'https://zuicool.com/event/86520')
) AS v(canonical_name, url)
  ON v.canonical_name = m.canonical_name
ON CONFLICT (marathon_id, source_id) DO NOTHING;

-- ===== 3b) Marathonbm 绑定（次级，is_primary=false）=====
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id,
       '8c7f0a14-1234-4abc-9def-marathonbm001',
       v.url, FALSE, NOW()
FROM marathons m
JOIN (VALUES
  ('linze-marathon-2026',                     'https://www.marathonbm.com/event'),
  ('zhenning-huangguoshu-half-marathon-2026', 'https://www.marathonbm.com/event')
) AS v(canonical_name, url)
  ON v.canonical_name = m.canonical_name
ON CONFLICT (marathon_id, source_id) DO NOTHING;

-- ===== 3c) 官方直采绑定（沈阳官网 / 长沙官网，无 zuicool 主源时设 primary=true）=====
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id,
       '2a21f264-906d-4120-a053-23bc02cb761f',
       v.url, v.is_primary, NOW()
FROM marathons m
JOIN (VALUES
  ('shenyang-marathon-2026',  'http://www.symarathon.com/',           TRUE),
  ('changsha-marathon-2026',  'https://www.marathonchangsha.com/',    FALSE)
) AS v(canonical_name, url, is_primary)
  ON v.canonical_name = m.canonical_name
ON CONFLICT (marathon_id, source_id) DO NOTHING;


COMMIT;

-- ============================================================
-- 验证查询（手工运行）
-- ============================================================
-- SELECT count(*) AS marathons_total FROM marathons;          -- 期望 49 → 59
-- SELECT count(*) AS editions_total FROM marathon_editions;   -- 期望 53 → 63
-- SELECT count(*) AS sources_total FROM sources;              -- 期望 +1 (marathonbm)
-- SELECT count(*) AS bindings_total FROM marathon_sources;    -- 期望 60 → 72 (8 zuicool + 2 mbm + 2 official)
-- SELECT m.name, e.race_date, e.registration_status
--   FROM marathons m JOIN marathon_editions e ON m.id=e.marathon_id
--  WHERE m.canonical_name IN (
--    'harbin-marathon-2026','changchun-marathon-2026','shenyang-marathon-2026',
--    'zhengzhou-marathon-2026','fuzhou-marathon-2026','linze-marathon-2026',
--    'zhenning-huangguoshu-half-marathon-2026','yinchuan-marathon-2026',
--    'changsha-marathon-2026','nanning-marathon-2026')
--  ORDER BY e.race_date NULLS LAST;
