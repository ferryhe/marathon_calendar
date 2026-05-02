-- 数据库变更：2026-05-02 平台扩展批次（v2 - 幂等版）
-- 1) 新增 3 个数据源（chinarun / nowrun / runninginchina）
-- 2) 新增 10 个海外马拉松（来源：chinarun 玩比赛 海外赛事筛选页）
-- 3) 为这 10 个新马拉松创建 2026 edition + 绑定 chinarun 为非主源
--
-- 风险：低
-- 影响：marathons +10、marathon_editions +10、sources +3、marathon_sources +10
-- 幂等：✅ 全程 ON CONFLICT，可重复执行
-- 回滚：见末尾 ROLLBACK 段
-- 执行命令：
--   开发环境（已通过此脚本应用）：
--     psql "$DATABASE_URL" -f docs/数据库变更/2026-05-02g-platform-expansion-overseas-batch.sql
--   生产环境（已通过此脚本应用）：
--     psql "$PROD_DATABASE_URL" -f docs/数据库变更/2026-05-02g-platform-expansion-overseas-batch.sql

BEGIN;

-- ============================================================
-- 1. 新增 3 个数据源
--    nowrun min_interval_seconds=86400（每天最多 1 次主页拉取，竞品保守姿态）
-- ============================================================

INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, retry_max, retry_backoff_seconds, request_timeout_ms, min_interval_seconds, notes)
VALUES (
  'chinarun-001-overseas-marathons',
  'CHINARUN 玩比赛',
  'platform', 'HTML', 'https://www.chinarun.com',
  92, TRUE, 3, 30, 15000, 5,
  '海外/六大满贯/亚洲名牌马拉松直通名额最强渠道；详情页 /html/event-{id}.html，10 年结构稳定。详见 docs/研究报告/研究报告-chinarun玩比赛爬取方案.md'
) ON CONFLICT (id) DO UPDATE SET
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  min_interval_seconds = EXCLUDED.min_interval_seconds,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, retry_max, retry_backoff_seconds, request_timeout_ms, min_interval_seconds, notes)
VALUES (
  'nowrun-001-cn-2026',
  'NowRun 闹跑',
  'platform', 'HTML', 'https://www.nowrun.cn',
  87, TRUE, 3, 60, 15000, 86400,
  '本项目最直接的对标产品（Next.js SSR）。主页一次返回 ~490 个 2026 race 链接；详情页含中签率/起终点/天气历史。**仅作发现源 + 对标参考，绝不做主源**。min_interval_seconds=86400（每天最多 1 次）以体现竞品边界。详见 docs/研究报告/研究报告-NowRun-nowrun爬取方案.md'
) ON CONFLICT (id) DO UPDATE SET
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  min_interval_seconds = EXCLUDED.min_interval_seconds,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO sources (id, name, type, strategy, base_url, priority, is_active, retry_max, retry_backoff_seconds, request_timeout_ms, min_interval_seconds, notes)
VALUES (
  'runninginchina-001-cn-events',
  '跑IN中国（RunningInChina）',
  'platform', 'HTML', 'https://www.runninginchina.org',
  85, TRUE, 3, 30, 15000, 5,
  'RESTful 友好分页（type_id/page/province/run_state 四维 query string）。详情页含独家 "官方网址" 字段，可用于补全 marathons.website_url。详见 docs/研究报告/研究报告-runninginchina跑IN中国爬取方案.md'
) ON CONFLICT (id) DO UPDATE SET
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  min_interval_seconds = EXCLUDED.min_interval_seconds,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- ============================================================
-- 2. 新增 10 个海外马拉松（幂等：ON CONFLICT canonical_name DO UPDATE）
-- ============================================================

INSERT INTO marathons (name, canonical_name, city, country, description, website_url) VALUES
  ('2026 澳门国际马拉松', 'macau-marathon-2026', '澳门', 'Macau',
   '澳门年度跑步盛事，2026 年 12 月 6 日鸣枪，路线串联氹仔奥林匹克体育中心、跨海大桥与澳门半岛地标。中国境内国际化程度最高的马拉松之一。',
   'https://www.macauinternationalmarathon.com/'),
  ('2026 渣打新加坡马拉松', 'singapore-marathon-2026', '新加坡', 'Singapore',
   '新加坡国际马拉松（Standard Chartered Singapore Marathon），2026 年 12 月 5 日开赛，世界田联铜标赛事，赛道穿越滨海湾、金沙、鱼尾狮公园等城市地标。',
   'https://singaporemarathon.com/'),
  ('2026 首尔马拉松', 'seoul-marathon-2026', '首尔', 'South Korea',
   '韩国规模最大的城市马拉松，2026 年 3 月 15 日开赛，世界田联白金标赛事。赛道沿光化门、清溪川、汉江一线，是亚洲跑者公认的"PB 黄金赛道"之一。',
   'https://seoul-marathon.com/'),
  ('2026 大阪马拉松', 'osaka-marathon-2026', '大阪', 'Japan',
   '日本西部规模最大的城市马拉松，2026 年 2 月 22 日开赛，世界田联白金标赛事。赛道串联大阪城、心斋桥、通天阁、大阪南港等地标，35,000 人规模。',
   'https://www.osaka-marathon.com/'),
  ('2026 维也纳城市马拉松', 'vienna-marathon-2026', '维也纳', 'Austria',
   'Vienna City Marathon，2026 年 4 月 19 日开赛。世界田联金标赛事，从联合国城出发，沿多瑙河进入老城，途经美泉宫、霍夫堡皇宫、国家歌剧院等。',
   'https://www.vienna-marathon.com/'),
  ('2026 布拉格马拉松', 'prague-marathon-2026', '布拉格', 'Czech Republic',
   'Prague International Marathon，2026 年 5 月 3 日开赛。世界田联金标赛事，赛道沿伏尔塔瓦河穿越老城广场、查理大桥、布拉格城堡，被誉为"欧洲最美马拉松"之一。',
   'https://www.runczech.com/en/events/prague-marathon/'),
  ('2026 皇后镇马拉松', 'queenstown-marathon-2026', '皇后镇', 'New Zealand',
   'Queenstown Marathon，2026 年 11 月 14 日开赛。新西兰南岛标志性赛事，赛道环绕瓦卡蒂普湖（Lake Wakatipu），背景是皇后镇雪山，被誉为"南半球最美马拉松"。',
   'https://www.queenstown-marathon.co.nz/'),
  ('2026 吴哥王朝马拉松', 'angkor-empire-marathon-2026', '暹粒', 'Cambodia',
   'Angkor Empire Marathon，2026 年 8 月 2 日开赛。赛道穿越世界文化遗产吴哥窟、巴戎寺、塔布茏寺核心景区，部分收入用于柬埔寨儿童医疗援助。',
   'https://angkormarathon.com/'),
  ('2026 黄金海岸马拉松', 'gold-coast-marathon-2026', '黄金海岸', 'Australia',
   'Gold Coast Marathon，2026 年 7 月 4 日开赛。世界田联白金标赛事，赛道沿黄金海岸海滨大道，几乎全程平坦海风吹拂，是 PB 圣地之一。',
   'https://goldcoastmarathon.com.au/'),
  ('2026 阳光海岸马拉松', 'sunshine-coast-marathon-2026', '阳光海岸', 'Australia',
   'Sunshine Coast Marathon，2026 年 8 月 2 日开赛。澳大利亚昆士兰州夏季城市马拉松，赛道沿穆鲁拉巴（Mooloolaba）海滩与亚历山德拉港，规模适中、补给完善，新西兰/亚洲跑者首选。',
   'https://sunshinecoastmarathon.com.au/')
ON CONFLICT (canonical_name) DO UPDATE SET
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  description = EXCLUDED.description,
  website_url = EXCLUDED.website_url,
  updated_at = NOW();

-- ============================================================
-- 3. 为每个新马拉松创建 2026 edition（幂等 + 正确的 field_sources 形态）
--    field_sources 必须匹配 server/editionMerge.ts 的 buildFieldSourceInfo 结构：
--      { raceDate: { source, updatedAt, value } }
-- ============================================================

INSERT INTO marathon_editions (marathon_id, year, race_date, registration_status, publish_status, field_sources)
SELECT
  m.id, 2026, x.race_date::date, '待公布'::text, 'published'::text,
  jsonb_build_object(
    'raceDate', jsonb_build_object(
      'source', 'chinarun-001-overseas-marathons',
      'updatedAt', NOW()::text,
      'value', x.race_date::text
    )
  )
FROM (VALUES
  ('macau-marathon-2026', '2026-12-06'),
  ('singapore-marathon-2026', '2026-12-05'),
  ('seoul-marathon-2026', '2026-03-15'),
  ('osaka-marathon-2026', '2026-02-22'),
  ('vienna-marathon-2026', '2026-04-19'),
  ('prague-marathon-2026', '2026-05-03'),
  ('queenstown-marathon-2026', '2026-11-14'),
  ('angkor-empire-marathon-2026', '2026-08-02'),
  ('gold-coast-marathon-2026', '2026-07-04'),
  ('sunshine-coast-marathon-2026', '2026-08-02')
) AS x(slug, race_date)
JOIN marathons m ON m.canonical_name = x.slug
ON CONFLICT (marathon_id, year) DO UPDATE SET
  race_date = EXCLUDED.race_date,
  field_sources = EXCLUDED.field_sources,
  updated_at = NOW();

-- ============================================================
-- 4. 绑定 chinarun 为非主源（幂等）
--    is_primary=false：海外赛事 marathons.website_url 已填官方主域，那个由 'official' 主源持有；
--    chinarun 是"国内购买套餐 + 直通名额"的二级渠道
-- ============================================================

INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
SELECT m.id, 'chinarun-001-overseas-marathons', x.url, FALSE
FROM (VALUES
  ('macau-marathon-2026', 'https://www.chinarun.com/html/event-5366.html'),
  ('singapore-marathon-2026', 'https://www.chinarun.com/html/event-5367.html'),
  ('seoul-marathon-2026', 'https://www.chinarun.com/html/event-5306.html'),
  ('osaka-marathon-2026', 'https://www.chinarun.com/html/event-5329.html'),
  ('vienna-marathon-2026', 'https://www.chinarun.com/html/event-5331.html'),
  ('prague-marathon-2026', 'https://www.chinarun.com/html/event-5341.html'),
  ('queenstown-marathon-2026', 'https://www.chinarun.com/html/event-5357.html'),
  ('angkor-empire-marathon-2026', 'https://www.chinarun.com/html/event-5351.html'),
  ('gold-coast-marathon-2026', 'https://www.chinarun.com/html/event-5340.html'),
  ('sunshine-coast-marathon-2026', 'https://www.chinarun.com/html/event-5361.html')
) AS x(slug, url)
JOIN marathons m ON m.canonical_name = x.slug
ON CONFLICT (marathon_id, source_id) DO UPDATE SET
  source_url = EXCLUDED.source_url,
  is_primary = EXCLUDED.is_primary;

COMMIT;

-- ============================================================
-- 校验
-- ============================================================
SELECT m.canonical_name, m.country, m.city, me.race_date, me.field_sources, ms.source_url, ms.is_primary
FROM marathons m
JOIN marathon_editions me ON me.marathon_id = m.id AND me.year = 2026
LEFT JOIN marathon_sources ms ON ms.marathon_id = m.id AND ms.source_id = 'chinarun-001-overseas-marathons'
WHERE m.canonical_name IN (
  'macau-marathon-2026','singapore-marathon-2026','seoul-marathon-2026','osaka-marathon-2026',
  'vienna-marathon-2026','prague-marathon-2026','queenstown-marathon-2026',
  'angkor-empire-marathon-2026','gold-coast-marathon-2026','sunshine-coast-marathon-2026'
)
ORDER BY me.race_date;

-- ============================================================
-- 回滚（仅事故时使用）
-- ============================================================
-- BEGIN;
-- DELETE FROM marathon_sources WHERE source_id IN (
--   'chinarun-001-overseas-marathons','nowrun-001-cn-2026','runninginchina-001-cn-events'
-- );
-- DELETE FROM marathon_editions WHERE marathon_id IN (
--   SELECT id FROM marathons WHERE canonical_name IN (
--     'macau-marathon-2026','singapore-marathon-2026','seoul-marathon-2026','osaka-marathon-2026',
--     'vienna-marathon-2026','prague-marathon-2026','queenstown-marathon-2026',
--     'angkor-empire-marathon-2026','gold-coast-marathon-2026','sunshine-coast-marathon-2026'
--   )
-- );
-- DELETE FROM marathons WHERE canonical_name IN (
--   'macau-marathon-2026','singapore-marathon-2026','seoul-marathon-2026','osaka-marathon-2026',
--   'vienna-marathon-2026','prague-marathon-2026','queenstown-marathon-2026',
--   'angkor-empire-marathon-2026','gold-coast-marathon-2026','sunshine-coast-marathon-2026'
-- );
-- DELETE FROM sources WHERE id IN (
--   'chinarun-001-overseas-marathons','nowrun-001-cn-2026','runninginchina-001-cn-events'
-- );
-- COMMIT;
