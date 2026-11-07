/**
 * FSRS-6 記憶模型（Free Spaced Repetition Scheduler）。
 *
 * 這個檔案只負責「記憶狀態怎麼變」：給定上一次的穩定度 S、難度 D、
 * 隔了幾天、這次評幾分，算出新的 S 與 D。要不要進學習步驟、哪天到期，
 * 是 scheduler.ts 的工作。把「模型」和「排程策略」分開，模型就能單獨拿來驗證。
 *
 * 三個核心量：
 *   R（retrievability，可提取率）：此刻還記得的機率
 *   S（stability，穩定度）：R 從 100% 掉到 90% 需要的天數
 *   D（difficulty，難度）：1~10，越難的卡 S 長得越慢
 *
 * 公式來源：https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
 * 參考實作：ts-fsrs（src/core/fsrs.test.ts 會逐步比對兩者輸出一致）
 */

import type { MemoryState, Rating } from './types';

/** FSRS-6 預設參數（21 個），由開源社群用大量 Anki 複習紀錄訓練而來 */
export const FSRS6_DEFAULT_W: readonly number[] = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

export const S_MIN = 0.001;
export const S_MAX = 36500;

/** 參考實作在每一步都四捨五入到小數 8 位，照做才能逐位比對 */
export function roundTo(x: number, decimals = 8): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/**
 * 遺忘曲線（冪函數）：R(t, S) = (1 + factor · t / S)^(−w20)
 * factor 的取法讓 R(S, S) 剛好等於 0.9，這就是「穩定度」的定義。
 */
export function decayFactor(w: readonly number[]): {
  decay: number;
  factor: number;
} {
  const decay = -w[20];
  const factor = roundTo(Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1);
  return { decay, factor };
}

export function forgettingCurve(w: readonly number[], elapsedDays: number, stability: number): number {
  const { decay, factor } = decayFactor(w);
  return roundTo(Math.pow(1 + (factor * elapsedDays) / stability, decay));
}

/**
 * 反解遺忘曲線：要讓 R 掉到目標記憶率 r，需要等幾天？
 * I(r, S) = S / factor · (r^(1/decay) − 1)，四捨五入成整數天、至少 1 天。
 */
export function nextInterval(w: readonly number[], stability: number, desiredRetention: number): number {
  if (!(desiredRetention > 0 && desiredRetention <= 1)) {
    throw new RangeError('desiredRetention 必須介於 0 與 1 之間');
  }
  const { decay, factor } = decayFactor(w);
  return Math.max(Math.round((stability / factor) * (Math.pow(desiredRetention, 1 / decay) - 1)), 1);
}

/** 第一次評分後的初始穩定度：直接查表 w0~w3 */
export function initStability(w: readonly number[], g: Rating): number {
  return clamp(w[g - 1], S_MIN, S_MAX);
}

/** 初始難度：D0(G) = w4 − e^(w5·(G−1)) + 1 */
export function initDifficulty(w: readonly number[], g: Rating): number {
  return roundTo(w[4] - Math.exp((g - 1) * w[5]) + 1);
}

/**
 * 難度更新：
 *   ΔD = −w6 · (G − 3)          評「記得」不變，評「重來」變難，評「簡單」變容易
 *   D' = D + ΔD · (10 − D) / 9   線性阻尼：越接近 10 越難再往上加
 *   D'' = w7 · D0(4) + (1 − w7) · D'   均值回歸，避免難度卡死在極端值
 */
export function nextDifficulty(w: readonly number[], d: number, g: Rating): number {
  const delta = -w[6] * (g - 3);
  const damped = d + roundTo((delta * (10 - d)) / 9);
  const reverted = roundTo(w[7] * initDifficulty(w, 4) + (1 - w[7]) * damped);
  return clamp(reverted, 1, 10);
}

/**
 * 成功回想後的新穩定度：
 *   S' = S · (1 + e^w8 · (11 − D) · S^(−w9) · (e^(w10·(1−R)) − 1) · 困難懲罰 · 簡單加成)
 * 直覺：越快要忘（R 越低）的時候答對，記憶加強得越多；越難、越穩定的卡，成長越慢。
 */
export function nextRecallStability(
  w: readonly number[],
  d: number,
  s: number,
  r: number,
  g: Rating,
): number {
  const hardPenalty = g === 2 ? w[15] : 1;
  const easyBonus = g === 4 ? w[16] : 1;
  const growth = Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1);
  return roundTo(clamp(s * (1 + growth * hardPenalty * easyBonus), S_MIN, S_MAX));
}

/**
 * 忘記之後的新穩定度：
 *   S_f = w11 · D^(−w12) · ((S + 1)^w13 − 1) · e^(w14·(1−R))
 * 而且不能超過 S / e^(w17·w18)，忘掉之後穩定度一定要下降。
 */
export function nextForgetStability(w: readonly number[], d: number, s: number, r: number): number {
  return roundTo(
    clamp(
      w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
      S_MIN,
      S_MAX,
    ),
  );
}

/**
 * 同一天內重複複習（間隔 0 天）時的穩定度：
 *   SInc = S^(−w19) · e^(w17·(G − 3 + w18))，評「困難」以上時 SInc 至少為 1
 */
export function nextShortTermStability(w: readonly number[], s: number, g: Rating): number {
  const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
  const masked = g >= 2 ? Math.max(sinc, 1) : sinc;
  return roundTo(clamp(s * masked, S_MIN, S_MAX));
}

export interface StepOptions {
  /** 是否用短期公式處理同一天的重複複習（FSRS-5 起的預設行為） */
  enableShortTerm?: boolean;
}

/**
 * 記憶模型的一步：舊狀態 + 間隔天數 + 評分 → 新狀態。
 * memory 為 null 代表第一次看到這張卡。
 */
export function nextState(
  w: readonly number[],
  memory: MemoryState | null,
  elapsedDays: number,
  g: Rating,
  opts: StepOptions = {},
): MemoryState {
  const enableShortTerm = opts.enableShortTerm ?? true;
  if (elapsedDays < 0) throw new RangeError(`elapsedDays 不能是負數：${elapsedDays}`);

  if (memory === null) {
    return {
      difficulty: clamp(initDifficulty(w, g), 1, 10),
      stability: initStability(w, g),
    };
  }

  const { difficulty: d, stability: s } = memory;
  const r = forgettingCurve(w, elapsedDays, s);

  let newS: number;
  if (elapsedDays === 0 && enableShortTerm) {
    newS = nextShortTermStability(w, s, g);
  } else if (g === 1) {
    const afterFail = nextForgetStability(w, d, s, r);
    const [w17, w18] = enableShortTerm ? [w[17], w[18]] : [0, 0];
    newS = clamp(roundTo(s / Math.exp(w17 * w18)), S_MIN, afterFail);
  } else {
    newS = nextRecallStability(w, d, s, r, g);
  }
  return { difficulty: nextDifficulty(w, d, g), stability: newS };
}
