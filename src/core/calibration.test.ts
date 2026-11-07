import { describe, expect, it } from 'vitest';
import { auc, calibrationCurve, calibrationRmse, logLoss } from './calibration';
import { seededRandom } from './learner';

describe('log loss', () => {
  it('永遠預測 50%，不論結果都是 ln 2', () => {
    expect(logLoss({ p: [0.5, 0.5, 0.5], y: [1, 0, 1] })).toBeCloseTo(Math.LN2, 12);
  });

  it('預測越接近結果，log loss 越小；預測 100% 卻忘記不會變成無限大', () => {
    expect(logLoss({ p: [0.9], y: [1] })).toBeLessThan(logLoss({ p: [0.6], y: [1] }));
    expect(Number.isFinite(logLoss({ p: [1], y: [0] }))).toBe(true);
  });
});

describe('校準曲線', () => {
  it('依預測值分組，1.0 歸到最後一組，空的組不出現', () => {
    const curve = calibrationCurve({ p: [0.05, 0.07, 0.95, 1.0], y: [0, 1, 1, 1] });
    expect(curve.map((b) => [b.lo, b.n])).toEqual([
      [0, 2],
      [0.9, 2],
    ]);
    expect(curve[0].actual).toBe(0.5);
    expect(curve[0].predicted).toBeCloseTo(0.06, 12);
  });

  it('每組實際比例剛好等於平均預測時，校準誤差為 0', () => {
    // 0.25 組：4 次記得 1 次；0.75 組：4 次記得 3 次
    const p = [0.25, 0.25, 0.25, 0.25, 0.75, 0.75, 0.75, 0.75];
    const y = [1, 0, 0, 0, 1, 1, 1, 0];
    expect(calibrationRmse({ p, y })).toBeCloseTo(0, 12);
  });

  it('全部預測 90% 但只記得一半 → 校準誤差 0.4', () => {
    expect(calibrationRmse({ p: [0.9, 0.9, 0.9, 0.9], y: [1, 0, 1, 0] })).toBeCloseTo(0.4, 12);
  });
});

describe('AUC', () => {
  it('完全分得開是 1，完全相反是 0，全部同分是 0.5', () => {
    expect(auc({ p: [0.1, 0.2, 0.8, 0.9], y: [0, 0, 1, 1] })).toBe(1);
    expect(auc({ p: [0.9, 0.8, 0.2, 0.1], y: [0, 0, 1, 1] })).toBe(0);
    expect(auc({ p: [0.5, 0.5, 0.5, 0.5], y: [0, 1, 0, 1] })).toBe(0.5);
  });

  it('和「逐對比較」的定義算出來一樣（含同分）', () => {
    const rand = seededRandom('auc');
    const p = Array.from({ length: 300 }, () => Math.round(rand() * 20) / 20);
    const y = p.map((q) => (rand() < q ? 1 : 0));
    let wins = 0;
    let pairs = 0;
    for (let i = 0; i < p.length; i++) {
      for (let j = 0; j < p.length; j++) {
        if (y[i] === 1 && y[j] === 0) {
          pairs++;
          wins += p[i] > p[j] ? 1 : p[i] === p[j] ? 0.5 : 0;
        }
      }
    }
    expect(auc({ p, y })).toBeCloseTo(wins / pairs, 12);
  });
});
