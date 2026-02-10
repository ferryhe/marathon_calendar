import { db } from "../server/db";
import {
  marathons,
  marathonEditions,
  marathonSources,
  sources,
} from "../shared/schema";

// Sample marathon data to seed
const marathonSeedData = [
  {
    name: "2026首届长兴太湖9号公路玫瑰跑嘉年华",
    canonicalName: "changxing-taihu-rose-run-2026",
    city: "湖州",
    country: "China",
    description: "沿太湖浪漫公路展开的花海跑，兼顾城市与自然风景。春季花瓣节式氛围，适合亲子与新手体验。",
    websiteUrl: null,
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-07",
        registrationStatus: "报名中",
        registrationOpenDate: "2026-01-15",
        registrationCloseDate: "2026-02-09",
      }
    ]
  },
  {
    name: "2026上海樱花节女子10公里精英赛",
    canonicalName: "shanghai-cherry-blossom-run-2026",
    city: "上海",
    country: "China",
    description: "滨江公益10公里，穿越宝山新城与樱花大道。清晨日出启跑，连接企业跑团与社区的慈善氛围。",
    websiteUrl: "https://shanghai-cherry-run.example.com",
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-08",
        registrationStatus: "报名中",
        registrationOpenDate: "2026-01-10",
        registrationCloseDate: "2026-02-09",
      }
    ]
  },
  {
    name: "2026武汉空港国际商务新城半程马拉松",
    canonicalName: "wuhan-airport-half-marathon-2026",
    city: "武汉",
    country: "China",
    description: "环武汉空港商务区的半程马，夜色下有灯光长廊与打卡点。江边赛道深受区域跑团与航空业员工欢迎。",
    websiteUrl: null,
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-15",
        registrationStatus: "即将开始",
        registrationOpenDate: "2026-01-20",
        registrationCloseDate: "2026-01-26",
      }
    ]
  },
  {
    name: "2026曲靖罗平花海马拉松",
    canonicalName: "qujing-luoping-flower-sea-marathon-2026",
    city: "曲靖",
    country: "China",
    description: "在罗平花海与山峦之间展开的高海拔全程马拉松，空气清新，坡道与花海交错。",
    websiteUrl: "http://qujing-marathon.example.com",
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-15",
        registrationStatus: "已截止",
        registrationOpenDate: "2026-01-01",
        registrationCloseDate: "2026-02-23",
      }
    ]
  },
  {
    name: "2026重庆万州环湖马拉松",
    canonicalName: "chongqing-wanzhou-lake-marathon-2026",
    city: "万州",
    country: "China",
    description: "环绕万州湖泊的全程与半程双赛事，并配套当代艺术主题展。艺术周氛围浓厚，路跑与现场演出同步进行。",
    websiteUrl: null,
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-15",
        registrationStatus: "报名中",
        registrationOpenDate: "2026-01-15",
        registrationCloseDate: "2026-01-30",
      }
    ]
  },
  {
    name: "2026临平半程马拉松",
    canonicalName: "linping-half-marathon-2026",
    city: "杭州",
    country: "China",
    description: "贯穿临平中心区的夜半程与10公里联赛，灯光与运河交织，提供轻松节奏与能量补给。",
    websiteUrl: null,
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-22",
        registrationStatus: "报名中",
        registrationOpenDate: "2026-01-20",
        registrationCloseDate: "2026-02-28",
      }
    ]
  },
  {
    name: "2026贵州·仁怀马拉松",
    canonicalName: "guizhou-renhuai-marathon-2026",
    city: "仁怀",
    country: "China",
    description: "沿湿地与森林的小径展开的仁怀全程马拉松，兼顾生态观光，展示红泥土与鸟类生态。",
    websiteUrl: null,
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-22",
        registrationStatus: "报名中",
        registrationOpenDate: "2026-01-20",
        registrationCloseDate: "2026-02-25",
      }
    ]
  },
  {
    name: "2026南京溧水半程马拉松",
    canonicalName: "nanjing-lishui-half-marathon-2026",
    city: "南京",
    country: "China",
    description: "溧水植物园半马，穿梭湖畔与温室花房，晚春花木盛开适合俱乐部组团。",
    websiteUrl: null,
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-22",
        registrationStatus: "即将开始",
        registrationOpenDate: "2026-01-25",
        registrationCloseDate: "2026-01-31",
      }
    ]
  },
  {
    name: "2026东京马拉松",
    canonicalName: "tokyo-marathon-2026",
    city: "东京",
    country: "Japan",
    description: "世界六大满贯之一，清晨从皇居出发穿越都市核心，沿途樱花点缀。",
    websiteUrl: "https://www.marathon.tokyo/en/",
    editions: [
      {
        year: 2026,
        raceDate: "2026-03-01",
        registrationStatus: "已截止",
        registrationOpenDate: "2025-08-01",
        registrationCloseDate: "2025-09-15",
      }
    ]
  },
  {
    name: "2026巴黎马拉松",
    canonicalName: "paris-marathon-2026",
    city: "巴黎",
    country: "France",
    description: "沿塞纳河跑过卢浮宫与凯旋门的浪漫路线，赛前暖场由巴黎街头乐队与艺术团体助威。",
    websiteUrl: "https://www.schneiderelectricparismarathon.com/en/",
    editions: [
      {
        year: 2026,
        raceDate: "2026-04-05",
        registrationStatus: "报名中",
        registrationOpenDate: "2025-10-01",
        registrationCloseDate: "2026-03-01",
      }
    ]
  },
  {
    name: "2026波士顿马拉松",
    canonicalName: "boston-marathon-2026",
    city: "波士顿",
    country: "USA",
    description: "历史最悠久的马拉松，以严格的BQ资格闻名，挑战换道山与心跳山中段。",
    websiteUrl: "https://www.baa.org/races/boston-marathon",
    editions: [
      {
        year: 2026,
        raceDate: "2026-04-20",
        registrationStatus: "已截止",
        registrationOpenDate: "2025-09-01",
        registrationCloseDate: "2025-09-30",
      }
    ]
  },
  {
    name: "2026伦敦马拉松",
    canonicalName: "london-marathon-2026",
    city: "伦敦",
    country: "UK",
    description: "沿泰晤士河与皇家公园的慈善盛事路线，起点于泰晤士桥后进入绿茵皇家公园。",
    websiteUrl: "https://www.londonmarathon.com/",
    editions: [
      {
        year: 2026,
        raceDate: "2026-04-26",
        registrationStatus: "已截止",
        registrationOpenDate: "2025-10-01",
        registrationCloseDate: "2025-10-30",
      }
    ]
  },
  {
    name: "2026柏林马拉松",
    canonicalName: "berlin-marathon-2026",
    city: "柏林",
    country: "Germany",
    description: "世界纪录之路，现代化城市景观与平坦路段兼具，柏林墙与广场串联赛道。",
    websiteUrl: "https://www.bmw-berlin-marathon.com/en/",
    editions: [
      {
        year: 2026,
        raceDate: "2026-09-27",
        registrationStatus: "即将开始",
        registrationOpenDate: "2026-02-01",
        registrationCloseDate: "2026-04-30",
      }
    ]
  },
  {
    name: "2026芝加哥马拉松",
    canonicalName: "chicago-marathon-2026",
    city: "芝加哥",
    country: "USA",
    description: "湖滨大道与高楼剪影交织的平坦全马，扁平赛道配合热情沿线观众适合冲刺成绩。",
    websiteUrl: "https://www.chicagomarathon.com/",
    editions: [
      {
        year: 2026,
        raceDate: "2026-10-11",
        registrationStatus: "即将开始",
        registrationOpenDate: "2026-03-01",
        registrationCloseDate: "2026-09-01",
      }
    ]
  },
  {
    name: "2026纽约城市马拉松",
    canonicalName: "new-york-city-marathon-2026",
    city: "纽约",
    country: "USA",
    description: "串联五大区的大型马拉松，路线跨越多座桥梁，群众声浪与街头乐队相伴。",
    websiteUrl: "https://www.tcsnycmarathon.org/",
    editions: [
      {
        year: 2026,
        raceDate: "2026-11-01",
        registrationStatus: "即将开始",
        registrationOpenDate: "2026-02-01",
        registrationCloseDate: "2026-04-30",
      }
    ]
  },
];

const sourceSeedData = [
  // Layer 1: official websites (high priority)
  {
    name: "赛事官方网站（直采）",
    type: "official",
    strategy: "HTML",
    baseUrl: null,
    priority: 100,
    isActive: true,
    notes: "第一层核心数据源；按赛事官网直采，数据权威性最高",
  },
  {
    name: "北京马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.beijing-marathon.com",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "上海马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.shang-ma.com",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "厦门马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.xmim.org",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "广州马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.gzmarathon.com",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "杭州马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.hzim.org",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "成都马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.chengdumarathon.com",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "武汉马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.wuhanmarathon.com",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告",
  },
  {
    name: "深圳马拉松官网",
    type: "official",
    strategy: "HTML",
    baseUrl: "https://www.szmarthon.com",
    priority: 95,
    isActive: true,
    notes: "第一层核心数据源；官网示例来源于数据源调研报告（原文URL）",
  },

  // Layer 1: major registration platforms
  {
    name: "最酷体育（Zuicool）",
    type: "platform",
    strategy: "HTML",
    baseUrl: "https://www.zuicool.com",
    priority: 90,
    isActive: false,
    notes: "第一层核心数据源；国内主流马拉松报名平台",
  },
  {
    name: "爱燃烧（iranshao）",
    type: "platform",
    strategy: "HTML",
    baseUrl: "https://iranshao.com",
    priority: 88,
    isActive: false,
    notes: "第一层核心数据源；跑步社区+赛事报名",
  },
  {
    name: "芝华安方体育",
    type: "platform",
    strategy: "HTML",
    baseUrl: "https://www.zhihuianfang.com",
    priority: 86,
    isActive: false,
    notes: "第一层核心数据源；专业赛事运营公司",
  },

  // Layer 2: supplementary platforms
  {
    name: "42旅（42travel）",
    type: "platform",
    strategy: "HTML",
    baseUrl: "https://www.42travel.com",
    priority: 75,
    isActive: false,
    notes: "第二层补充数据源；国内外赛事聚合",
  },
  {
    name: "悦跑圈（JoyRun）",
    type: "platform",
    strategy: "HTML",
    baseUrl: "https://www.thejoyrun.com",
    priority: 70,
    isActive: false,
    notes: "第二层补充数据源；跑步APP+赛事信息",
  },

  // Layer 3: discovery channels
  {
    name: "Google 搜索",
    type: "search",
    strategy: "API",
    baseUrl: "https://www.google.com/search",
    priority: 40,
    isActive: false,
    notes: "第三层发现数据源；用于发现新增/小型赛事",
  },
  {
    name: "Bing 搜索",
    type: "search",
    strategy: "API",
    baseUrl: "https://www.bing.com/search",
    priority: 40,
    isActive: false,
    notes: "第三层发现数据源；用于发现新增/小型赛事",
  },
  {
    name: "社交媒体与跑步社区",
    type: "social",
    strategy: "HTML",
    baseUrl: null,
    priority: 30,
    isActive: false,
    notes: "第三层发现数据源；公众号/微博/小红书/抖音等",
  },
] as const;

const officialSourceByCity: Record<string, string> = {
  北京: "北京马拉松官网",
  上海: "上海马拉松官网",
  厦门: "厦门马拉松官网",
  广州: "广州马拉松官网",
  杭州: "杭州马拉松官网",
  成都: "成都马拉松官网",
  武汉: "武汉马拉松官网",
  深圳: "深圳马拉松官网",
};

async function seed() {
  if (!db) {
    console.error("Database not configured. Please set DATABASE_URL environment variable.");
    process.exit(1);
  }

  console.log("Starting marathon data seed...");

  try {
    const seededMarathons: Array<{
      id: string;
      name: string;
      city: string | null;
      country: string | null;
      websiteUrl: string | null;
    }> = [];

    for (const data of marathonSeedData) {
      const { editions, ...marathonData } = data;

      // Insert or update marathon
      const [marathon] = await db
        .insert(marathons)
        .values({
          ...marathonData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: marathons.canonicalName,
          set: {
            ...marathonData,
            updatedAt: new Date(),
          },
        })
        .returning();

      console.log(`✓ Inserted/Updated marathon: ${marathon.name}`);
      seededMarathons.push({
        id: marathon.id,
        name: marathon.name,
        city: marathon.city,
        country: marathon.country,
        websiteUrl: marathon.websiteUrl,
      });

      // Insert editions
      for (const edition of editions) {
        await db
          .insert(marathonEditions)
          .values({
            marathonId: marathon.id,
            ...edition,
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
        
        console.log(`  ✓ Added edition for year ${edition.year}`);
      }
    }

    console.log("\nSeeding source catalog...");
    const sourceMap = new Map<
      string,
      { id: string; baseUrl: string | null; name: string }
    >();

    for (const sourceData of sourceSeedData) {
      const [sourceRecord] = await db
        .insert(sources)
        .values({
          ...sourceData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sources.name,
          set: {
            type: sourceData.type,
            strategy: sourceData.strategy,
            baseUrl: sourceData.baseUrl,
            priority: sourceData.priority,
            isActive: sourceData.isActive,
            notes: sourceData.notes,
            updatedAt: new Date(),
          },
        })
        .returning();

      sourceMap.set(sourceRecord.name, {
        id: sourceRecord.id,
        baseUrl: sourceRecord.baseUrl,
        name: sourceRecord.name,
      });

      console.log(`✓ Upserted source: ${sourceRecord.name}`);
    }

    console.log("\nLinking marathons to sources...");

    const upsertMarathonSource = async (
      marathonId: string,
      sourceName: string,
      sourceUrl: string,
      isPrimary: boolean,
    ) => {
      const sourceRecord = sourceMap.get(sourceName);
      if (!sourceRecord) {
        console.warn(`  ⚠ Source not found: ${sourceName}`);
        return;
      }

      await db
        .insert(marathonSources)
        .values({
          marathonId,
          sourceId: sourceRecord.id,
          sourceUrl,
          isPrimary,
          lastCheckedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marathonSources.marathonId, marathonSources.sourceId],
          set: {
            sourceUrl,
            isPrimary,
            lastCheckedAt: new Date(),
          },
        });
    };

    let sourceLinks = 0;

    for (const marathon of seededMarathons) {
      const plannedLinks: Array<{
        sourceName: string;
        sourceUrl: string;
        isPrimary: boolean;
      }> = [];
      let hasPrimary = false;

      const cityOfficialSource = marathon.city
        ? officialSourceByCity[marathon.city]
        : undefined;
      const cityOfficialRecord = cityOfficialSource
        ? sourceMap.get(cityOfficialSource)
        : undefined;

      if (cityOfficialRecord?.baseUrl) {
        plannedLinks.push({
          sourceName: cityOfficialRecord.name,
          sourceUrl: cityOfficialRecord.baseUrl,
          isPrimary: true,
        });
        hasPrimary = true;
      } else if (marathon.websiteUrl) {
        plannedLinks.push({
          sourceName: "赛事官方网站（直采）",
          sourceUrl: marathon.websiteUrl,
          isPrimary: true,
        });
        hasPrimary = true;
      }
      // Note:
      // Registration platforms/search engines are kept in the source catalog,
      // but should not be linked to every marathon as a single baseUrl.
      // They belong to a later "discovery" pipeline (search -> match -> bind).

      if (!hasPrimary && plannedLinks.length > 0) {
        plannedLinks[0].isPrimary = true;
      }

      for (const link of plannedLinks) {
        await upsertMarathonSource(
          marathon.id,
          link.sourceName,
          link.sourceUrl,
          link.isPrimary,
        );
        sourceLinks += 1;
      }

      console.log(`✓ Linked sources for marathon: ${marathon.name}`);
    }

    console.log("\n✅ Seed completed successfully!");
    console.log(`Seeded ${marathonSeedData.length} marathons`);
    console.log(`Seeded ${sourceSeedData.length} sources`);
    console.log(`Upserted ${sourceLinks} marathon-source links`);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed().then(() => process.exit(0));
