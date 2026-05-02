-- 数据库变更：2026-05-02 NowRun 候选去重批次（h）
  -- 来源：NowRun 闹跑 主页 ~490 个 2026 race 候选 → 与 DB 去重 → 选 57 个国内中型/特色赛事入库
  -- 全马：30 | 半马：27
  -- 已完赛：57（race_date < 今天 2026-05-02）
  -- 影响：marathons +57、marathon_editions +57、marathon_sources +57（绑定 nowrun-001-cn-2026, is_primary=false）
  -- 幂等：✅ 全程 ON CONFLICT
  -- 执行：
  --   psql "$DATABASE_URL" -f docs/数据库变更/2026-05-02h-nowrun-cn-batch-58.sql
  --   psql "$PROD_DATABASE_URL" -f docs/数据库变更/2026-05-02h-nowrun-cn-batch-58.sql

  BEGIN;

  -- 1) marathons
  INSERT INTO marathons (name, canonical_name, city, country, description, website_url) VALUES
    ('2026石家庄马拉松', 'shijiazhuang-marathon-2026', '石家庄', 'China', '2026石家庄马拉松，2026-03-29 开赛，石家庄市本地全程马拉松。', NULL),
  ('2026雄安马拉松', 'xiongan-marathon-2026', '雄安', 'China', '2026雄安马拉松，2026-04-12 开赛，雄安市本地全程马拉松。', NULL),
  ('2026保定马拉松', 'baoding-marathon-2026', '保定', 'China', '2026保定马拉松，2026-04-19 开赛，保定市本地全程马拉松。', NULL),
  ('2026芜湖马拉松', 'wuhu-marathon-2026', '芜湖', 'China', '2026芜湖马拉松，2026-03-29 开赛，芜湖市本地全程马拉松。', NULL),
  ('2026蚌埠马拉松', 'bengbu-marathon-2026', '蚌埠', 'China', '2026蚌埠马拉松，2026-04-26 开赛，蚌埠市本地全程马拉松。', NULL),
  ('2026阜阳马拉松', 'fuyang-marathon-2026', '阜阳', 'China', '2026阜阳马拉松，2026-04-12 开赛，阜阳市本地全程马拉松。', NULL),
  ('2026荆州马拉松', 'jingzhou-marathon-2026', '荆州', 'China', '2026荆州马拉松，2026-03-29 开赛，荆州市本地全程马拉松。', NULL),
  ('2026十堰马拉松', 'shiyan-marathon-2026', '十堰', 'China', '2026十堰马拉松，2026-04-19 开赛，十堰市本地全程马拉松。', NULL),
  ('2026咸宁马拉松', 'xianning-marathon-2026', '咸宁', 'China', '2026咸宁马拉松，2026-03-29 开赛，咸宁市本地全程马拉松。', NULL),
  ('2026岳阳马拉松', 'yueyang-marathon-2026', '岳阳', 'China', '2026岳阳马拉松，2026-03-29 开赛，岳阳市本地全程马拉松。', NULL),
  ('2026永州马拉松', 'yongzhou-marathon-2026', '永州', 'China', '2026永州马拉松，2026-04-19 开赛，永州市本地全程马拉松。', NULL),
  ('2026“甲骨文杯”安阳马拉松', 'anyang-marathon-2026', '安阳', 'China', '2026“甲骨文杯”安阳马拉松，2026-03-22 开赛，安阳市本地全程马拉松。', NULL),
  ('2026九江马拉松', 'jiujiang-marathon-2026', '九江', 'China', '2026九江马拉松，2026-03-29 开赛，九江市本地全程马拉松。', NULL),
  ('2026上饶马拉松', 'shangrao-marathon-2026', '上饶', 'China', '2026上饶马拉松，2026-03-22 开赛，上饶市本地全程马拉松。', NULL),
  ('2026济宁马拉松', 'jining-marathon-2026', '济宁', 'China', '2026济宁马拉松，2026-04-06 开赛，济宁市本地全程马拉松。', NULL),
  ('2026德州马拉松', 'dezhou-marathon-2026', '德州', 'China', '2026德州马拉松，2026-04-19 开赛，德州市本地全程马拉松。', NULL),
  ('2026荣成滨海马拉松', 'rongcheng-marathon-2026', '荣成', 'China', '2026荣成滨海马拉松，2026-04-19 开赛，荣成市本地全程马拉松。', NULL),
  ('2026茂名马拉松', 'maoming-marathon-2026', '茂名', 'China', '2026茂名马拉松，2026-01-18 开赛，茂名市本地全程马拉松。', NULL),
  ('2026清远马拉松', 'qingyuan-marathon-2026', '清远', 'China', '2026清远马拉松，2026-03-15 开赛，清远市本地全程马拉松。', NULL),
  ('2026顺德容桂环岛马拉松', 'shunde-ronggui-island-marathon-2026', '佛山', 'China', '2026顺德容桂环岛马拉松，2026-01-03 开赛，佛山市本地全程马拉松。', NULL),
  ('2026柳州马拉松', 'liuzhou-marathon-2026', '柳州', 'China', '2026柳州马拉松，2026-03-29 开赛，柳州市本地全程马拉松。', NULL),
  ('2026钦州马拉松', 'qinzhou-marathon-2026', '钦州', 'China', '2026钦州马拉松，2026-03-22 开赛，钦州市本地全程马拉松。', NULL),
  ('2026宜宾长江首城马拉松', 'yibin-marathon-2026', '宜宾', 'China', '2026宜宾长江首城马拉松，2026-04-19 开赛，宜宾市本地全程马拉松。', NULL),
  ('2026丽水马拉松', 'lishui-zj-marathon-2026', '丽水', 'China', '2026丽水马拉松，2026-03-22 开赛，丽水市本地全程马拉松。', NULL),
  ('2026湖州马拉松', 'huzhou-marathon-2026', '湖州', 'China', '2026湖州马拉松，2026-04-12 开赛，湖州市本地全程马拉松。', NULL),
  ('2026宁海马拉松', 'ninghai-marathon-2026', '宁海', 'China', '2026宁海马拉松，2026-03-08 开赛，宁海市本地全程马拉松。', NULL),
  ('2026奉化马拉松', 'fenghua-marathon-2026', '奉化', 'China', '2026奉化马拉松，2026-03-22 开赛，奉化市本地全程马拉松。', NULL),
  ('2026盐城马拉松', 'yancheng-marathon-2026', '盐城', 'China', '2026盐城马拉松，2026-03-29 开赛，盐城市本地全程马拉松。', NULL),
  ('2026淮安马拉松', 'huaian-marathon-2026', '淮安', 'China', '2026淮安马拉松，2026-04-12 开赛，淮安市本地全程马拉松。', NULL),
  ('2026万宁马拉松', 'wanning-marathon-2026', '万宁', 'China', '2026万宁马拉松，2026-01-25 开赛，万宁市本地全程马拉松。', NULL),
  ('2026北京国际长跑节—北京半程马拉松', 'beijing-international-half-marathon-2026', '北京', 'China', '2026北京国际长跑节—北京半程马拉松，2026-04-12 开赛，北京市本地半程马拉松。', NULL),
  ('2026顺义后沙峪人才社区半程马拉松', 'beijing-shunyi-half-marathon-2026', '北京', 'China', '2026顺义后沙峪人才社区半程马拉松，2026-03-29 开赛，北京市本地半程马拉松。', NULL),
  ('2026中新天津生态城半程马拉松', 'tianjin-shengtai-half-marathon-2026', '天津', 'China', '2026中新天津生态城半程马拉松，2026-04-12 开赛，天津市本地半程马拉松。', NULL),
  ('2026天津东丽湖半程马拉松', 'tianjin-donglihu-half-marathon-2026', '天津', 'China', '2026天津东丽湖半程马拉松，2026-04-12 开赛，天津市本地半程马拉松。', NULL),
  ('2026上海半程马拉松', 'shanghai-half-marathon-2026', '上海', 'China', '2026上海半程马拉松，2026-03-15 开赛，上海市本地半程马拉松。', NULL),
  ('2026上海苏州河半程马拉松', 'shanghai-suzhouriver-half-marathon-2026', '上海', 'China', '2026上海苏州河半程马拉松，2026-03-28 开赛，上海市本地半程马拉松。', NULL),
  ('2026上海黄浦半程马拉松', 'shanghai-huangpu-half-marathon-2026', '上海', 'China', '2026上海黄浦半程马拉松，2026-03-29 开赛，上海市本地半程马拉松。', NULL),
  ('2026沧州大运河半程马拉松', 'cangzhou-grand-canal-half-marathon-2026', '沧州', 'China', '2026沧州大运河半程马拉松，2026-04-06 开赛，沧州市本地半程马拉松。', NULL),
  ('2026南京半程马拉松', 'nanjing-half-marathon-2026', '南京', 'China', '2026南京半程马拉松，2026-03-15 开赛，南京市本地半程马拉松。', NULL),
  ('2026苏州环金鸡湖半程马拉松', 'suzhou-jinjihu-half-marathon-2026', '苏州', 'China', '2026苏州环金鸡湖半程马拉松，2026-03-29 开赛，苏州市本地半程马拉松。', NULL),
  ('2026扬州半程马拉松', 'yangzhou-half-marathon-2026', '扬州', 'China', '2026扬州半程马拉松，2026-03-29 开赛，扬州市本地半程马拉松。', NULL),
  ('2026西湖半程马拉松', 'hangzhou-westlake-half-marathon-2026', '杭州', 'China', '2026西湖半程马拉松，2026-03-22 开赛，杭州市本地半程马拉松。', NULL),
  ('2026桐乡半程马拉松', 'tongxiang-half-marathon-2026', '桐乡', 'China', '2026桐乡半程马拉松，2026-03-22 开赛，桐乡市本地半程马拉松。', NULL),
  ('2026杭州梦想小镇半程马拉松', 'hangzhou-dreamtown-half-marathon-2026', '杭州', 'China', '2026杭州梦想小镇半程马拉松，2026-03-29 开赛，杭州市本地半程马拉松。', NULL),
  ('2026粤港澳大湾区女子半程马拉松', 'gba-women-half-marathon-2026', '广州', 'China', '2026粤港澳大湾区女子半程马拉松，2026-01-01 开赛，广州市本地半程马拉松。', NULL),
  ('2026石狮半程马拉松', 'shishi-half-marathon-2026', '石狮', 'China', '2026石狮半程马拉松，2026-01-01 开赛，石狮市本地半程马拉松。', NULL),
  ('2026马尾琅岐半程马拉松', 'fuzhou-mawei-langqi-half-marathon-2026', '福州', 'China', '2026马尾琅岐半程马拉松，2026-03-22 开赛，福州市本地半程马拉松。', NULL),
  ('2026光泽半程马拉松', 'guangze-half-marathon-2026', '南平', 'China', '2026光泽半程马拉松，2026-03-29 开赛，南平市本地半程马拉松。', NULL),
  ('2026南昌鄱阳湖半程马拉松', 'nanchang-poyanghu-half-marathon-2026', '南昌', 'China', '2026南昌鄱阳湖半程马拉松，2026-03-15 开赛，南昌市本地半程马拉松。', NULL),
  ('2026吉安青原山半程马拉松', 'jian-qingyuanshan-half-marathon-2026', '吉安', 'China', '2026吉安青原山半程马拉松，2026-03-22 开赛，吉安市本地半程马拉松。', NULL),
  ('2026乐安流坑半程马拉松', 'lean-liukeng-half-marathon-2026', '抚州', 'China', '2026乐安流坑半程马拉松，2026-03-29 开赛，抚州市本地半程马拉松。', NULL),
  ('2026合肥骆岗半程马拉松', 'hefei-luogang-half-marathon-2026', '合肥', 'China', '2026合肥骆岗半程马拉松，2026-03-22 开赛，合肥市本地半程马拉松。', NULL),
  ('2026太湖花亭湖半程马拉松', 'taihu-huatinghu-half-marathon-2026', '安庆', 'China', '2026太湖花亭湖半程马拉松，2026-03-15 开赛，安庆市本地半程马拉松。', NULL),
  ('2026阳谷半程马拉松', 'yanggu-half-marathon-2026', '聊城', 'China', '2026阳谷半程马拉松，2026-04-12 开赛，聊城市本地半程马拉松。', NULL),
  ('2026南宁半程马拉松', 'nanning-half-marathon-2026', '南宁', 'China', '2026南宁半程马拉松，2026-03-22 开赛，南宁市本地半程马拉松。', NULL),
  ('2026大渡口半程马拉松', 'chongqing-dadukou-half-marathon-2026', '重庆', 'China', '2026大渡口半程马拉松，2026-03-22 开赛，重庆市本地半程马拉松。', NULL),
  ('2026贵阳贵安樱花半程马拉松', 'guiyang-guian-cherry-half-marathon-2026', '贵阳', 'China', '2026贵阳贵安樱花半程马拉松，2026-03-29 开赛，贵阳市本地半程马拉松。', NULL)
  ON CONFLICT (canonical_name) DO UPDATE SET
    city = EXCLUDED.city,
    description = EXCLUDED.description,
    updated_at = NOW();

  -- 2) marathon_editions（field_sources 用 editionMerge 兼容形态）
  INSERT INTO marathon_editions (marathon_id, year, race_date, registration_status, publish_status, field_sources)
  SELECT m.id, 2026, x.race_date::date, x.status::text, 'published'::text,
    jsonb_build_object('raceDate', jsonb_build_object(
      'source', 'nowrun-001-cn-2026',
      'updatedAt', NOW()::text,
      'value', x.race_date::text
    ))
  FROM (VALUES
    ('shijiazhuang-marathon-2026', '2026-03-29', '已完赛'),
  ('xiongan-marathon-2026', '2026-04-12', '已完赛'),
  ('baoding-marathon-2026', '2026-04-19', '已完赛'),
  ('wuhu-marathon-2026', '2026-03-29', '已完赛'),
  ('bengbu-marathon-2026', '2026-04-26', '已完赛'),
  ('fuyang-marathon-2026', '2026-04-12', '已完赛'),
  ('jingzhou-marathon-2026', '2026-03-29', '已完赛'),
  ('shiyan-marathon-2026', '2026-04-19', '已完赛'),
  ('xianning-marathon-2026', '2026-03-29', '已完赛'),
  ('yueyang-marathon-2026', '2026-03-29', '已完赛'),
  ('yongzhou-marathon-2026', '2026-04-19', '已完赛'),
  ('anyang-marathon-2026', '2026-03-22', '已完赛'),
  ('jiujiang-marathon-2026', '2026-03-29', '已完赛'),
  ('shangrao-marathon-2026', '2026-03-22', '已完赛'),
  ('jining-marathon-2026', '2026-04-06', '已完赛'),
  ('dezhou-marathon-2026', '2026-04-19', '已完赛'),
  ('rongcheng-marathon-2026', '2026-04-19', '已完赛'),
  ('maoming-marathon-2026', '2026-01-18', '已完赛'),
  ('qingyuan-marathon-2026', '2026-03-15', '已完赛'),
  ('shunde-ronggui-island-marathon-2026', '2026-01-03', '已完赛'),
  ('liuzhou-marathon-2026', '2026-03-29', '已完赛'),
  ('qinzhou-marathon-2026', '2026-03-22', '已完赛'),
  ('yibin-marathon-2026', '2026-04-19', '已完赛'),
  ('lishui-zj-marathon-2026', '2026-03-22', '已完赛'),
  ('huzhou-marathon-2026', '2026-04-12', '已完赛'),
  ('ninghai-marathon-2026', '2026-03-08', '已完赛'),
  ('fenghua-marathon-2026', '2026-03-22', '已完赛'),
  ('yancheng-marathon-2026', '2026-03-29', '已完赛'),
  ('huaian-marathon-2026', '2026-04-12', '已完赛'),
  ('wanning-marathon-2026', '2026-01-25', '已完赛'),
  ('beijing-international-half-marathon-2026', '2026-04-12', '已完赛'),
  ('beijing-shunyi-half-marathon-2026', '2026-03-29', '已完赛'),
  ('tianjin-shengtai-half-marathon-2026', '2026-04-12', '已完赛'),
  ('tianjin-donglihu-half-marathon-2026', '2026-04-12', '已完赛'),
  ('shanghai-half-marathon-2026', '2026-03-15', '已完赛'),
  ('shanghai-suzhouriver-half-marathon-2026', '2026-03-28', '已完赛'),
  ('shanghai-huangpu-half-marathon-2026', '2026-03-29', '已完赛'),
  ('cangzhou-grand-canal-half-marathon-2026', '2026-04-06', '已完赛'),
  ('nanjing-half-marathon-2026', '2026-03-15', '已完赛'),
  ('suzhou-jinjihu-half-marathon-2026', '2026-03-29', '已完赛'),
  ('yangzhou-half-marathon-2026', '2026-03-29', '已完赛'),
  ('hangzhou-westlake-half-marathon-2026', '2026-03-22', '已完赛'),
  ('tongxiang-half-marathon-2026', '2026-03-22', '已完赛'),
  ('hangzhou-dreamtown-half-marathon-2026', '2026-03-29', '已完赛'),
  ('gba-women-half-marathon-2026', '2026-01-01', '已完赛'),
  ('shishi-half-marathon-2026', '2026-01-01', '已完赛'),
  ('fuzhou-mawei-langqi-half-marathon-2026', '2026-03-22', '已完赛'),
  ('guangze-half-marathon-2026', '2026-03-29', '已完赛'),
  ('nanchang-poyanghu-half-marathon-2026', '2026-03-15', '已完赛'),
  ('jian-qingyuanshan-half-marathon-2026', '2026-03-22', '已完赛'),
  ('lean-liukeng-half-marathon-2026', '2026-03-29', '已完赛'),
  ('hefei-luogang-half-marathon-2026', '2026-03-22', '已完赛'),
  ('taihu-huatinghu-half-marathon-2026', '2026-03-15', '已完赛'),
  ('yanggu-half-marathon-2026', '2026-04-12', '已完赛'),
  ('nanning-half-marathon-2026', '2026-03-22', '已完赛'),
  ('chongqing-dadukou-half-marathon-2026', '2026-03-22', '已完赛'),
  ('guiyang-guian-cherry-half-marathon-2026', '2026-03-29', '已完赛')
  ) AS x(slug, race_date, status)
  JOIN marathons m ON m.canonical_name = x.slug
  ON CONFLICT (marathon_id, year) DO UPDATE SET
    race_date = EXCLUDED.race_date,
    registration_status = EXCLUDED.registration_status,
    field_sources = EXCLUDED.field_sources,
    updated_at = NOW();

  -- 3) marathon_sources（绑定 nowrun，is_primary=false 因为竞品 + 仅作发现源）
  INSERT INTO marathon_sources (marathon_id, source_id, source_url, is_primary)
  SELECT m.id, 'nowrun-001-cn-2026', x.url, FALSE
  FROM (VALUES
    ('shijiazhuang-marathon-2026', 'https://www.nowrun.cn/race/25'),
  ('xiongan-marathon-2026', 'https://www.nowrun.cn/race/28'),
  ('baoding-marathon-2026', 'https://www.nowrun.cn/race/30'),
  ('wuhu-marathon-2026', 'https://www.nowrun.cn/race/174'),
  ('bengbu-marathon-2026', 'https://www.nowrun.cn/race/180'),
  ('fuyang-marathon-2026', 'https://www.nowrun.cn/race/177'),
  ('jingzhou-marathon-2026', 'https://www.nowrun.cn/race/263'),
  ('shiyan-marathon-2026', 'https://www.nowrun.cn/race/266'),
  ('xianning-marathon-2026', 'https://www.nowrun.cn/race/262'),
  ('yueyang-marathon-2026', 'https://www.nowrun.cn/race/285'),
  ('yongzhou-marathon-2026', 'https://www.nowrun.cn/race/281'),
  ('anyang-marathon-2026', 'https://www.nowrun.cn/race/251'),
  ('jiujiang-marathon-2026', 'https://www.nowrun.cn/race/210'),
  ('shangrao-marathon-2026', 'https://www.nowrun.cn/race/206'),
  ('jining-marathon-2026', 'https://www.nowrun.cn/race/225'),
  ('dezhou-marathon-2026', 'https://www.nowrun.cn/race/230'),
  ('rongcheng-marathon-2026', 'https://www.nowrun.cn/race/229'),
  ('maoming-marathon-2026', 'https://www.nowrun.cn/race/298'),
  ('qingyuan-marathon-2026', 'https://www.nowrun.cn/race/300'),
  ('shunde-ronggui-island-marathon-2026', 'https://www.nowrun.cn/race/296'),
  ('liuzhou-marathon-2026', 'https://www.nowrun.cn/race/328'),
  ('qinzhou-marathon-2026', 'https://www.nowrun.cn/race/326'),
  ('yibin-marathon-2026', 'https://www.nowrun.cn/race/383'),
  ('lishui-zj-marathon-2026', 'https://www.nowrun.cn/race/137'),
  ('huzhou-marathon-2026', 'https://www.nowrun.cn/race/149'),
  ('ninghai-marathon-2026', 'https://www.nowrun.cn/race/130'),
  ('fenghua-marathon-2026', 'https://www.nowrun.cn/race/135'),
  ('yancheng-marathon-2026', 'https://www.nowrun.cn/race/108'),
  ('huaian-marathon-2026', 'https://www.nowrun.cn/race/113'),
  ('wanning-marathon-2026', 'https://www.nowrun.cn/race/348'),
  ('beijing-international-half-marathon-2026', 'https://www.nowrun.cn/race/1'),
  ('beijing-shunyi-half-marathon-2026', 'https://www.nowrun.cn/race/2'),
  ('tianjin-shengtai-half-marathon-2026', 'https://www.nowrun.cn/race/16'),
  ('tianjin-donglihu-half-marathon-2026', 'https://www.nowrun.cn/race/17'),
  ('shanghai-half-marathon-2026', 'https://www.nowrun.cn/race/88'),
  ('shanghai-suzhouriver-half-marathon-2026', 'https://www.nowrun.cn/race/90'),
  ('shanghai-huangpu-half-marathon-2026', 'https://www.nowrun.cn/race/91'),
  ('cangzhou-grand-canal-half-marathon-2026', 'https://www.nowrun.cn/race/27'),
  ('nanjing-half-marathon-2026', 'https://www.nowrun.cn/race/102'),
  ('suzhou-jinjihu-half-marathon-2026', 'https://www.nowrun.cn/race/106'),
  ('yangzhou-half-marathon-2026', 'https://www.nowrun.cn/race/109'),
  ('hangzhou-westlake-half-marathon-2026', 'https://www.nowrun.cn/race/133'),
  ('tongxiang-half-marathon-2026', 'https://www.nowrun.cn/race/140'),
  ('hangzhou-dreamtown-half-marathon-2026', 'https://www.nowrun.cn/race/139'),
  ('gba-women-half-marathon-2026', 'https://www.nowrun.cn/race/295'),
  ('shishi-half-marathon-2026', 'https://www.nowrun.cn/race/189'),
  ('fuzhou-mawei-langqi-half-marathon-2026', 'https://www.nowrun.cn/race/191'),
  ('guangze-half-marathon-2026', 'https://www.nowrun.cn/race/192'),
  ('nanchang-poyanghu-half-marathon-2026', 'https://www.nowrun.cn/race/207'),
  ('jian-qingyuanshan-half-marathon-2026', 'https://www.nowrun.cn/race/208'),
  ('lean-liukeng-half-marathon-2026', 'https://www.nowrun.cn/race/209'),
  ('hefei-luogang-half-marathon-2026', 'https://www.nowrun.cn/race/173'),
  ('taihu-huatinghu-half-marathon-2026', 'https://www.nowrun.cn/race/171'),
  ('yanggu-half-marathon-2026', 'https://www.nowrun.cn/race/226'),
  ('nanning-half-marathon-2026', 'https://www.nowrun.cn/race/324'),
  ('chongqing-dadukou-half-marathon-2026', 'https://www.nowrun.cn/race/362'),
  ('guiyang-guian-cherry-half-marathon-2026', 'https://www.nowrun.cn/race/404')
  ) AS x(slug, url)
  JOIN marathons m ON m.canonical_name = x.slug
  ON CONFLICT (marathon_id, source_id) DO UPDATE SET
    source_url = EXCLUDED.source_url;

  COMMIT;

  -- 校验
  SELECT
    (SELECT COUNT(*) FROM marathons WHERE canonical_name = ANY (ARRAY[
      'shijiazhuang-marathon-2026', 'xiongan-marathon-2026', 'baoding-marathon-2026', 'wuhu-marathon-2026', 'bengbu-marathon-2026', 'fuyang-marathon-2026', 'jingzhou-marathon-2026', 'shiyan-marathon-2026', 'xianning-marathon-2026', 'yueyang-marathon-2026', 'yongzhou-marathon-2026', 'anyang-marathon-2026', 'jiujiang-marathon-2026', 'shangrao-marathon-2026', 'jining-marathon-2026', 'dezhou-marathon-2026', 'rongcheng-marathon-2026', 'maoming-marathon-2026', 'qingyuan-marathon-2026', 'shunde-ronggui-island-marathon-2026', 'liuzhou-marathon-2026', 'qinzhou-marathon-2026', 'yibin-marathon-2026', 'lishui-zj-marathon-2026', 'huzhou-marathon-2026', 'ninghai-marathon-2026', 'fenghua-marathon-2026', 'yancheng-marathon-2026', 'huaian-marathon-2026', 'wanning-marathon-2026', 'beijing-international-half-marathon-2026', 'beijing-shunyi-half-marathon-2026', 'tianjin-shengtai-half-marathon-2026', 'tianjin-donglihu-half-marathon-2026', 'shanghai-half-marathon-2026', 'shanghai-suzhouriver-half-marathon-2026', 'shanghai-huangpu-half-marathon-2026', 'cangzhou-grand-canal-half-marathon-2026', 'nanjing-half-marathon-2026', 'suzhou-jinjihu-half-marathon-2026', 'yangzhou-half-marathon-2026', 'hangzhou-westlake-half-marathon-2026', 'tongxiang-half-marathon-2026', 'hangzhou-dreamtown-half-marathon-2026', 'gba-women-half-marathon-2026', 'shishi-half-marathon-2026', 'fuzhou-mawei-langqi-half-marathon-2026', 'guangze-half-marathon-2026', 'nanchang-poyanghu-half-marathon-2026', 'jian-qingyuanshan-half-marathon-2026', 'lean-liukeng-half-marathon-2026', 'hefei-luogang-half-marathon-2026', 'taihu-huatinghu-half-marathon-2026', 'yanggu-half-marathon-2026', 'nanning-half-marathon-2026', 'chongqing-dadukou-half-marathon-2026', 'guiyang-guian-cherry-half-marathon-2026'
    ])) AS marathons_present,
    (SELECT COUNT(*) FROM marathon_editions me JOIN marathons m ON m.id=me.marathon_id WHERE me.year=2026 AND m.canonical_name = ANY (ARRAY[
      'shijiazhuang-marathon-2026', 'xiongan-marathon-2026', 'baoding-marathon-2026', 'wuhu-marathon-2026', 'bengbu-marathon-2026', 'fuyang-marathon-2026', 'jingzhou-marathon-2026', 'shiyan-marathon-2026', 'xianning-marathon-2026', 'yueyang-marathon-2026', 'yongzhou-marathon-2026', 'anyang-marathon-2026', 'jiujiang-marathon-2026', 'shangrao-marathon-2026', 'jining-marathon-2026', 'dezhou-marathon-2026', 'rongcheng-marathon-2026', 'maoming-marathon-2026', 'qingyuan-marathon-2026', 'shunde-ronggui-island-marathon-2026', 'liuzhou-marathon-2026', 'qinzhou-marathon-2026', 'yibin-marathon-2026', 'lishui-zj-marathon-2026', 'huzhou-marathon-2026', 'ninghai-marathon-2026', 'fenghua-marathon-2026', 'yancheng-marathon-2026', 'huaian-marathon-2026', 'wanning-marathon-2026', 'beijing-international-half-marathon-2026', 'beijing-shunyi-half-marathon-2026', 'tianjin-shengtai-half-marathon-2026', 'tianjin-donglihu-half-marathon-2026', 'shanghai-half-marathon-2026', 'shanghai-suzhouriver-half-marathon-2026', 'shanghai-huangpu-half-marathon-2026', 'cangzhou-grand-canal-half-marathon-2026', 'nanjing-half-marathon-2026', 'suzhou-jinjihu-half-marathon-2026', 'yangzhou-half-marathon-2026', 'hangzhou-westlake-half-marathon-2026', 'tongxiang-half-marathon-2026', 'hangzhou-dreamtown-half-marathon-2026', 'gba-women-half-marathon-2026', 'shishi-half-marathon-2026', 'fuzhou-mawei-langqi-half-marathon-2026', 'guangze-half-marathon-2026', 'nanchang-poyanghu-half-marathon-2026', 'jian-qingyuanshan-half-marathon-2026', 'lean-liukeng-half-marathon-2026', 'hefei-luogang-half-marathon-2026', 'taihu-huatinghu-half-marathon-2026', 'yanggu-half-marathon-2026', 'nanning-half-marathon-2026', 'chongqing-dadukou-half-marathon-2026', 'guiyang-guian-cherry-half-marathon-2026'
    ])) AS editions_present,
    (SELECT COUNT(*) FROM marathon_sources ms JOIN marathons m ON m.id=ms.marathon_id WHERE ms.source_id='nowrun-001-cn-2026' AND m.canonical_name = ANY (ARRAY[
      'shijiazhuang-marathon-2026', 'xiongan-marathon-2026', 'baoding-marathon-2026', 'wuhu-marathon-2026', 'bengbu-marathon-2026', 'fuyang-marathon-2026', 'jingzhou-marathon-2026', 'shiyan-marathon-2026', 'xianning-marathon-2026', 'yueyang-marathon-2026', 'yongzhou-marathon-2026', 'anyang-marathon-2026', 'jiujiang-marathon-2026', 'shangrao-marathon-2026', 'jining-marathon-2026', 'dezhou-marathon-2026', 'rongcheng-marathon-2026', 'maoming-marathon-2026', 'qingyuan-marathon-2026', 'shunde-ronggui-island-marathon-2026', 'liuzhou-marathon-2026', 'qinzhou-marathon-2026', 'yibin-marathon-2026', 'lishui-zj-marathon-2026', 'huzhou-marathon-2026', 'ninghai-marathon-2026', 'fenghua-marathon-2026', 'yancheng-marathon-2026', 'huaian-marathon-2026', 'wanning-marathon-2026', 'beijing-international-half-marathon-2026', 'beijing-shunyi-half-marathon-2026', 'tianjin-shengtai-half-marathon-2026', 'tianjin-donglihu-half-marathon-2026', 'shanghai-half-marathon-2026', 'shanghai-suzhouriver-half-marathon-2026', 'shanghai-huangpu-half-marathon-2026', 'cangzhou-grand-canal-half-marathon-2026', 'nanjing-half-marathon-2026', 'suzhou-jinjihu-half-marathon-2026', 'yangzhou-half-marathon-2026', 'hangzhou-westlake-half-marathon-2026', 'tongxiang-half-marathon-2026', 'hangzhou-dreamtown-half-marathon-2026', 'gba-women-half-marathon-2026', 'shishi-half-marathon-2026', 'fuzhou-mawei-langqi-half-marathon-2026', 'guangze-half-marathon-2026', 'nanchang-poyanghu-half-marathon-2026', 'jian-qingyuanshan-half-marathon-2026', 'lean-liukeng-half-marathon-2026', 'hefei-luogang-half-marathon-2026', 'taihu-huatinghu-half-marathon-2026', 'yanggu-half-marathon-2026', 'nanning-half-marathon-2026', 'chongqing-dadukou-half-marathon-2026', 'guiyang-guian-cherry-half-marathon-2026'
    ])) AS bindings_present;
  