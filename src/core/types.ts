/**
 * 核心資料型別。
 * src/core 底下的程式碼都是「純 TypeScript」：不 import React Native，
 * 所以可以直接用 Vitest 在 Node 上測試，也能搬到別的平台（例如後端或網頁）重用。
 */

/** 卡片種類：單字、句子、文法 */
export type CardKind = 'word' | 'sentence' | 'grammar';

/** 參考用 JLPT 等級（官方自 2010 年起不公布字彙表，這裡是近似值） */
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

/** 卡片來源：內建詞庫、日記推薦、AI 問答、手動新增 */
export type CardSource = 'starter' | 'daily' | 'ask' | 'manual';

/**
 * 複習時的四個評分，數值與 FSRS / Anki 相同：
 * 1 = 重來（忘了）、2 = 困難、3 = 記得、4 = 簡單
 */
export type Rating = 1 | 2 | 3 | 4;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4] as const;

/** 卡片的學習階段 */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/** FSRS 的記憶狀態：穩定度 S（天）與難度 D（1~10） */
export interface MemoryState {
  stability: number;
  difficulty: number;
}

/** 一張卡片的排程資訊 */
export interface SrsInfo {
  state: CardState;
  /** 下次到期時間（epoch 毫秒） */
  due: number;
  /** 還沒複習過的新卡是 null */
  memory: MemoryState | null;
  /** 目前在第幾個學習／重學步驟（只在 learning / relearning 有意義） */
  step: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
  /** 上一次排定的間隔天數；學習步驟中為 0 */
  scheduledDays: number;
}

/** 例句：ja 可以含 {漢字|かな} 標註 */
export interface Example {
  ja: string;
  zh: string;
}

export interface Card {
  id: string;
  kind: CardKind;
  /** 日文本體，可以含 {漢字|かな} 假名標註 */
  ja: string;
  /** 中文意思（台灣用語） */
  meaning: string;
  example?: Example;
  /** 用法說明、文法解釋 */
  note?: string;
  tags: string[];
  jlpt?: JlptLevel;
  source: CardSource;
  createdAt: number;
  srs: SrsInfo;
}

/** 一次複習紀錄，之後可以拿來做統計或重新訓練 FSRS 參數 */
export interface ReviewLog {
  cardId: string;
  rating: Rating;
  at: number;
  stateBefore: CardState;
  /** 距離上次複習幾個「學習日」 */
  elapsedDays: number;
  /** 這次排定的間隔（天）；還在學習步驟中為 0 */
  scheduledDays: number;
  stabilityAfter: number;
  difficultyAfter: number;
  /** 複習當下系統預測的記得機率（新卡為 null） */
  predictedRecall: number | null;
}

export type AiProviderId = 'demo' | 'gemini' | 'claude';

/** 學習程度：比 JLPT 多了「零基礎」和「會五十音」兩級（沿用舊版 japanessapp 的設計，值與 Supabase 資料表一致） */
export type Level = 'beginner' | 'kana' | JlptLevel;

/** 學習目的（可複選） */
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

/** 首次設定填的學習者資料，AI 挑卡、回答問題時會參考 */
export interface LearnerProfile {
  level: Level;
  goals: Goal[];
  interests: Interest[];
}

export interface Settings {
  /** auto：網頁 Demo 裡偵測得到 Claude 就用 Claude，否則有 Gemini Key 就用 Gemini，都沒有就用離線示範 */
  aiProvider: 'auto' | AiProviderId;
  geminiApiKey: string;
  geminiModel: string;
  /** 目標記憶率：希望到期那天還記得的機率 */
  desiredRetention: number;
  /** 每天最多學幾張新卡 */
  newPerDay: number;
  /** 日文發音速度（1 = 正常） */
  speechRate: number;
  /** 學習者資料；null 代表還沒做首次設定 */
  profile: LearnerProfile | null;
  /** 目前單字本裡是不是網頁 Demo 自動產生的示範資料 */
  demoData: boolean;
  /** 已經產生過示範資料（清空後不再重新產生） */
  seenDemo: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'auto',
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash',
  desiredRetention: 0.9,
  newPerDay: 10,
  speechRate: 0.9,
  profile: null,
  demoData: false,
  seenDemo: false,
};

/** AI 或內建詞庫推薦出來、還沒加入單字本的項目 */
export interface SuggestedItem {
  kind: CardKind;
  ja: string;
  meaning: string;
  example?: Example;
  note?: string;
  jlpt?: JlptLevel;
  tags?: string[];
}
