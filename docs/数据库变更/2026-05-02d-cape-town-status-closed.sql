-- =============================================================================
-- 2026-05-02d  开普敦马拉松 报名状态修正：报名中 → 已截止
-- 来源：https://capetownmarathon.com/marathon/
--   官方原文："BALLOT & SPONSORED MARATHON ENTRIES CLOSED"
--   /international-entry/ 页面只剩 Marathon Tours / Sports Tours International
--   等旅行社打包名额（含机票酒店），不算正常的赛事报名通道
-- 距赛事 2026-05-24 仅 22 天，已经不可能直接报名
-- 用法：psql "$PROD_DATABASE_URL" -f docs/数据库变更/2026-05-02d-cape-town-status-closed.sql
-- =============================================================================

BEGIN;

UPDATE marathon_editions e
SET registration_status = '已截止',
    registration_url = 'https://capetownmarathon.com/marathon/',
    field_sources = COALESCE(e.field_sources, '{}'::jsonb) || jsonb_build_object(
      'registrationStatus', jsonb_build_object(
        'source','web_search',
        'url','https://capetownmarathon.com/marathon/',
        'at', NOW()::text,
        'note','Ballot & Sponsored entries closed; only international tour-operator packages remain'
      ),
      'registrationUrl', jsonb_build_object(
        'source','web_search',
        'url','https://capetownmarathon.com/marathon/',
        'at', NOW()::text
      )
    ),
    updated_at = NOW()
FROM marathons m
WHERE e.marathon_id = m.id
  AND m.canonical_name = 'cape-town-marathon-2026'
  AND e.year = 2026;

-- 校验
SELECT m.canonical_name, e.race_date::text, e.registration_status, e.registration_url
FROM marathons m JOIN marathon_editions e ON e.marathon_id = m.id
WHERE m.canonical_name = 'cape-town-marathon-2026' AND e.year = 2026;

COMMIT;
