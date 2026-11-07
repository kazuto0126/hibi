import { describe, expect, it } from 'vitest';
import { FSRS6_DEFAULT_W } from './fsrs';
import { PERSONAS, randomLearner, simulateLearner } from './learner';
import { PARAM_BOUNDS } from './optimize';
import { makeConfig } from './scheduler';
import { HOUR } from './time';

const cfg = makeConfig({ w: FSRS6_DEFAULT_W, tz: () => 8 * HOUR });
const START = Date.UTC(2026, 6, 1, 4);
const opts = { cfg, start: START, days: 60, newPerDay: 8, seed: 'learner-test' };

/** 隔天以後的複習：實際記得的比例，和 App 當時預測的平均記得機率 */
function retention(logs: ReturnType<typeof simulateLearner>) {
  const rel = logs.filter((l) => l.stateBefore === 'review' && l.elapsedDays > 0);
  return {
    actual: rel.filter((l) => l.rating > 1).length / rel.length,
    predicted: rel.reduce((a, l) => a + (l.predictedRecall ?? 0), 0) / rel.length,
  };
}

describe('虛擬學習者', () => {
  const [average, fast, slow] = PERSONAS.map((p) => retention(simulateLearner(p, opts)));

  it('真正的參數就是 App 的參數時，實際記得的比例 ≈ App 預測的平均', () => {
    expect(Math.abs(average.actual - average.predicted)).toBeLessThan(0.02);
  });

  it('忘得快的人實際記得的比例明顯比較低，忘得慢的人比較高（App 都用預設參數排程）', () => {
    expect(fast.actual).toBeLessThan(average.actual - 0.04);
    expect(slow.actual).toBeGreaterThan(average.actual + 0.02);
    // App 不知道學習者的差異，所以三個人的「預測」差不多
    expect(Math.abs(fast.predicted - slow.predicted)).toBeLessThan(0.03);
  });

  it('同樣的種子產生同樣的紀錄；紀錄格式和 App 一樣', () => {
    const a = simulateLearner(PERSONAS[1], opts);
    const b = simulateLearner(PERSONAS[1], opts);
    expect(a.map((l) => l.rating)).toEqual(b.map((l) => l.rating));
    expect(a[0]).toMatchObject({ stateBefore: 'new', elapsedDays: 0, predictedRecall: null });
  });

  it('隨機學習者：可重現、參數在合法範圍內、初始穩定度由小到大', () => {
    const a = randomLearner('L1');
    expect(randomLearner('L1').w).toEqual(a.w);
    expect(randomLearner('L2').w).not.toEqual(a.w);
    a.w.forEach((x, i) => {
      expect(x).toBeGreaterThanOrEqual(PARAM_BOUNDS[i][0]);
      expect(x).toBeLessThanOrEqual(PARAM_BOUNDS[i][1]);
    });
    for (let i = 0; i < 3; i++) expect(a.w[i]).toBeLessThanOrEqual(a.w[i + 1]);
  });
});
