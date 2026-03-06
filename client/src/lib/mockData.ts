export type MarathonEventType =
  | "全程马拉松"
  | "半程马拉松"
  | "10公里"
  | "5公里"
  | "越野"
  | "其他";

export type DomesticCertification = "国内 · 白金" | "国内 · 金" | "国内 · 银" | "国内 · 铜";
export type CaaCertification = "田协 · A1" | "田协 · A2" | "田协 · B" | "田协 · C";
export type WorldCertification =
  | "世界田联 · 白金标牌"
  | "世界田联 · 金标牌"
  | "世界田联 · 精英标牌"
  | "世界田联 · 标牌赛事";
export type MarathonCertification =
  | DomesticCertification
  | CaaCertification
  | WorldCertification
  | "无认证";

export interface MarathonEvent {
  id: string;
  name: string;
  year: number;
  month: number;
  day: number;
  location: {
    province?: string;
    city: string;
    country: "China" | "Overseas";
  };
  type: MarathonEventType[];
  certification?: MarathonCertification;
  registrationStatus: "报名中" | "即将开始" | "已截止";
  registrationDeadline?: string;
  website?: string;
  description?: string;
  tags?: string[];
  requirements?: string;
  reviews?: {
    averageRating: number;
    count: number;
    topComments: {
      user: string;
      content: string;
      likes: number;
    }[];
  };
}

export const MOCK_MARATHONS: MarathonEvent[] = [
  {
    id: "cn-1",
    name: "2026首届长兴太湖9号公路玫瑰跑嘉年华",
    year: 2026,
    month: 3,
    day: 7,
    location: { province: "浙江", city: "湖州", country: "China" },
    type: ["10公里", "5公里"],
    certification: "国内 · 银",
    registrationStatus: "报名中",
    registrationDeadline: "2026-02-09",
    requirements: "无",
    description: "沿太湖浪漫公路展开的花海跑，兼顾城市与自然风景。春季花瓣节式氛围，适合亲子与新手体验。",
    tags: ["湖滨花海", "城市活力", "亲子友好"],
    reviews: {
      averageRating: 4.5,
      count: 128,
      topComments: [
        { user: "跑者小张", content: "赛道风景确实不错，太湖边的风很舒服。", likes: 45 },
        { user: "马拉松老兵", content: "补给站设置很科学，志愿者非常热情。", likes: 32 }
      ]
    }
  },
  {
    id: "cn-2",
    name: "2026上海樱花节女子10公里精英赛",
    year: 2026,
    month: 3,
    day: 8,
    location: { province: "上海", city: "宝山区", country: "China" },
    type: ["10公里"],
    certification: "国内 · 金",
    registrationStatus: "报名中",
    registrationDeadline: "2026-02-09",
    requirements: "仅限女性跑者",
    description: "滨江公益10公里，穿越宝山新城与樱花大道。清晨日出启跑，连接企业跑团与社区的慈善氛围。",
    tags: ["滨江绿道", "慈善联跑", "日出启程"],
    website: "https://shanghai-cherry-run.example.com",
    reviews: {
      averageRating: 4.8,
      count: 256,
      topComments: [
        { user: "樱花妹", content: "每年的奖牌都超级好看，冲着奖牌也要去！", likes: 88 },
        { user: "不跑步会死", content: "樱花盛开的时候跑真的太美了，非常有仪式感。", likes: 54 }
      ]
    }
  },
  {
    id: "cn-3",
    name: "2026武汉空港国际商务新城半程马拉松",
    year: 2026,
    month: 3,
    day: 15,
    location: { province: "湖北", city: "武汉", country: "China" },
    type: ["半程马拉松"],
    certification: "田协 · B",
    registrationStatus: "即将开始",
    registrationDeadline: "2026-01-26",
    description: "环武汉空港商务区的半程马，夜色下有灯光长廊与打卡点。江边赛道深受区域跑团与航空业员工欢迎。",
    tags: ["商务绿廊", "江边夜色", "跑团聚集"]
  },
  {
    id: "cn-4",
    name: "2026曲靖罗平花海马拉松",
    year: 2026,
    month: 3,
    day: 15,
    location: { province: "云南", city: "曲靖", country: "China" },
    type: ["全程马拉松"],
    certification: "田协 · A1",
    registrationStatus: "已截止",
    registrationDeadline: "2026-02-23",
    description: "在罗平花海与山峦之间展开的高海拔全程马拉松，空气清新，坡道与花海交错。",
    tags: ["山地线路", "高海拔体验", "A认证"],
    website: "http://qujing-marathon.example.com"
  },
  {
    id: "cn-5",
    name: "2026重庆万州环湖马拉松",
    year: 2026,
    month: 3,
    day: 15,
    location: { province: "重庆", city: "万州区", country: "China" },
    type: ["全程马拉松", "半程马拉松"],
    certification: "田协 · A2",
    registrationStatus: "报名中",
    registrationDeadline: "2026-01-30",
    description: "环绕万州湖泊的全程与半程双赛事，并配套当代艺术主题展。艺术周氛围浓厚，路跑与现场演出同步进行。",
    tags: ["湖景艺术", "双赛体验", "舞台演出"]
  },
  {
    id: "cn-6",
    name: "2026临平半程马拉松",
    year: 2026,
    month: 3,
    day: 22,
    location: { province: "浙江", city: "杭州", country: "China" },
    type: ["半程马拉松", "10公里"],
    certification: "田协 · C",
    registrationStatus: "报名中",
    registrationDeadline: "2026-02-28",
    description: "贯穿临平中心区的夜半程与10公里联赛，灯光与运河交织，提供轻松节奏与能量补给。",
    tags: ["夜跑光影", "运河沿线", "城市节奏"]
  },
  {
    id: "cn-7",
    name: "2026贵州·仁怀马拉松",
    year: 2026,
    month: 3,
    day: 22,
    location: { province: "贵州", city: "仁怀", country: "China" },
    type: ["全程马拉松"],
    certification: "国内 · 铜",
    registrationStatus: "报名中",
    registrationDeadline: "2026-02-25",
    description: "沿湿地与森林的小径展开的仁怀全程马拉松，兼顾生态观光，展示红泥土与鸟类生态。",
    tags: ["湿地生态", "森林弯道", "C认证"]
  },
  {
    id: "cn-8",
    name: "2026南京溧水半程马拉松",
    year: 2026,
    month: 3,
    day: 22,
    location: { province: "江苏", city: "南京", country: "China" },
    type: ["半程马拉松"],
    certification: "田协 · A1",
    registrationStatus: "即将开始",
    registrationDeadline: "2026-01-31",
    description: "溧水植物园半马，穿梭湖畔与温室花房，晚春花木盛开适合俱乐部组团。",
    tags: ["植物园路线", "花木景致", "春季限定"]
  },
  {
    id: "int-1",
    name: "2026东京马拉松",
    year: 2026,
    month: 3,
    day: 1,
    location: { city: "东京", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 白金标牌",
    registrationStatus: "已截止",
    website: "https://www.marathon.tokyo/en/",
    description: "世界六大满贯之一，清晨从皇居出发穿越都市核心，沿途樱花点缀。",
    tags: ["世界名马", "都市穿越", "樱花沿线"]
  },
  {
    id: "int-2",
    name: "2026巴黎马拉松",
    year: 2026,
    month: 4,
    day: 5,
    location: { city: "巴黎", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 金标牌",
    registrationStatus: "报名中",
    website: "https://www.schneiderelectricparismarathon.com/en/",
    description: "沿塞纳河跑过卢浮宫与凯旋门的浪漫路线，赛前暖场由巴黎街头乐队与艺术团体助威。",
    tags: ["塞纳河", "浪漫地标", "艺术暖场"]
  },
  {
    id: "int-3",
    name: "2026波士顿马拉松",
    year: 2026,
    month: 4,
    day: 20,
    location: { city: "波士顿", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 精英标牌",
    registrationStatus: "已截止",
    description: "历史最悠久的马拉松，以严格的BQ资格闻名，挑战换道山与心跳山中段。",
    tags: ["历史传承", "BQ资格", "纽英格兰风光"],
    requirements: "需提供BQ资格时间"
  },
  {
    id: "int-4",
    name: "2026伦敦马拉松",
    year: 2026,
    month: 4,
    day: 26,
    location: { city: "伦敦", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 金标牌",
    registrationStatus: "已截止",
    description: "沿泰晤士河与皇家公园的慈善盛事路线，起点于泰晤士桥后进入绿茵皇家公园。",
    tags: ["慈善盛事", "泰晤士河", "皇家公园"]
  },
  {
    id: "int-5",
    name: "2026柏林马拉松",
    year: 2026,
    month: 9,
    day: 27,
    location: { city: "柏林", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 白金标牌",
    registrationStatus: "即将开始",
    description: "世界纪录之路，现代化城市景观与平坦路段兼具，柏林墙与广场串联赛道。",
    tags: ["快速赛道", "世界纪录", "城市新貌"]
  },
  {
    id: "int-6",
    name: "2026芝加哥马拉松",
    year: 2026,
    month: 10,
    day: 11,
    location: { city: "芝加哥", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 精英标牌",
    registrationStatus: "即将开始",
    description: "湖滨大道与高楼剪影交织的平坦全马，扁平赛道配合热情沿线观众适合冲刺成绩。",
    tags: ["湖滨大道", "平坦路线", "城市穿越"]
  },
  {
    id: "int-7",
    name: "2026纽约城市马拉松",
    year: 2026,
    month: 11,
    day: 1,
    location: { city: "纽约", country: "Overseas" },
    type: ["全程马拉松"],
    certification: "世界田联 · 白金标牌",
    registrationStatus: "即将开始",
    description: "串联五大区的大型马拉松，路线跨越多座桥梁，群众声浪与街头乐队相伴。",
    tags: ["五区联动", "大桥穿越", "群众盛典"]
  }
];
