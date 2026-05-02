-- 2026-05-02 P1+P2：Zuicool 批量补绑 + 新增 12 个 Zuicool 上的赛事
--
-- 关联：docs/项目计划/下一步开发计划-2026-05-02.md（P1 + P2）
-- 验证方法：每个 event/{id} 都通过 webFetch 抓 H1 验证届次年份匹配
--
-- 幂等：使用 ON CONFLICT DO NOTHING，可重复执行
-- 数据源 sources.id（最酷体育 Zuicool）：'575c8df8-ef99-4ece-9aa2-cba243352478'

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================
-- P1：现有马拉松补绑 Zuicool（3 个）
-- ============================================================

-- beijing-marathon-2026 → event/84561（H1: "2026北京马拉松"，date: 2026-10-18）
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id, '575c8df8-ef99-4ece-9aa2-cba243352478',
       'https://zuicool.com/event/84561', false, NOW()
FROM marathons m WHERE m.canonical_name = 'beijing-marathon-2026'
ON CONFLICT (marathon_id, source_id) DO NOTHING;

-- dalian-marathon-2026 → event/14121（H1: "2026第36届大连马拉松赛"，date: 2026-04-26）
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id, '575c8df8-ef99-4ece-9aa2-cba243352478',
       'https://zuicool.com/event/14121', false, NOW()
FROM marathons m WHERE m.canonical_name = 'dalian-marathon-2026'
ON CONFLICT (marathon_id, source_id) DO NOTHING;

-- tokyo-marathon-2026 → event/38023（H1: "2027东京马拉松（20周年）"，date: 2027-03-07）
-- 说明：2026 届已结束，Zuicool 当前活跃页面为 2027 届
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id, '575c8df8-ef99-4ece-9aa2-cba243352478',
       'https://zuicool.com/event/38023', false, NOW()
FROM marathons m WHERE m.canonical_name = 'tokyo-marathon-2026'
ON CONFLICT (marathon_id, source_id) DO NOTHING;


-- ============================================================
-- P2：新增 12 个 Zuicool 上的赛事（含 marathons + editions + sources）
-- ============================================================

-- 海外 6 个
INSERT INTO marathons (id, name, canonical_name, city, country, description, created_at, updated_at) VALUES
  (gen_random_uuid(), '2026婆罗洲马拉松', 'borneo-marathon-2026', '哥打基纳巴卢', 'Malaysia', '马来西亚沙巴州东海岸国际赛事，热带海岛风光路线。', NOW(), NOW()),
  (gen_random_uuid(), '2026波尔多红酒马拉松', 'bordeaux-wine-marathon-2026', '波尔多', 'France', '世界最具特色赛事之一，沿途酒庄品酒补给，盛装跑者云集。', NOW(), NOW()),
  (gen_random_uuid(), '2026普吉岛马拉松', 'phuket-marathon-2026', '普吉', 'Thailand', '亚洲热带海岛赛事代表，凌晨起跑避高温，沿海岸线赛道。', NOW(), NOW()),
  (gen_random_uuid(), '2026清迈马拉松', 'chiangmai-marathon-2026', '清迈', 'Thailand', '泰国北部古城马拉松，凉季气候宜人，塔佩门起终点。', NOW(), NOW()),
  (gen_random_uuid(), '2026渣打吉隆坡马拉松', 'kl-marathon-2026', '吉隆坡', 'Malaysia', '马来西亚首都旗舰赛事，金标认证，国庆长假期间举办。', NOW(), NOW()),
  (gen_random_uuid(), '2027渣打香港马拉松', 'hk-marathon-2027', '香港', 'Hong Kong', '亚洲规模最大马拉松之一，7.4 万人，三跨海大桥三海底隧道。', NOW(), NOW())
ON CONFLICT (canonical_name) DO NOTHING;

-- 国内 6 个
INSERT INTO marathons (id, name, canonical_name, city, country, description, created_at, updated_at) VALUES
  (gen_random_uuid(), '2026乌兰察布马拉松', 'wulanchabu-marathon-2026', '乌兰察布', 'China', '内蒙古高原草原马拉松，北京向西一步到草原，避暑赛道。', NOW(), NOW()),
  (gen_random_uuid(), '2026招远黄金马拉松', 'zhaoyuan-gold-marathon-2026', '招远', 'China', '山东招远以黄金主题命名的特色马拉松，矿区与城区并行赛道。', NOW(), NOW()),
  (gen_random_uuid(), '2026秦皇岛马拉松', 'qinhuangdao-marathon-2026', '秦皇岛', 'China', '河北滨海城市马拉松，5 月初海风温和，长城遗迹沿途相伴。', NOW(), NOW()),
  (gen_random_uuid(), '2026高平马拉松', 'gaoping-marathon-2026', '高平', 'China', '山西晋城地区赛事，依托上党古城与抗战纪念设施的文化路线。', NOW(), NOW()),
  (gen_random_uuid(), '2026第五届长白山森氧马拉松', 'changbaishan-marathon-2026', '长白山', 'China', '吉林长白山景区高海拔森氧赛道，6 月夏初凉爽，景观马代表。', NOW(), NOW()),
  (gen_random_uuid(), '2026避暑天堂康养临夏马拉松', 'linxia-marathon-2026', '临夏', 'China', '甘肃临夏回族自治州赛事，夏季高原避暑赛道，民俗风情浓郁。', NOW(), NOW())
ON CONFLICT (canonical_name) DO NOTHING;


-- 为 12 个新赛事各插入一个 edition（year 来自 race_date）
INSERT INTO marathon_editions (id, marathon_id, year, race_date, registration_status, registration_url, publish_status, published_at, created_at, updated_at)
SELECT gen_random_uuid(), m.id, v.year, v.race_date::date, v.status, v.reg_url, 'published', NOW(), NOW(), NOW()
FROM marathons m
JOIN (VALUES
  ('borneo-marathon-2026',          2026, '2026-05-10', '已截止', 'https://zuicool.com/event/57030'),
  ('bordeaux-wine-marathon-2026',   2026, '2026-09-05', '报名中', 'https://zuicool.com/event/83952'),
  ('phuket-marathon-2026',          2026, '2026-06-13', '报名中', 'https://zuicool.com/event/16146'),
  ('chiangmai-marathon-2026',       2026, '2026-12-20', '报名中', 'https://zuicool.com/event/56048'),
  ('kl-marathon-2026',              2026, '2026-10-03', '报名中', 'https://zuicool.com/event/54134'),
  ('hk-marathon-2027',              2027, '2027-01-17', '报名中', 'https://zuicool.com/event/68638'),
  ('wulanchabu-marathon-2026',      2026, '2026-06-14', '报名中', 'https://zuicool.com/event/55991'),
  ('zhaoyuan-gold-marathon-2026',   2026, '2026-05-02', '已截止', 'https://zuicool.com/event/68105'),
  ('qinhuangdao-marathon-2026',     2026, '2026-05-10', '已截止', 'https://zuicool.com/event/71568'),
  ('gaoping-marathon-2026',         2026, '2026-05-02', '已截止', 'https://zuicool.com/event/57264'),
  ('changbaishan-marathon-2026',    2026, '2026-06-21', '报名中', 'https://reg.zuicool.com/14320'),
  ('linxia-marathon-2026',          2026, '2026-08-01', '待公布', 'https://reg.zuicool.com/16914')
) AS v(canonical, year, race_date, status, reg_url) ON v.canonical = m.canonical_name
ON CONFLICT (marathon_id, year) DO NOTHING;


-- 为 12 个新赛事各绑一个 zuicool 数据源
INSERT INTO marathon_sources (id, marathon_id, source_id, source_url, is_primary, created_at)
SELECT gen_random_uuid(), m.id, '575c8df8-ef99-4ece-9aa2-cba243352478', v.source_url, false, NOW()
FROM marathons m
JOIN (VALUES
  ('borneo-marathon-2026',          'https://zuicool.com/event/57030'),
  ('bordeaux-wine-marathon-2026',   'https://zuicool.com/event/83952'),
  ('phuket-marathon-2026',          'https://zuicool.com/event/16146'),
  ('chiangmai-marathon-2026',       'https://zuicool.com/event/56048'),
  ('kl-marathon-2026',              'https://zuicool.com/event/54134'),
  ('hk-marathon-2027',              'https://zuicool.com/event/68638'),
  ('wulanchabu-marathon-2026',      'https://zuicool.com/event/55991'),
  ('zhaoyuan-gold-marathon-2026',   'https://zuicool.com/event/68105'),
  ('qinhuangdao-marathon-2026',     'https://zuicool.com/event/71568'),
  ('gaoping-marathon-2026',         'https://zuicool.com/event/57264'),
  ('changbaishan-marathon-2026',    'https://reg.zuicool.com/14320'),
  ('linxia-marathon-2026',          'https://reg.zuicool.com/16914')
) AS v(canonical, source_url) ON v.canonical = m.canonical_name
ON CONFLICT (marathon_id, source_id) DO NOTHING;

COMMIT;

-- 验证
SELECT '== Zuicool 绑定数（应为 6 + 3 + 12 = 21）==' AS info;
SELECT COUNT(*) FROM marathon_sources WHERE source_id = '575c8df8-ef99-4ece-9aa2-cba243352478';

SELECT '== 总赛事数（应从 37 → 49）==' AS info;
SELECT COUNT(*) FROM marathons;

SELECT '== 总届次数（应从 41 → 53）==' AS info;
SELECT COUNT(*) FROM marathon_editions;
