import { describe, expect, it } from 'vitest';
import { logLoss } from './calibration';
import { FSRS6_DEFAULT_W } from './fsrs';
import { PERSONAS, simulateLearner } from './learner';
import { PARAM_BOUNDS, PARAM_STD, clipParams, fromLogs, lossAndGrad, predict, train } from './optimize';
import { makeConfig } from './scheduler';
import { DAY, HOUR } from './time';
import type { ReviewLog } from './types';

const cfg = makeConfig({ w: FSRS6_DEFAULT_W, tz: () => 8 * HOUR });
const START = Date.UTC(2026, 6, 1, 4);
const DAYS = 60;
const CUTOFF = START + 48 * DAY;

const [average, fast] = PERSONAS;
const sim = (learner = average) =>
  simulateLearner(learner, { cfg, start: START, days: DAYS, newPerDay: 8, seed: 'test' });

describe('整理複習紀錄', () => {
  const log = (cardId: string, at: number, rating: 1 | 2 | 3 | 4, elapsedDays: number, first = false) =>
    ({ cardId, at, rating, elapsedDays, stateBefore: first ? 'new' : 'review' }) as ReviewLog;

  it('依卡片分組、依時間排序；第一筆的間隔一律當 0', () => {
    const data = fromLogs([
      log('b', 5, 3, 2),
      log('a', 1, 3, 9, true),
      log('b', 2, 1, 0, true),
      log('a', 3, 4, 1),
    ]);
    // 卡片 b 先出現在紀錄裡，所以排第一
    expect(Array.from(data.cardStart)).toEqual([0, 2, 4]);
    expect(Array.from(data.rating)).toEqual([1, 3, 3, 4]);
    expect(Array.from(data.elapsed)).toEqual([0, 2, 0, 1]);
  });

  it('找不到「第一次看到」的卡（紀錄不完整）會略過', () => {
    const data = fromLogs([log('a', 1, 3, 3), log('b', 2, 3, 0, true)]);
    expect(data.cardStart.length - 1).toBe(1);
  });
});

describe('預測：用預設參數重播，結果要和 App 當時記下的一樣', () => {
  const logs = sim();
  const data = fromLogs(logs);

  it('每一次隔天以後的複習，預測值都等於 App 記錄的 predictedRecall', () => {
    const pred = predict(FSRS6_DEFAULT_W, data);
    const byTime = new Map(logs.map((l) => [l.at, l]));
    expect(pred.p.length).toBeGreaterThan(500);
    pred.p.forEach((p, i) => {
      const l = byTime.get(pred.at[i])!;
      expect(l.elapsedDays).toBeGreaterThan(0);
      expect(p).toBe(l.predictedRecall);
      expect(pred.y[i]).toBe(l.rating > 1 ? 1 : 0);
    });
  });

  it('時間範圍可以切開訓練集和測試集，兩者加起來是全部', () => {
    const all = predict(FSRS6_DEFAULT_W, data).p.length;
    const a = predict(FSRS6_DEFAULT_W, data, { to: CUTOFF }).p.length;
    const b = predict(FSRS6_DEFAULT_W, data, { from: CUTOFF }).p.length;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a + b).toBe(all);
  });
});

describe('可微分版本：數值和梯度都要正確', () => {
  const data = fromLogs(sim(fast));
  const w = clipParams(FSRS6_DEFAULT_W.map((x, i) => x * (1 + 0.1 * Math.sin(i + 1))));

  it('log loss 和用 fsrs.ts（App 實際使用的版本）算的一樣', () => {
    const res = lossAndGrad(w, data, { to: CUTOFF });
    const ref = logLoss(predict(w, data, { to: CUTOFF }));
    expect(res.n).toBe(predict(w, data, { to: CUTOFF }).p.length);
    expect(Math.abs(res.logLoss - ref)).toBeLessThan(1e-6);
  });

  it('自動微分的梯度和有限差分（每個參數各動一點點）一致，含懲罰項', () => {
    const prior = { center: FSRS6_DEFAULT_W, gamma: 1 };
    const res = lossAndGrad(w, data, { to: CUTOFF }, prior);
    for (let i = 0; i < 21; i++) {
      const h = 1e-6 * Math.max(1, Math.abs(w[i]));
      const up = [...w];
      const down = [...w];
      up[i] += h;
      down[i] -= h;
      const fd =
        (lossAndGrad(up, data, { to: CUTOFF }, prior).objective -
          lossAndGrad(down, data, { to: CUTOFF }, prior).objective) /
        (2 * h);
      expect(Math.abs(res.grad[i] - fd)).toBeLessThan(1e-4 * Math.max(1, Math.abs(fd)));
    }
  });
});

describe('訓練', () => {
  const testLoss = (w: readonly number[], data: ReturnType<typeof fromLogs>) =>
    logLoss(predict(w, data, { from: CUTOFF }));

  it('參數範圍和官方一致：預設值都在範圍內，標準差有 21 個', () => {
    expect(PARAM_BOUNDS).toHaveLength(21);
    expect(PARAM_STD).toHaveLength(21);
    FSRS6_DEFAULT_W.forEach((x, i) => {
      expect(x).toBeGreaterThanOrEqual(PARAM_BOUNDS[i][0]);
      expect(x).toBeLessThanOrEqual(PARAM_BOUNDS[i][1]);
    });
  });

  it('對照組（真正的參數就是預設值）：訓練集誤差下降，測試集不會差太多', () => {
    // 資料只有 48 天時，訓練多少會「學到雜訊」（過度擬合），官方訓練程式也一樣；實驗報告裡有完整比較
    const data = fromLogs(sim(average));
    const res = train(data, { to: CUTOFF }, { steps: 60 });
    expect(res.trace[res.trace.length - 1]).toBeLessThan(res.trace[0]);
    expect(testLoss(res.w, data)).toBeLessThan(testLoss(FSRS6_DEFAULT_W, data) + 0.015);
  });

  it('「忘得快」的學習者：訓練後的誤差，比預設參數更接近真正的參數', () => {
    const data = fromLogs(sim(fast));
    const res = train(data, { to: CUTOFF }, { steps: 60 });
    const gapDefault = testLoss(FSRS6_DEFAULT_W, data) - testLoss(fast.w, data);
    const gapTrained = testLoss(res.w, data) - testLoss(fast.w, data);
    expect(gapDefault).toBeGreaterThan(0.005);
    expect(gapTrained).toBeLessThan(gapDefault / 2);
    // 初始穩定度往真正的方向移動（真正的只有預設的 35%）
    expect(res.w[2]).toBeLessThan(FSRS6_DEFAULT_W[2]);
  });

  it('訓練結果一定在合法範圍內', () => {
    const data = fromLogs(sim(fast));
    const res = train(data, {}, { steps: 30, lr: 0.5, gamma: 0 });
    res.w.forEach((x, i) => {
      expect(x).toBeGreaterThanOrEqual(PARAM_BOUNDS[i][0]);
      expect(x).toBeLessThanOrEqual(PARAM_BOUNDS[i][1]);
    });
  });

  it('沒有任何可訓練的複習時，回傳起始參數', () => {
    const res = train(fromLogs([]), {}, { steps: 5 });
    expect(res.w).toEqual(clipParams(FSRS6_DEFAULT_W));
    expect(res.n).toBe(0);
  });
});
