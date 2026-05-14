// 标准化标签中英对照（路跑 + 越野统一）
export const ROAD_TAG_LABELS = {
  marathon: "全马",
  half_marathon: "半马",
  "10k": "10公里",
  "5k": "5公里",
  other: "其他",
} as const;

export const TRAIL_TAG_LABELS = {
  Short: "短距离",
  "20K": "20公里",
  "42K": "42公里",
  "50K": "50公里",
  "100K": "100公里",
  "100M": "百英里",
  "200K+": "200公里+",
} as const;
