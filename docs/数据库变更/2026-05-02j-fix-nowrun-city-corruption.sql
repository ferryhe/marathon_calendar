-- 数据库变更：2026-05-02j 修复批次 i 中 19 条被解析污染的 city 字段
  -- 原始问题：nowrun 详情页正文里有 "### 🏙️ XXX区 · 城" 行，我的 city 解析正则贪心匹配到了 "区" 结尾，把 markdown 标题吞进去
  -- 修正策略：北京/天津/上海/重庆 下辖区一律归到主城名（与现有约定一致），其他截断的回退到地市名

  BEGIN;

  UPDATE marathons
  SET city = CASE canonical_name
      WHEN 'nowrun-8-2026' THEN '北京'
    WHEN 'nowrun-9-2026' THEN '北京'
    WHEN 'nowrun-10-2026' THEN '北京'
    WHEN 'nowrun-11-2026' THEN '北京'
    WHEN 'nowrun-13-2026' THEN '北京'
    WHEN 'nowrun-15-2026' THEN '北京'
    WHEN 'nowrun-20-2026' THEN '天津'
    WHEN 'nowrun-21-2026' THEN '天津'
    WHEN 'nowrun-23-2026' THEN '天津'
    WHEN 'nowrun-95-2026' THEN '上海'
    WHEN 'nowrun-97-2026' THEN '上海'
    WHEN 'nowrun-369-2026' THEN '重庆'
    WHEN 'nowrun-370-2026' THEN '重庆'
    WHEN 'nowrun-372-2026' THEN '重庆'
    WHEN 'nowrun-373-2026' THEN '重庆'
    WHEN 'nowrun-374-2026' THEN '重庆'
    WHEN 'nowrun-357-2026' THEN '重庆'
    WHEN 'nowrun-316-2026' THEN '珠海'
    WHEN 'nowrun-483-2026' THEN '塔城'
    END,
    updated_at = NOW()
  WHERE canonical_name IN ('nowrun-8-2026', 'nowrun-9-2026', 'nowrun-10-2026', 'nowrun-11-2026', 'nowrun-13-2026', 'nowrun-15-2026', 'nowrun-20-2026', 'nowrun-21-2026', 'nowrun-23-2026', 'nowrun-95-2026', 'nowrun-97-2026', 'nowrun-369-2026', 'nowrun-370-2026', 'nowrun-372-2026', 'nowrun-373-2026', 'nowrun-374-2026', 'nowrun-357-2026', 'nowrun-316-2026', 'nowrun-483-2026');

  COMMIT;

  -- 校验
  SELECT canonical_name, name, city
  FROM marathons
  WHERE canonical_name IN ('nowrun-8-2026', 'nowrun-9-2026', 'nowrun-10-2026', 'nowrun-11-2026', 'nowrun-13-2026', 'nowrun-15-2026', 'nowrun-20-2026', 'nowrun-21-2026', 'nowrun-23-2026', 'nowrun-95-2026', 'nowrun-97-2026', 'nowrun-369-2026', 'nowrun-370-2026', 'nowrun-372-2026', 'nowrun-373-2026', 'nowrun-374-2026', 'nowrun-357-2026', 'nowrun-316-2026', 'nowrun-483-2026')
  ORDER BY canonical_name;
  