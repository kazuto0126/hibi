/**
 * 學習者資料（程度、學習目的、興趣）。
 *
 * 選項與文字沿用舊版 japanessapp 的首次設定（src/constants/profile-options.ts）。
 * value 是存進資料庫的值（英文，和 supabase/migrations 的 profiles 資料表一致，之後不要隨便改）；
 * label 是畫面上顯示的文字。
 */
import type { ScenarioId } from './data/scenarios';
import type { Goal, Interest, Level, LearnerProfile } from './types';

export interface Option<T> {
  value: T;
  label: string;
  description?: string;
}

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
  return options.filter((o) => values.includes(o.value)).map((o) => o.label);
}

export function levelLabel(level: Level): string {
  return LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? level;
}

/** 零基礎、會五十音：依舊版規劃的內容規則，日文一律附假名與羅馬拼音 */
export function isBeginner(p: LearnerProfile | null): boolean {
  return p?.level === 'beginner' || p?.level === 'kana';
}

/** 給 AI 的學習者描述，放進提示詞 */
export function learnerContext(p: LearnerProfile | null): string {
  if (!p) return '學生程度：約 JLPT N4（還沒填寫首次設定）。';
  const level = LEVEL_OPTIONS.find((o) => o.value === p.level);
  const lines = [`學生程度：${level?.label}（${level?.description}）。`];
  const goals = getLabels(GOAL_OPTIONS, p.goals);
  const interests = getLabels(INTEREST_OPTIONS, p.interests);
  if (goals.length) lines.push(`學習目的：${goals.join('、')}。`);
  if (interests.length) lines.push(`興趣：${interests.join('、')}。`);
  return lines.join('\n');
}

/** 依程度給 AI 的挑選規則 */
export function levelGuidance(p: LearnerProfile | null): string {
  switch (p?.level) {
    case 'beginner':
    case 'kana':
      return '學生還是初學者：只挑最基本、最常用的詞；句子要短（10 個字左右）並用です・ます體；文法說明不要用術語。';
    case 'N1':
    case 'N2':
      return `學生程度約 JLPT ${p.level}：可以挑比較道地的口語、慣用說法和細微的用法差異。`;
    default:
      return `學生程度約 JLPT ${p?.level ?? 'N4'}，可以略難一級，但不要太冷門。`;
  }
}

/** 學習目的 → 新手包要放哪些情境 */
const GOAL_SCENARIOS: Record<Goal, ScenarioId[]> = {
  travel: ['ryoko', 'shokuji', 'konbini', 'kaimono'],
  exam: ['gakko'],
  anime_drama: ['tomodachi', 'shumi'],
  work: ['shigoto', 'kotsu'],
};

/** 興趣 → 相關情境（離線示範模式在日記看不出情境時參考） */
const INTEREST_SCENARIOS: Partial<Record<Interest, ScenarioId>> = {
  food: 'shokuji',
  travel: 'ryoko',
  anime: 'shumi',
  drama: 'shumi',
  music: 'shumi',
  games: 'shumi',
  reading: 'shumi',
  sports: 'taicho',
  fashion: 'kaimono',
  photography: 'ryoko',
  pets: 'ie',
};

/** 新手包：基本會話＋依學習目的挑的情境（最多 4 個情境） */
export function starterTagsFor(p: LearnerProfile | null): ScenarioId[] {
  const tags: ScenarioId[] = ['kihon'];
  const fromGoals = (p?.goals ?? []).flatMap((g) => GOAL_SCENARIOS[g]);
  for (const t of fromGoals.length ? fromGoals : (['gakko', 'shokuji'] as ScenarioId[])) {
    if (!tags.includes(t)) tags.push(t);
  }
  return tags.slice(0, 4);
}

/** 依目的與興趣排出偏好的情境（由強到弱） */
export function preferredScenarios(p: LearnerProfile | null): ScenarioId[] {
  if (!p) return [];
  const out: ScenarioId[] = [];
  for (const id of [
    ...p.goals.flatMap((g) => GOAL_SCENARIOS[g]),
    ...p.interests.map((i) => INTEREST_SCENARIOS[i]),
  ]) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

const LEVELS = new Set(LEVEL_OPTIONS.map((o) => o.value));
const GOALS = new Set(GOAL_OPTIONS.map((o) => o.value));
const INTERESTS = new Set(INTEREST_OPTIONS.map((o) => o.value));

/** 從儲存空間或備份讀出的資料不一定可信：檢查後才採用，不合法就當作還沒設定 */
export function sanitizeProfile(raw: unknown): LearnerProfile | null {
  const r = raw as Partial<LearnerProfile> | null;
  if (!r || !LEVELS.has(r.level as Level)) return null;
  return {
    level: r.level as Level,
    goals: Array.isArray(r.goals) ? r.goals.filter((g): g is Goal => GOALS.has(g)) : [],
    interests: Array.isArray(r.interests) ? r.interests.filter((i): i is Interest => INTERESTS.has(i)) : [],
  };
}

/** 網頁 Demo 的示範學習者 */
export const DEMO_PROFILE: LearnerProfile = {
  level: 'N4',
  goals: ['travel', 'anime_drama'],
  interests: ['food', 'games'],
};
