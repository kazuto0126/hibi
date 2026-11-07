/**
 * 生活情境。label 是介面上的中文，ja 是情境的日文名稱，
 * keywords 用來在離線示範模式下，從使用者的中文日記判斷今天經歷了哪些情境。
 */
export interface Scenario {
  id: ScenarioId;
  label: string;
  ja: string;
  keywords: string[];
}

export type ScenarioId =
  | 'konbini'
  | 'shokuji'
  | 'kotsu'
  | 'gakko'
  | 'shigoto'
  | 'kaimono'
  | 'tomodachi'
  | 'tenki'
  | 'taicho'
  | 'shumi'
  | 'ie'
  | 'ryoko'
  | 'kihon';

export const SCENARIOS: Scenario[] = [
  {
    id: 'gakko',
    label: '上課',
    ja: '{学校|がっこう}',
    keywords: [
      '上課',
      '考試',
      '老師',
      '教授',
      '作業',
      '報告',
      '期中',
      '期末',
      '同學',
      '圖書館',
      '讀書',
      '唸書',
      '念書',
      '專題',
      '學校',
      '學期',
      '成績',
      'GPA',
      '小考',
      '翹課',
      '課',
    ],
  },
  {
    id: 'shokuji',
    label: '吃飯',
    ja: '{食事|しょくじ}',
    keywords: [
      '吃',
      '餐廳',
      '拉麵',
      '早餐',
      '午餐',
      '晚餐',
      '宵夜',
      '咖啡',
      '飲料',
      '手搖',
      '喝',
      '好吃',
      '點餐',
      '外送',
      '便當',
      '火鍋',
      '滷肉飯',
      '飯',
    ],
  },
  {
    id: 'kotsu',
    label: '通勤',
    ja: '{交通|こうつう}',
    keywords: [
      '捷運',
      '公車',
      '火車',
      '高鐵',
      '電車',
      '搭車',
      '騎車',
      '機車',
      '通勤',
      '塞車',
      '計程車',
      '車站',
      '開車',
      '腳踏車',
      'YouBike',
      'Ubike',
      '末班車',
    ],
  },
  {
    id: 'konbini',
    label: '便利商店',
    ja: 'コンビニ',
    keywords: [
      '便利商店',
      '超商',
      '7-11',
      '小七',
      '全家',
      '萊爾富',
      'OK超商',
      '結帳',
      '發票',
      '微波',
      '集點',
    ],
  },
  {
    id: 'shigoto',
    label: '打工',
    ja: '{仕事|しごと}',
    keywords: [
      '打工',
      '工作',
      '上班',
      '下班',
      '加班',
      '老闆',
      '主管',
      '店長',
      '面試',
      '薪水',
      '實習',
      '排班',
      '班表',
      '同事',
    ],
  },
  {
    id: 'tomodachi',
    label: '朋友',
    ja: '{友達|ともだち}',
    keywords: [
      '朋友',
      '聊天',
      '約',
      '聚餐',
      '生日',
      '唱歌',
      'KTV',
      '電影',
      '見面',
      '室友',
      '慶生',
      '好久不見',
    ],
  },
  {
    id: 'shumi',
    label: '娛樂',
    ja: '{趣味|しゅみ}',
    keywords: [
      '遊戲',
      '打電動',
      '電動',
      '動漫',
      '動畫',
      '追劇',
      '音樂',
      '看書',
      '電競',
      '直播',
      '比賽',
      '漫畫',
      '韓劇',
      '實況',
      '手遊',
      '演唱會',
      '本命',
    ],
  },
  {
    id: 'taicho',
    label: '作息',
    ja: '{体調|たいちょう}',
    keywords: [
      '累',
      '睡',
      '起床',
      '熬夜',
      '通宵',
      '感冒',
      '頭痛',
      '生病',
      '運動',
      '健身',
      '跑步',
      '醫院',
      '不舒服',
      '想睡',
      '睡過頭',
      '遲到',
      '爆肝',
    ],
  },
  {
    id: 'kaimono',
    label: '購物',
    ja: '{買|か}い{物|もの}',
    keywords: [
      '買',
      '逛街',
      '衣服',
      '網購',
      '便宜',
      '貴',
      '折扣',
      '鞋',
      '購物',
      '蝦皮',
      '特價',
      '賣完',
      '試穿',
    ],
  },
  {
    id: 'tenki',
    label: '天氣',
    ja: '{天気|てんき}',
    keywords: ['天氣', '下雨', '雨', '熱', '冷', '颱風', '晴', '傘', '悶', '太陽'],
  },
  {
    id: 'ie',
    label: '在家',
    ja: '{家|いえ}',
    keywords: [
      '在家',
      '回家',
      '洗衣服',
      '打掃',
      '煮飯',
      '做飯',
      '自己煮',
      '家人',
      '媽媽',
      '爸爸',
      '房間',
      '倒垃圾',
      '整理',
      '一個人住',
    ],
  },
  {
    id: 'ryoko',
    label: '旅行',
    ja: '{旅行|りょこう}',
    keywords: [
      '旅行',
      '旅遊',
      '日本',
      '機票',
      '飯店',
      '行李',
      '觀光',
      '拍照',
      '出國',
      '機場',
      '景點',
      '東京',
      '大阪',
      '京都',
      '換錢',
    ],
  },
];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** 依關鍵字出現次數，猜今天的日記涉及哪些情境（由多到少） */
export function detectScenarios(diary: string): ScenarioId[] {
  const text = diary.toLowerCase();
  const scored = SCENARIOS.map((s) => ({
    id: s.id,
    score: s.keywords.reduce(
      (n, k) => n + (text.includes(k.toLowerCase()) ? Math.max(1, k.length - 1) : 0),
      0,
    ),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}
