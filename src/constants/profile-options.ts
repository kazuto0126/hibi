// 首次設定的選項清單。要增減選項或改文字，只要改這個檔案。
// value 是存進資料庫的值（英文，之後不要隨便改）；label 是畫面上顯示的文字。

export type Level = 'beginner' | 'kana' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export type Goal = 'travel' | 'exam' | 'anime_drama' | 'work';

export type Interest =
  | 'food'
  | 'travel'
  | 'anime'
  | 'drama'
  | 'music'
  | 'games'
  | 'sports'
  | 'fashion'
  | 'photography'
  | 'tech'
  | 'reading'
  | 'pets';

export type Profile = {
  level: Level;
  goals: Goal[];
  interests: Interest[];
};

type Option<T> = {
  value: T;
  label: string;
  description?: string;
};

export const LEVEL_OPTIONS: Option<Level>[] = [
  { value: 'beginner', label: '零基礎', description: '完全沒學過日文' },
  { value: 'kana', label: '會五十音', description: '看得懂平假名、片假名' },
  { value: 'N5', label: 'N5', description: '會基本問候和簡單的句子' },
  { value: 'N4', label: 'N4', description: '看得懂日常生活的簡單對話' },
  { value: 'N3', label: 'N3', description: '大致看得懂日常生活中的日文' },
  { value: 'N2', label: 'N2', description: '看得懂新聞，能跟上一般對話' },
  { value: 'N1', label: 'N1', description: '能理解各種場合的日文' },
];

export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: 'travel', label: '旅遊', description: '點餐、問路、購物用得到的日文' },
  { value: 'exam', label: '考試', description: '準備 JLPT 日本語能力試驗' },
  { value: 'anime_drama', label: '追劇動漫', description: '聽懂日劇、動畫裡的日常對話' },
  { value: 'work', label: '工作', description: '職場和商務上用得到的日文' },
];

export const INTEREST_OPTIONS: Option<Interest>[] = [
  { value: 'food', label: '美食' },
  { value: 'travel', label: '旅行' },
  { value: 'anime', label: '動漫' },
  { value: 'drama', label: '日劇' },
  { value: 'music', label: '音樂' },
  { value: 'games', label: '遊戲' },
  { value: 'sports', label: '運動' },
  { value: 'fashion', label: '時尚' },
  { value: 'photography', label: '攝影' },
  { value: 'tech', label: '科技' },
  { value: 'reading', label: '閱讀' },
  { value: 'pets', label: '寵物' },
];

export function getLabels<T>(options: Option<T>[], values: T[]): string[] {
  return options.filter((option) => values.includes(option.value)).map((option) => option.label);
}
