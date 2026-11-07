/**
 * 虛擬學習者：用來做實驗的模擬資料。
 *
 * 每個虛擬學習者有一組「真正的」記憶參數（他的大腦實際上怎麼遺忘），
 * 但 App 不知道，App 照樣用預設參數排程。模擬時兩件事同時進行：
 *   - App：用 scheduler.ts 決定每張卡什麼時候出現（跟真的 App 一模一樣）
 *   - 學習者：用「真正的參數」算出此刻記得的機率，擲骰子決定記不記得，再決定評幾分
 * 產生的複習紀錄格式和 App 存的一樣。之後拿去訓練，就能檢查「訓練出來的參數有沒有接近真正的參數」。
 *
 * 評分的機率用官方模擬器（fsrs-rs 的 default_simulator_config）的預設值，那是從 Anki 使用者資料統計來的。
 */

import { FSRS6_DEFAULT_W, forgettingCurve, nextState } from './fsrs';
import { PARAM_STD, clipParams } from './optimize';
import { newSrs, review, type SchedulerConfig } from './scheduler';
import { DAY, HOUR, MINUTE, elapsedLearningDays, learningDay, learningDayStart } from './time';
import type { MemoryState, Rating, ReviewLog, SrsInfo } from './types';

export interface VirtualLearner {
  name: string;
  /** 這個人真正的記憶參數 */
  w: number[];
}

/** 新卡第一次看到時的評分機率：重來、困難、記得、簡單（官方模擬器預設值） */
export const FIRST_RATING_PROB = [0.24, 0.094, 0.495, 0.171] as const;
/** 記得的時候，評困難、記得、簡單的機率（官方模擬器預設值） */
export const RECALL_RATING_PROB = [0.224, 0.631, 0.145] as const;

// ── 可重現的亂數 ──────────────────────────────────────────

export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標準常態分布（Box–Muller） */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function pick(rand: () => number, probs: readonly number[]): number {
  const x = rand() * probs.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (x < acc) return i;
  }
  return probs.length - 1;
}

// ── 學習者 ────────────────────────────────────────────────

const scaled = (w: readonly number[], f: Record<number, (x: number) => number>) =>
  clipParams(w.map((x, i) => (f[i] ? f[i](x) : x)));

/** 三個有代表性的學習者 */
export const PERSONAS: VirtualLearner[] = [
  // 對照組：真正的參數就是預設值。訓練不應該讓預測變差。
  { name: '平均型', w: [...FSRS6_DEFAULT_W] },
  // 初始穩定度只有預設的 35%、答對後穩定度成長較慢、忘記後重建也較慢
  {
    name: '忘得快',
    w: scaled(FSRS6_DEFAULT_W, {
      0: (x) => x * 0.35,
      1: (x) => x * 0.35,
      2: (x) => x * 0.35,
      3: (x) => x * 0.35,
      8: (x) => x - 0.4,
      11: (x) => x * 0.6,
    }),
  },
  // 初始穩定度是預設的 2.5 倍、答對後穩定度成長較快
  {
    name: '忘得慢',
    w: scaled(FSRS6_DEFAULT_W, {
      0: (x) => x * 2.5,
      1: (x) => x * 2.5,
      2: (x) => x * 2.5,
      3: (x) => x * 2.5,
      8: (x) => x + 0.3,
      11: (x) => x * 1.5,
    }),
  },
];

/**
 * 隨機產生一個學習者：以預設參數為中心，依官方統計的「使用者之間的差異」抽樣。
 *   - 初始穩定度 w0~w3：乘上 e^N(0, 0.5)，再由小到大排好（評越高分，初始穩定度越高）
 *   - 其他參數：預設值 ＋ 0.5 × 標準差 × N(0, 1)
 * 最後夾在合法範圍內。用一半的標準差，是為了避免抽到極端、不像真人的組合。
 */
export function randomLearner(seed: string): VirtualLearner {
  const rand = seededRandom(seed);
  const w = FSRS6_DEFAULT_W.map((x, i) =>
    i < 4 ? x * Math.exp(0.5 * gaussian(rand)) : x + 0.5 * PARAM_STD[i] * gaussian(rand),
  );
  const s0 = w.slice(0, 4).sort((a, b) => a - b);
  return { name: seed, w: clipParams([...s0, ...w.slice(4)]) };
}

// ── 模擬 ─────────────────────────────────────────────────

export interface SimulationOptions {
  /** App 的排程設定（裡面的 w 是 App 用的參數，不是學習者真正的參數） */
  cfg: SchedulerConfig;
  /** 第一天的時間（之後每天晚上 9 點複習） */
  start: number;
  days: number;
  newPerDay: number;
  seed: string;
}

interface SimCard {
  id: string;
  srs: SrsInfo;
  /** 學習者大腦裡真正的記憶狀態 */
  truth: MemoryState | null;
}

/**
 * 模擬一個學習者用 App 學習 days 天，回傳 App 會存下來的複習紀錄。
 * 每天晚上 9 點：先加入 newPerDay 張新卡，再把到期的卡複習完（學習步驟的 1 分、10 分鐘也在同一段時間內完成）。
 */
export function simulateLearner(learner: VirtualLearner, opts: SimulationOptions): ReviewLog[] {
  const { cfg } = opts;
  const rand = seededRandom(`${opts.seed}:${learner.name}`);
  const firstDay = learningDay(opts.start, cfg.tz);
  const cards: SimCard[] = [];
  const logs: ReviewLog[] = [];

  for (let d = 0; d < opts.days; d++) {
    let t = learningDayStart(firstDay + d, cfg.tz) + 17 * HOUR;
    for (let i = 0; i < opts.newPerDay; i++) {
      const id = `${learner.name}-${cards.length}`;
      cards.push({ id, srs: newSrs(t - 60 * MINUTE), truth: null });
    }
    for (let guard = 0; guard < 5000; guard++) {
      let next: SimCard | undefined;
      for (const c of cards) {
        if (c.srs.due <= t + 20 * MINUTE && (!next || c.srs.due < next.srs.due)) next = c;
      }
      if (!next) break;
      t = Math.max(t, next.srs.due) + 20_000;

      const card = next;
      let rating: Rating;
      if (card.truth === null || card.srs.lastReview === null) {
        rating = (pick(rand, FIRST_RATING_PROB) + 1) as Rating;
      } else {
        const days = elapsedLearningDays(card.srs.lastReview, t, cfg.tz);
        // 隔天以後：照 FSRS 的整數天數；同一天內：用實際經過的時間換算成天
        const elapsed = days >= 1 ? days : (t - card.srs.lastReview) / DAY;
        const p = forgettingCurve(learner.w, elapsed, card.truth.stability);
        rating = rand() < p ? ((pick(rand, RECALL_RATING_PROB) + 2) as Rating) : 1;
      }

      const elapsedDays =
        card.srs.lastReview === null ? 0 : elapsedLearningDays(card.srs.lastReview, t, cfg.tz);
      card.truth = nextState(learner.w, card.truth, elapsedDays, rating);
      const out = review(card.srs, rating, t, cfg, card.id);
      card.srs = out.srs;
      logs.push({ cardId: card.id, ...out.log });
    }
  }
  return logs;
}
