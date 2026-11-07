/**
 * 排程策略：把 FSRS 記憶模型包成「什麼時候再出現」。
 *
 * 新卡 ──評分──▶ 學習中（1 分、10 分兩個步驟）──畢業──▶ 複習（FSRS 算出的天數）
 *                                                       │
 *                                         評「重來」 ◀──┘
 *                                             ▼
 *                                    重新學習（10 分）──▶ 回到複習
 *
 * 學習步驟以「分鐘」計，讓剛學的東西在同一天內多看幾次；
 * 畢業之後才用 FSRS 依目標記憶率算出以「天」計的間隔。
 */

import { forgettingCurve, nextInterval, nextState } from './fsrs';
import {
  MINUTE,
  TzOffsetFn,
  elapsedLearningDays,
  learningDay,
  learningDayStart,
  localTzOffset,
} from './time';
import type { CardState, Rating, ReviewLog, SrsInfo } from './types';

export interface SchedulerConfig {
  w: readonly number[];
  desiredRetention: number;
  /** 新卡的學習步驟（分鐘） */
  learningSteps: number[];
  /** 忘記後的重學步驟（分鐘） */
  relearningSteps: number[];
  maxInterval: number;
  enableFuzz: boolean;
  tz: TzOffsetFn;
}

export function newSrs(now: number): SrsInfo {
  return {
    state: 'new',
    due: now,
    memory: null,
    step: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    scheduledDays: 0,
  };
}

export interface Outcome {
  srs: SrsInfo;
  log: Omit<ReviewLog, 'cardId'>;
}

/**
 * 一次算出四個評分各自的結果。
 * 一次算完的好處：按鈕上可以預先顯示「1分 / 6分 / 1天 / 4天」，
 * 也能保證「困難 ≤ 記得 < 簡單」的間隔順序。
 */
export function scheduleAll(
  srs: SrsInfo,
  now: number,
  cfg: SchedulerConfig,
  seed = '',
): Record<Rating, Outcome> {
  const elapsed = srs.lastReview === null ? 0 : elapsedLearningDays(srs.lastReview, now, cfg.tz);
  const predictedRecall =
    srs.memory && srs.lastReview !== null ? forgettingCurve(cfg.w, elapsed, srs.memory.stability) : null;

  const draft = {} as Record<Rating, { srs: SrsInfo; graduatedIvl: number | null }>;
  for (const g of [1, 2, 3, 4] as Rating[]) {
    const memory = nextState(cfg.w, srs.memory, elapsed, g);
    draft[g] = transition(srs, g, memory, now, elapsed, cfg, seed);
  }

  enforceOrdering(draft, srs, now, cfg);

  const out = {} as Record<Rating, Outcome>;
  for (const g of [1, 2, 3, 4] as Rating[]) {
    const next = draft[g].srs;
    out[g] = {
      srs: next,
      log: {
        rating: g,
        at: now,
        stateBefore: srs.state,
        elapsedDays: elapsed,
        scheduledDays: next.scheduledDays,
        stabilityAfter: next.memory!.stability,
        difficultyAfter: next.memory!.difficulty,
        predictedRecall,
      },
    };
  }
  return out;
}

export function review(srs: SrsInfo, rating: Rating, now: number, cfg: SchedulerConfig, seed = ''): Outcome {
  return scheduleAll(srs, now, cfg, seed)[rating];
}

function transition(
  prev: SrsInfo,
  g: Rating,
  memory: NonNullable<SrsInfo['memory']>,
  now: number,
  elapsed: number,
  cfg: SchedulerConfig,
  seed: string,
): { srs: SrsInfo; graduatedIvl: number | null } {
  const base: SrsInfo = {
    ...prev,
    memory,
    reps: prev.reps + 1,
    lastReview: now,
  };

  const inSteps = (state: CardState, steps: number[], step: number) => {
    return {
      srs: {
        ...base,
        state,
        step,
        due: now + steps[step] * MINUTE,
        scheduledDays: 0,
      },
      graduatedIvl: null,
    };
  };
  const graduate = () => {
    const ivl = reviewInterval(memory.stability, elapsed, cfg, `${seed}:${prev.reps}`);
    const due = learningDayStart(learningDay(now, cfg.tz) + ivl, cfg.tz);
    return {
      srs: {
        ...base,
        state: 'review' as const,
        step: 0,
        due,
        scheduledDays: ivl,
      },
      graduatedIvl: ivl,
    };
  };

  switch (prev.state) {
    case 'new':
    case 'learning': {
      const steps = cfg.learningSteps;
      if (steps.length === 0) return graduate();
      const cur = prev.state === 'new' ? 0 : prev.step;
      if (g === 1) return inSteps('learning', steps, 0);
      if (g === 2) return hardStep(base, 'learning', steps, cur, now);
      if (g === 3) return cur + 1 < steps.length ? inSteps('learning', steps, cur + 1) : graduate();
      return graduate();
    }
    case 'relearning': {
      const steps = cfg.relearningSteps;
      if (steps.length === 0) return graduate();
      if (g === 1) return inSteps('relearning', steps, 0);
      if (g === 2) return hardStep(base, 'relearning', steps, prev.step, now);
      if (g === 3)
        return prev.step + 1 < steps.length ? inSteps('relearning', steps, prev.step + 1) : graduate();
      return graduate();
    }
    case 'review': {
      if (g === 1) {
        const lapsed = { ...base, lapses: prev.lapses + 1 };
        if (cfg.relearningSteps.length === 0) {
          const ivl = reviewInterval(memory.stability, elapsed, cfg, `${seed}:${prev.reps}`);
          const due = learningDayStart(learningDay(now, cfg.tz) + ivl, cfg.tz);
          return {
            srs: {
              ...lapsed,
              state: 'review',
              step: 0,
              due,
              scheduledDays: ivl,
            },
            graduatedIvl: ivl,
          };
        }
        return {
          srs: {
            ...lapsed,
            state: 'relearning',
            step: 0,
            due: now + cfg.relearningSteps[0] * MINUTE,
            scheduledDays: 0,
          },
          graduatedIvl: null,
        };
      }
      return graduate();
    }
  }
}

/**
 * 「困難」停在原步驟；如果是第一步，等待時間取第一、二步的平均（沒有第二步就 ×1.5），
 * 讓「困難」的等待時間介於「重來」與「記得」之間。
 */
function hardStep(base: SrsInfo, state: CardState, steps: number[], cur: number, now: number) {
  let minutes = steps[cur];
  if (cur === 0) minutes = steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5;
  return {
    srs: {
      ...base,
      state,
      step: cur,
      due: now + minutes * MINUTE,
      scheduledDays: 0,
    },
    graduatedIvl: null,
  };
}

/** FSRS 間隔 + 模糊化（fuzz）+ 上限 */
function reviewInterval(stability: number, elapsed: number, cfg: SchedulerConfig, seed: string): number {
  const ivl = Math.min(nextInterval(cfg.w, stability, cfg.desiredRetention), cfg.maxInterval);
  return cfg.enableFuzz ? fuzz(ivl, elapsed, cfg.maxInterval, seed) : ivl;
}

/**
 * 保證畢業／複習時「困難 ≤ 記得 < 簡單」。
 * 例：新卡直接評「簡單」，不能比評「記得」更早再出現。
 */
function enforceOrdering(
  draft: Record<Rating, { srs: SrsInfo; graduatedIvl: number | null }>,
  prev: SrsInfo,
  now: number,
  cfg: SchedulerConfig,
) {
  const setIvl = (g: Rating, ivl: number) => {
    const d = draft[g];
    if (d.graduatedIvl === null) return;
    d.graduatedIvl = ivl;
    d.srs = {
      ...d.srs,
      scheduledDays: ivl,
      due: learningDayStart(learningDay(now, cfg.tz) + ivl, cfg.tz),
    };
  };
  const hard = draft[2].graduatedIvl;
  const good = draft[3].graduatedIvl;
  const easy = draft[4].graduatedIvl;
  if (prev.state === 'review' && hard !== null && good !== null) {
    const h = Math.min(hard, good);
    setIvl(2, h);
    setIvl(3, Math.max(good, h + 1));
  }
  const goodNow = draft[3].graduatedIvl;
  if (easy !== null && goodNow !== null) setIvl(4, Math.max(easy, goodNow + 1));
}

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

/**
 * 間隔模糊化：同一天學的卡片如果間隔完全一樣，以後會永遠擠在同一天到期。
 * 加一點隨機擾動（間隔越長，擾動比例越小），讓複習量平均分散。
 * 用卡片 id 當亂數種子 → 同一張卡、同一次複習永遠得到同樣結果，方便測試與重現。
 */
export function fuzz(ivl: number, elapsed: number, maxIvl: number, seed: string): number {
  if (ivl < 2.5) return ivl;
  let delta = 1;
  for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(ivl, r.end) - r.start, 0);
  let lo = Math.max(2, Math.round(ivl - delta));
  const hi = Math.min(Math.round(ivl + delta), maxIvl);
  if (ivl > elapsed) lo = Math.max(lo, elapsed + 1);
  lo = Math.min(lo, hi);
  return Math.floor(seededRandom(seed) * (hi - lo + 1) + lo);
}

/** FNV-1a 雜湊 → mulberry32，產生 [0, 1) 的決定性亂數 */
export function seededRandom(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 此刻還記得的機率（新卡回傳 null） */
export function currentRecall(
  srs: SrsInfo,
  now: number,
  cfg: Pick<SchedulerConfig, 'w' | 'tz'>,
): number | null {
  if (!srs.memory || srs.lastReview === null) return null;
  return forgettingCurve(cfg.w, elapsedLearningDays(srs.lastReview, now, cfg.tz), srs.memory.stability);
}

export function makeConfig(partial: Partial<SchedulerConfig> & Pick<SchedulerConfig, 'w'>): SchedulerConfig {
  return {
    desiredRetention: 0.9,
    learningSteps: [1, 10],
    relearningSteps: [10],
    maxInterval: 36500,
    enableFuzz: true,
    tz: localTzOffset,
    ...partial,
  };
}
