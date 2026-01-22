import { addDays } from "date-fns";

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
  type: "Full" | "Half" | "10K" | "5K" | "Ultra" | "Other";
  certification?: "A" | "B" | "C" | "Gold" | "Silver" | "Bronze" | null;
  registrationStatus: "Open" | "Closed" | "Upcoming";
  registrationDeadline?: string;
  website?: string;
  description?: string;
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
  // Domestic (China) Data - Based on image + expanded
  {
    id: "cn-1",
    name: "2026首届长兴太湖9号公路玫瑰跑嘉年华",
    year: 2026,
    month: 3,
    day: 7,
    location: { province: "浙江", city: "湖州", country: "China" },
    type: "10K",
    registrationStatus: "Open",
    registrationDeadline: "2026-02-09",
    requirements: "无",
    description: "美丽的太湖沿岸风景跑",
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
    type: "10K",
    registrationStatus: "Open",
    registrationDeadline: "2026-02-09",
    requirements: "限女性",
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
    type: "Half",
    certification: "B",
    registrationStatus: "Upcoming",
    registrationDeadline: "2026-01-26",
  },
  {
    id: "cn-4",
    name: "2026曲靖罗平花海马拉松",
    year: 2026,
    month: 3,
    day: 15,
    location: { province: "云南", city: "曲靖", country: "China" },
    type: "Full",
    certification: "A",
    registrationStatus: "Closed",
    registrationDeadline: "2026-02-23",
    website: "http://qujing-marathon.example.com",
  },
  {
    id: "cn-5",
    name: "2026重庆万州环湖马拉松",
    year: 2026,
    month: 3,
    day: 15,
    location: { province: "重庆", city: "万州区", country: "China" },
    type: "Full",
    certification: "A",
    registrationStatus: "Open",
    registrationDeadline: "2026-01-30",
  },
  {
    id: "cn-6",
    name: "2026临平半程马拉松",
    year: 2026,
    month: 3,
    day: 22,
    location: { province: "浙江", city: "杭州", country: "China" },
    type: "Half",
    certification: "C",
    registrationStatus: "Open",
    registrationDeadline: "2026-02-28",
  },
   {
    id: "cn-7",
    name: "2026贵州·仁怀马拉松",
    year: 2026,
    month: 3,
    day: 22,
    location: { province: "贵州", city: "仁怀", country: "China" },
    type: "Full",
    certification: "C",
    registrationStatus: "Open",
    registrationDeadline: "2026-02-25",
  },
  {
    id: "cn-8",
    name: "2026南京溧水半程马拉松",
    year: 2026,
    month: 3,
    day: 22,
    location: { province: "江苏", city: "南京", country: "China" },
    type: "Half",
    certification: "A",
    registrationStatus: "Upcoming",
    registrationDeadline: "2026-01-31",
  },

  // Overseas Data - Examples
  {
    id: "int-1",
    name: "Tokyo Marathon 2026",
    year: 2026,
    month: 3,
    day: 1,
    location: { city: "Tokyo", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Closed",
    website: "https://www.marathon.tokyo/en/",
    description: "One of the six World Marathon Majors.",
  },
  {
    id: "int-2",
    name: "Paris Marathon 2026",
    year: 2026,
    month: 4,
    day: 5,
    location: { city: "Paris", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Open",
    website: "https://www.schneiderelectricparismarathon.com/en/",
    description: "Run through the most beautiful city in the world.",
  },
  {
    id: "int-3",
    name: "Boston Marathon 2026",
    year: 2026,
    month: 4,
    day: 20,
    location: { city: "Boston", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Closed",
    description: "The world's oldest annual marathon.",
    requirements: "Qualifying time required (BQ)",
  },
  {
    id: "int-4",
    name: "London Marathon 2026",
    year: 2026,
    month: 4,
    day: 26,
    location: { city: "London", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Closed",
    description: "Famous for its route past iconic landmarks and massive charity fundraising.",
  },
  {
    id: "int-5",
    name: "Berlin Marathon 2026",
    year: 2026,
    month: 9,
    day: 27,
    location: { city: "Berlin", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Upcoming",
    description: "The fastest marathon course in the world.",
  },
  {
    id: "int-6",
    name: "Chicago Marathon 2026",
    year: 2026,
    month: 10,
    day: 11,
    location: { city: "Chicago", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Upcoming",
    description: "Known for its flat and fast course.",
  },
  {
    id: "int-7",
    name: "New York City Marathon 2026",
    year: 2026,
    month: 11,
    day: 1,
    location: { city: "New York", country: "Overseas" },
    type: "Full",
    certification: "Gold",
    registrationStatus: "Upcoming",
    description: "The largest marathon in the world.",
  },
];
