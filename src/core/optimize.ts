/**
 * 用使用者自己的複習紀錄，重新訓練 FSRS 的 21 個參數。
 *
 * 想法：
 *   1. 把每張卡的複習紀錄照時間重播一遍。每次「隔天以後」的複習，模型都會先預測「這次記得的機率 R」。
 *   2. 拿預測和實際結果（記得 = 評分 ≥ 困難）比較，用 log loss（對數損失）衡量預測得多差。
 *   3. 用梯度下降（Adam）一點一點調整參數，讓 log loss 變小。
 *
 * 和官方訓練程式（open-spaced-repetition 的 fsrs-optimizer / fsrs-rs）一致的地方：
 *   - 只用「不是第一次、而且隔天以後」的複習算誤差（同一天的學習步驟不算，但仍會更新記憶狀態）
 *   - 參數範圍限制（PARAM_BOUNDS）與防止參數離預設值太遠的懲罰項（PARAM_STD、gamma）
 *   - Adam、學習率 0.04、餘弦遞減
 * 不一樣的地方：
 *   - 每一步都用全部資料（資料量是一個人的紀錄，不大），而不是分小批次
 *   - 初始穩定度 w0~w3 在對數尺度上調整（它們可以從 0.1 天到 100 天，等比例調整比較合理），
 *     官方則是另外先用第一次複習的結果估計
 * 兩者的訓練結果會在 docs/實驗報告.md 裡對照。
 */

import {
  Dual,
  N_PARAMS,
  add,
  addc,
  clamp as clampD,
  constant,
  div,
  exp,
  max,
  min,
  mul,
  mulc,
  pow,
  sub,
  variable,
} from './autodiff';
import { FSRS6_DEFAULT_W, S_MAX, S_MIN, forgettingCurve, nextState } from './fsrs';
import type { MemoryState, Rating, ReviewLog } from './types';

// ── 參數範圍與先驗 ────────────────────────────────────────────

/**
 * 每個參數允許的範圍，和官方 fsrs-optimizer 6.x 的 ParameterClipper 相同。
 * 超出範圍的參數可能讓模型做出不合理的預測（例如忘記之後穩定度反而上升）。
 */
export const PARAM_BOUNDS: readonly (readonly [number, number])[] = [
  [S_MIN, 100],
  [S_MIN, 100],
  [S_MIN, 100],
  [S_MIN, 100],
  [1, 10],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, 2],
  [0, 2],
  [0.01, 0.8],
  [0.1, 0.8],
];

/**
 * 大量 Anki 使用者訓練出來的參數，每個參數在使用者之間的標準差（官方 fsrs-optimizer 的 DEFAULT_PARAMS_STDDEV）。
 * 懲罰項用它來衡量「離預設值多遠算遠」：使用者之間本來就差很多的參數，可以放比較大的自由度。
 */
export const PARAM_STD: readonly number[] = [
  6.43, 9.66, 17.58, 27.85, 0.57, 0.28, 0.6, 0.12, 0.39, 0.18, 0.33, 0.3, 0.09, 0.16, 0.57, 0.25, 1.03, 0.31,
  0.32, 0.14, 0.27,
];

export function clipParams(w: readonly number[]): number[] {
  return w.map((x, i) => Math.min(Math.max(x, PARAM_BOUNDS[i][0]), PARAM_BOUNDS[i][1]));
}

// ── 紀錄整理 ──────────────────────────────────────────────

/** 把複習紀錄依卡片整理好，攤平成陣列，重播時比較快 */
export interface ReviewData {
  /** 第 c 張卡的紀錄在 [cardStart[c], cardStart[c+1]) */
  cardStart: Int32Array;
  rating: Uint8Array;
  /** 距離上次複習幾個學習日（和排程器記錄的一樣） */
  elapsed: Int32Array;
  at: Float64Array;
}

/**
 * 從 App 的複習紀錄建立訓練資料。
 * 每張卡從「第一次看到」（stateBefore 為 new）那筆開始；找不到的卡（紀錄不完整）就略過，
 * 因為少了開頭，重播出來的記憶狀態不會是對的。
 */
export function fromLogs(logs: readonly ReviewLog[]): ReviewData {
  const byCard = new Map<string, ReviewLog[]>();
  logs.forEach((l) => {
    const list = byCard.get(l.cardId);
    if (list) list.push(l);
    else byCard.set(l.cardId, [l]);
  });
  const starts: number[] = [0];
  const rating: number[] = [];
  const elapsed: number[] = [];
  const at: number[] = [];
  for (const list of byCard.values()) {
    const sorted = [...list].sort((a, b) => a.at - b.at);
    const first = sorted.findIndex((l) => l.stateBefore === 'new');
    if (first < 0) continue;
    for (let i = first; i < sorted.length; i++) {
      rating.push(sorted[i].rating);
      elapsed.push(i === first ? 0 : sorted[i].elapsedDays);
      at.push(sorted[i].at);
    }
    starts.push(rating.length);
  }
  return {
    cardStart: Int32Array.from(starts),
    rating: Uint8Array.from(rating),
    elapsed: Int32Array.from(elapsed),
    at: Float64Array.from(at),
  };
}

/** 只計算時間落在 [from, to) 的複習；用來切開訓練集和測試集 */
export interface TimeRange {
  from?: number;
  to?: number;
}

const inRange = (t: number, r: TimeRange) => t >= (r.from ?? -Infinity) && t < (r.to ?? Infinity);

/** 第 j 筆紀錄要不要算進誤差：不是卡片的第一筆、隔了至少一天、時間在範圍內 */
function isScored(data: ReviewData, j: number, first: number, range: TimeRange): boolean {
  return j > first && data.elapsed[j] > 0 && inRange(data.at[j], range);
}

// ── 預測（用 App 實際使用的 fsrs.ts） ─────────────────────────

export interface Predictions {
  /** 模型事前預測的記得機率 */
  p: number[];
  /** 實際結果：1 記得、0 忘記 */
  y: number[];
  at: number[];
}

/** 用參數 w 重播所有紀錄，收集範圍內每次複習的預測與結果 */
export function predict(w: readonly number[], data: ReviewData, range: TimeRange = {}): Predictions {
  const out: Predictions = { p: [], y: [], at: [] };
  const end = range.to ?? Infinity;
  const nCards = data.cardStart.length - 1;
  for (let c = 0; c < nCards; c++) {
    const first = data.cardStart[c];
    let memory: MemoryState | null = null;
    for (let j = first; j < data.cardStart[c + 1]; j++) {
      if (data.at[j] >= end) break; // 之後的紀錄都在範圍外，不用再重播
      const g = data.rating[j] as Rating;
      if (memory && isScored(data, j, first, range)) {
        out.p.push(forgettingCurve(w, data.elapsed[j], memory.stability));
        out.y.push(g > 1 ? 1 : 0);
        out.at.push(data.at[j]);
      }
      memory = nextState(w, memory, data.elapsed[j], g);
    }
  }
  return out;
}

// ── 可微分版本的 FSRS-6（公式和 fsrs.ts 相同，只是不四捨五入，並帶著梯度） ──

interface DualMemory {
  s: Dual;
  d: Dual;
}

/** 只跟參數有關、每次重播都一樣的量，先算好（省下大量重複計算） */
interface Precomputed {
  W: Dual[];
  decay: Dual;
  /** 遺忘曲線的 factor = 0.9^(1/decay) − 1 */
  factor: Dual;
  /** 均值回歸的目標：w7 · D0(4) */
  meanRevert: Dual;
  /** 1 − w7 */
  keep: Dual;
  negW9: Dual;
  negW12: Dual;
  negW19: Dual;
  expW8: Dual;
  /** 忘記時穩定度至少縮小的倍數 e^(w17·w18) */
  shrink: Dual;
  /** 依評分 G 的初始難度（G = 1~4，index 0 不用） */
  initD: Dual[];
}

function initDifficultyD(W: Dual[], g: Rating): Dual {
  return addc(sub(W[4], exp(mulc(W[5], g - 1))), 1);
}

function precompute(w: readonly number[]): Precomputed {
  const W = w.map((x, i) => variable(x, i));
  const decay = mulc(W[20], -1);
  const initD = [constant(0), ...([1, 2, 3, 4] as Rating[]).map((g) => initDifficultyD(W, g))];
  return {
    W,
    decay,
    factor: addc(exp(div(constant(Math.log(0.9)), decay)), -1),
    meanRevert: mul(W[7], initD[4]),
    keep: addc(mulc(W[7], -1), 1),
    negW9: mulc(W[9], -1),
    negW12: mulc(W[12], -1),
    negW19: mulc(W[19], -1),
    expW8: exp(W[8]),
    shrink: exp(mul(W[17], W[18])),
    initD,
  };
}

/** R(t, S) = (1 + factor · t / S)^decay */
function forgettingCurveD(P: Precomputed, t: number, s: Dual): Dual {
  return pow(addc(div(mulc(P.factor, t), s), 1), P.decay);
}

/** 記憶狀態的一步；r 是這次複習前的可提取率（隔天以後才需要） */
function nextStateD(P: Precomputed, m: DualMemory | null, t: number, g: Rating, r: Dual | null): DualMemory {
  const { W } = P;
  if (m === null) {
    return { s: clampD(W[g - 1], S_MIN, S_MAX), d: clampD(P.initD[g], 1, 10) };
  }
  const { s, d } = m;

  // 難度：ΔD = −w6·(G−3)，線性阻尼，再均值回歸
  const tenMinusD = addc(mulc(d, -1), 10);
  const damped = add(d, mulc(mul(W[6], tenMinusD), -(g - 3) / 9));
  const newD = clampD(add(P.meanRevert, mul(P.keep, damped)), 1, 10);

  let newS: Dual;
  if (t === 0) {
    // 同一天內：SInc = S^(−w19) · e^(w17·(G − 3 + w18))
    const sinc = mul(pow(s, P.negW19), exp(mul(W[17], addc(W[18], g - 3))));
    const masked = g >= 2 ? max(sinc, constant(1)) : sinc;
    newS = clampD(mul(s, masked), S_MIN, S_MAX);
  } else {
    const R = r ?? forgettingCurveD(P, t, s);
    const oneMinusR = addc(mulc(R, -1), 1);
    if (g === 1) {
      const afterFail = clampD(
        mul(mul(mul(W[11], pow(d, P.negW12)), addc(pow(addc(s, 1), W[13]), -1)), exp(mul(oneMinusR, W[14]))),
        S_MIN,
        S_MAX,
      );
      newS = min(max(div(s, P.shrink), constant(S_MIN)), afterFail);
    } else {
      let growth = mul(
        mul(mul(P.expW8, addc(mulc(d, -1), 11)), pow(s, P.negW9)),
        addc(exp(mul(oneMinusR, W[10])), -1),
      );
      if (g === 2) growth = mul(growth, W[15]);
      if (g === 4) growth = mul(growth, W[16]);
      newS = clampD(mul(s, addc(growth, 1)), S_MIN, S_MAX);
    }
  }
  return { s: newS, d: newD };
}

/** 預測機率夾在這個範圍內，避免 log(0) */
export const P_EPS = 1e-7;

export interface Prior {
  /** 懲罰項的中心（通常是預設參數） */
  center: readonly number[];
  /** 懲罰強度；0 代表不懲罰。官方預設 1 */
  gamma: number;
}

export interface LossResult {
  /** 平均 log loss（不含懲罰項） */
  logLoss: number;
  /** 實際最小化的目標：平均 log loss ＋ 懲罰項 */
  objective: number;
  /** 目標對 21 個參數的梯度 */
  grad: Float64Array;
  /** 算進誤差的複習次數 */
  n: number;
}

/**
 * 目標函數與它的梯度：
 *   目標 = 平均 log loss ＋ gamma / n · Σ ((w_i − 中心_i) / 標準差_i)²
 * 懲罰項除以 n：資料越多，越相信資料；資料少時，參數不太會離開預設值。
 */
export function lossAndGrad(
  w: readonly number[],
  data: ReviewData,
  range: TimeRange = {},
  prior: Prior | null = null,
): LossResult {
  const P = precompute(w);
  const end = range.to ?? Infinity;
  const grad = new Float64Array(N_PARAMS);
  let sum = 0;
  let n = 0;
  const nCards = data.cardStart.length - 1;
  for (let c = 0; c < nCards; c++) {
    const first = data.cardStart[c];
    let m: DualMemory | null = null;
    for (let j = first; j < data.cardStart[c + 1]; j++) {
      if (data.at[j] >= end) break;
      const g = data.rating[j] as Rating;
      const t = data.elapsed[j];
      let r: Dual | null = null;
      if (m && t > 0) r = forgettingCurveD(P, t, m.s);
      if (m && r && isScored(data, j, first, range)) {
        const p = Math.min(Math.max(r.v, P_EPS), 1 - P_EPS);
        const y = g > 1 ? 1 : 0;
        sum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
        n++;
        // d(log loss)/dp = −(y/p − (1−y)/(1−p))；夾住時梯度為 0
        if (p === r.v) {
          const dp = -(y / p - (1 - y) / (1 - p));
          for (let i = 0; i < N_PARAMS; i++) grad[i] += dp * r.d[i];
        }
      }
      m = nextStateD(P, m, t, g, r);
    }
  }
  if (n === 0) return { logLoss: NaN, objective: NaN, grad, n };
  for (let i = 0; i < N_PARAMS; i++) grad[i] /= n;
  const logLoss = sum / n;
  let penalty = 0;
  if (prior && prior.gamma > 0) {
    for (let i = 0; i < N_PARAMS; i++) {
      const z = (w[i] - prior.center[i]) / PARAM_STD[i];
      penalty += z * z;
      grad[i] += ((2 * prior.gamma) / n) * (z / PARAM_STD[i]);
    }
    penalty *= prior.gamma / n;
  }
  return { logLoss, objective: logLoss + penalty, grad, n };
}

// ── 訓練 ─────────────────────────────────────────────────

export interface TrainOptions {
  /** 起始參數，預設是 FSRS-6 預設值 */
  init?: readonly number[];
  /** 梯度下降幾步（每一步用全部資料） */
  steps?: number;
  /** Adam 的學習率；之後依餘弦曲線遞減到 0 */
  lr?: number;
  /** 懲罰強度，官方預設 1；0 代表不懲罰 */
  gamma?: number;
  /** 每一步結束時回報進度（給 App 顯示進度條用） */
  onStep?: (step: number, objective: number) => void;
}

export interface TrainResult {
  w: number[];
  /** 訓練過程中最好的目標值 */
  objective: number;
  logLoss: number;
  n: number;
  /** 每一步的目標值，用來畫訓練曲線 */
  trace: number[];
}

/** 前 4 個參數（初始穩定度）在對數尺度上調整 */
const LOG_SCALE = (i: number) => i < 4;

/**
 * Adam 梯度下降。
 * Adam 會依照每個參數過去梯度的大小自動調整步伐，參數尺度差很多（w3 約 8、w12 約 0.06）也能穩定訓練。
 */
export function train(data: ReviewData, range: TimeRange = {}, opts: TrainOptions = {}): TrainResult {
  const steps = opts.steps ?? 100;
  const lr0 = opts.lr ?? 0.04;
  const gamma = opts.gamma ?? 1;
  const init = clipParams(opts.init ?? FSRS6_DEFAULT_W);
  const prior: Prior = { center: FSRS6_DEFAULT_W, gamma };

  // 優化的變數 x：初始穩定度用 log(w)，其他直接用 w
  const toX = (w: readonly number[]) => w.map((v, i) => (LOG_SCALE(i) ? Math.log(v) : v));
  const toW = (x: readonly number[]) => clipParams(x.map((v, i) => (LOG_SCALE(i) ? Math.exp(v) : v)));

  let x = toX(init);
  const m1 = new Float64Array(N_PARAMS);
  const m2 = new Float64Array(N_PARAMS);
  const b1 = 0.9;
  const b2 = 0.999;
  const eps = 1e-8;

  let best = { w: init, objective: Infinity, logLoss: NaN, n: 0 };
  const trace: number[] = [];

  for (let step = 0; step <= steps; step++) {
    const w = toW(x);
    const res = lossAndGrad(w, data, range, prior);
    if (res.n === 0) break;
    trace.push(res.objective);
    if (res.objective < best.objective) {
      best = { w, objective: res.objective, logLoss: res.logLoss, n: res.n };
    }
    opts.onStep?.(step, res.objective);
    if (step === steps) break;

    const lr = lr0 * 0.5 * (1 + Math.cos((Math.PI * step) / steps));
    for (let i = 0; i < N_PARAMS; i++) {
      // 連鎖律：對 log(w) 的梯度 = w · 對 w 的梯度
      const g = LOG_SCALE(i) ? res.grad[i] * w[i] : res.grad[i];
      m1[i] = b1 * m1[i] + (1 - b1) * g;
      m2[i] = b2 * m2[i] + (1 - b2) * g * g;
      const mHat = m1[i] / (1 - Math.pow(b1, step + 1));
      const vHat = m2[i] / (1 - Math.pow(b2, step + 1));
      x[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
    }
    // 超出範圍就拉回來（對數尺度的參數，拉回 log 後的範圍）
    x = toX(toW(x));
  }

  return { w: best.w, objective: best.objective, logLoss: best.logLoss, n: best.n, trace };
}
