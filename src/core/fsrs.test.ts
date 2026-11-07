/**
 * FSRS-6 記憶模型的驗證。
 *
 * 1. 對照測試（differential testing）：用開源參考實作 ts-fsrs 當「標準答案」，
 *    隨機產生上千組複習序列，逐步比對穩定度、難度、間隔、可提取率是否完全一致。
 * 2. 性質測試（property-based）：不管參數怎麼跑，都該成立的數學性質。
 */
import { describe, expect, it } from 'vitest';
import { FSRS6Model } from 'ts-fsrs/models/fsrs-6';
import { FSRS6_DEFAULT_W, forgettingCurve, initDifficulty, nextInterval, nextState } from './fsrs';
import type { MemoryState, Rating } from './types';

/** 決定性的亂數產生器，讓失敗的案例可以重現 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHistory(rand: () => number, len: number): { rating: Rating; deltaT: number }[] {
  const out: { rating: Rating; deltaT: number }[] = [];
  for (let i = 0; i < len; i++) {
    // 評分分布大致模擬真實使用：多數「記得」，偶爾忘記
    const x = rand();
    const rating: Rating = x < 0.15 ? 1 : x < 0.3 ? 2 : x < 0.85 ? 3 : 4;
    // 第一次一定是 0 天；之後 20% 機率同一天重複複習，其餘 1~200 天
    const deltaT = i === 0 ? 0 : rand() < 0.2 ? 0 : 1 + Math.floor(Math.pow(rand(), 2) * 200);
    out.push({ rating, deltaT });
  }
  return out;
}

describe.each([true, false])('FSRS-6 與 ts-fsrs 參考實作一致（enableShortTerm=%s）', (enableShortTerm) => {
  const ref = FSRS6Model.create({
    config: {
      weights: [...FSRS6_DEFAULT_W],
      enableShortTerm,
      numRelearningSteps: 1,
    },
  });

  it('2000 組隨機複習序列，每一步的穩定度與難度都相同', () => {
    const rand = rng(enableShortTerm ? 42 : 7);
    let steps = 0;
    for (let n = 0; n < 2000; n++) {
      const history = randomHistory(rand, 1 + Math.floor(rand() * 12));
      let mine: MemoryState | null = null;
      let theirs: MemoryState | null = null;
      for (const h of history) {
        mine = nextState(FSRS6_DEFAULT_W, mine, h.deltaT, h.rating, {
          enableShortTerm,
        });
        theirs = ref.step({
          memoryState: theirs,
          rating: h.rating,
          elapsedDays: h.deltaT,
        }) as MemoryState;
        expect(mine.stability).toBe(theirs.stability);
        expect(mine.difficulty).toBe(theirs.difficulty);
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(10_000);
  });

  it('間隔天數與可提取率在各種目標記憶率下都相同', () => {
    const rand = rng(99);
    for (let n = 0; n < 3000; n++) {
      const stability = Math.exp(rand() * 9 - 2); // 約 0.14 ~ 1100 天
      const memoryState = { stability, difficulty: 1 + rand() * 9 };
      for (const r of [0.75, 0.8, 0.85, 0.9, 0.95, 0.97]) {
        expect(nextInterval(FSRS6_DEFAULT_W, stability, r)).toBe(ref.nextInterval(memoryState, r));
      }
      const t = Math.floor(rand() * 400);
      expect(forgettingCurve(FSRS6_DEFAULT_W, t, stability)).toBe(ref.forgettingCurve(memoryState, t));
    }
  });
});

describe('FSRS-6 數學性質', () => {
  const w = FSRS6_DEFAULT_W;

  it('穩定度的定義：經過 S 天後，可提取率剛好是 90%', () => {
    for (const s of [0.5, 1, 3, 10, 50, 365]) {
      expect(forgettingCurve(w, s, s)).toBeCloseTo(0.9, 6);
    }
  });

  it('目標記憶率設 90% 時，間隔 ≈ 穩定度', () => {
    for (const s of [3, 10, 50, 365]) {
      expect(Math.abs(nextInterval(w, s, 0.9) - s)).toBeLessThanOrEqual(1);
    }
  });

  it('目標記憶率越高，間隔越短（要更常複習）', () => {
    const s = 30;
    expect(nextInterval(w, s, 0.95)).toBeLessThan(nextInterval(w, s, 0.9));
    expect(nextInterval(w, s, 0.9)).toBeLessThan(nextInterval(w, s, 0.8));
  });

  it('可提取率隨時間單調遞減', () => {
    let prev = 1;
    for (let t = 0; t <= 100; t++) {
      const r = forgettingCurve(w, t, 10);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });

  it('初始難度：評分越高越容易（D 越小）', () => {
    expect(initDifficulty(w, 1)).toBeGreaterThan(initDifficulty(w, 2));
    expect(initDifficulty(w, 2)).toBeGreaterThan(initDifficulty(w, 3));
    expect(initDifficulty(w, 3)).toBeGreaterThan(initDifficulty(w, 4));
  });

  it('隔了幾天後答對：穩定度上升；忘記：穩定度下降；難度永遠在 1~10', () => {
    const rand = rng(2024);
    for (let n = 0; n < 2000; n++) {
      const mem = {
        stability: Math.exp(rand() * 6 - 1),
        difficulty: 1 + rand() * 9,
      };
      const t = 1 + Math.floor(rand() * 60);
      const good = nextState(w, mem, t, 3);
      const again = nextState(w, mem, t, 1);
      expect(good.stability).toBeGreaterThan(mem.stability);
      expect(again.stability).toBeLessThan(mem.stability);
      for (const g of [1, 2, 3, 4] as Rating[]) {
        const d = nextState(w, mem, t, g).difficulty;
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(10);
      }
    }
  });

  it('同樣的間隔下：簡單 > 記得 > 困難 的穩定度成長', () => {
    const mem = { stability: 5, difficulty: 5 };
    const hard = nextState(w, mem, 5, 2).stability;
    const good = nextState(w, mem, 5, 3).stability;
    const easy = nextState(w, mem, 5, 4).stability;
    expect(easy).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(hard);
  });
});
