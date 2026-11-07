import { describe, expect, it } from 'vitest';
import { FSRS6_DEFAULT_W } from './fsrs';
import { fuzz, makeConfig, newSrs, review, scheduleAll, seededRandom } from './scheduler';
import {
  DAY,
  HOUR,
  MINUTE,
  elapsedLearningDays,
  formatInterval,
  learningDay,
  learningDayStart,
} from './time';
import type { Rating, SrsInfo } from './types';

/** 固定在 UTC+8，測試不受執行環境時區影響 */
const tz = () => 8 * HOUR;
const cfg = makeConfig({ w: FSRS6_DEFAULT_W, enableFuzz: false, tz });
/** 2026-11-07 10:00（台北時間） */
const T0 = Date.UTC(2026, 10, 7, 2, 0, 0);

describe('學習日（凌晨 4 點分界）', () => {
  it('晚上 11 點和隔天凌晨 1 點算同一個學習日', () => {
    const night = Date.UTC(2026, 10, 7, 15, 0); // 23:00 台北
    const lateNight = Date.UTC(2026, 10, 7, 17, 0); // 隔天 01:00 台北
    expect(elapsedLearningDays(night, lateNight, tz)).toBe(0);
  });

  it('凌晨 3:59 與 4:01 分屬不同學習日', () => {
    const before = Date.UTC(2026, 10, 7, 19, 59); // 03:59
    const after = Date.UTC(2026, 10, 7, 20, 1); // 04:01
    expect(elapsedLearningDays(before, after, tz)).toBe(1);
  });

  it('learningDayStart 與 learningDay 互為反函數，且落在凌晨 4 點', () => {
    const day = learningDay(T0, tz);
    const start = learningDayStart(day, tz);
    expect(learningDay(start, tz)).toBe(day);
    expect(learningDay(start - 1, tz)).toBe(day - 1);
    expect(new Date(start + tz()).getUTCHours()).toBe(4);
  });
});

describe('新卡與學習步驟', () => {
  const card = newSrs(T0);
  const out = scheduleAll(card, T0, cfg);

  it('重來 → 1 分鐘後；困難 → 5.5 分鐘後；記得 → 進第 2 步、10 分鐘後', () => {
    expect(out[1].srs.state).toBe('learning');
    expect(out[1].srs.due - T0).toBe(1 * MINUTE);
    expect(out[2].srs.due - T0).toBe(5.5 * MINUTE);
    expect(out[3].srs.step).toBe(1);
    expect(out[3].srs.due - T0).toBe(10 * MINUTE);
  });

  it('簡單 → 直接畢業成複習卡，至少隔 1 天，而且在凌晨 4 點到期', () => {
    const easy = out[4].srs;
    expect(easy.state).toBe('review');
    expect(easy.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(learningDay(easy.due, tz) - learningDay(T0, tz)).toBe(easy.scheduledDays);
    expect(new Date(easy.due + tz()).getUTCHours()).toBe(4);
  });

  it('第 2 步評「記得」→ 畢業', () => {
    const step2 = out[3].srs;
    const later = step2.due;
    const graduated = review(step2, 3, later, cfg).srs;
    expect(graduated.state).toBe('review');
    expect(graduated.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(graduated.reps).toBe(2);
  });

  it('紀錄會保存評分前狀態，新卡的預測記憶率為 null', () => {
    expect(out[3].log.stateBefore).toBe('new');
    expect(out[3].log.predictedRecall).toBeNull();
  });
});

describe('複習卡', () => {
  /** 做出一張已經畢業、間隔若干天的複習卡 */
  function matureCard(): SrsInfo {
    let s = newSrs(T0);
    let now = T0;
    for (const g of [3, 3, 3, 3] as Rating[]) {
      s = review(s, g, now, cfg).srs;
      now = Math.max(s.due, now + MINUTE);
    }
    return s;
  }

  it('評「重來」→ 進重學步驟（10 分鐘），遺忘次數 +1，穩定度下降', () => {
    const c = matureCard();
    const now = c.due;
    const lapsed = review(c, 1, now, cfg).srs;
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.due - now).toBe(10 * MINUTE);
    expect(lapsed.lapses).toBe(c.lapses + 1);
    expect(lapsed.memory!.stability).toBeLessThan(c.memory!.stability);
  });

  it('重學後評「記得」→ 回到複習', () => {
    const c = matureCard();
    const lapsed = review(c, 1, c.due, cfg).srs;
    const back = review(lapsed, 3, lapsed.due, cfg).srs;
    expect(back.state).toBe('review');
  });

  it('到期時複習，紀錄裡的預測記憶率接近目標記憶率', () => {
    const c = matureCard();
    const log = review(c, 3, c.due, cfg).log;
    expect(log.predictedRecall).not.toBeNull();
    expect(log.predictedRecall!).toBeGreaterThan(0.85);
    expect(log.predictedRecall!).toBeLessThan(0.95);
  });

  it('間隔順序永遠是 困難 ≤ 記得 < 簡單（隨機 500 種狀態）', () => {
    let seed = 1;
    for (let i = 0; i < 500; i++) {
      const s = 0.5 + seededRandom(`s${seed++}`) * 300;
      const d = 1 + seededRandom(`d${seed++}`) * 9;
      const elapsed = Math.floor(seededRandom(`e${seed++}`) * 400);
      const now = T0 + elapsed * DAY;
      const card: SrsInfo = {
        state: 'review',
        due: now,
        memory: { stability: s, difficulty: d },
        step: 0,
        reps: 5,
        lapses: 0,
        lastReview: T0,
        scheduledDays: Math.max(1, elapsed),
      };
      const out = scheduleAll(
        card,
        now,
        makeConfig({ w: FSRS6_DEFAULT_W, tz, enableFuzz: true }),
        `card${i}`,
      );
      expect(out[2].srs.scheduledDays).toBeLessThanOrEqual(out[3].srs.scheduledDays);
      expect(out[3].srs.scheduledDays).toBeLessThan(out[4].srs.scheduledDays);
    }
  });

  it('目標記憶率調高 → 同一張卡的下次間隔變短', () => {
    const c = matureCard();
    const strict = review(
      c,
      3,
      c.due,
      makeConfig({
        w: FSRS6_DEFAULT_W,
        tz,
        enableFuzz: false,
        desiredRetention: 0.95,
      }),
    );
    const loose = review(
      c,
      3,
      c.due,
      makeConfig({
        w: FSRS6_DEFAULT_W,
        tz,
        enableFuzz: false,
        desiredRetention: 0.8,
      }),
    );
    expect(strict.srs.scheduledDays).toBeLessThan(loose.srs.scheduledDays);
  });
});

describe('間隔模糊化（fuzz）', () => {
  it('同樣的種子得到同樣的結果', () => {
    expect(fuzz(30, 10, 36500, 'abc:3')).toBe(fuzz(30, 10, 36500, 'abc:3'));
  });

  it('擾動範圍：間隔 100 天 → 93~107 天（約 ±7%）；間隔 5 天 → 3~7 天；2 天以下不擾動', () => {
    // delta = 1 + 0.15×(7−2.5) + 0.10×(20−7) + 0.05×(100−20) = 6.975
    const seen100 = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const v = fuzz(100, 50, 36500, `k${i}`);
      expect(v).toBeGreaterThanOrEqual(93);
      expect(v).toBeLessThanOrEqual(107);
      seen100.add(v);
      const v5 = fuzz(5, 0, 36500, `k${i}`);
      expect(v5).toBeGreaterThanOrEqual(3);
      expect(v5).toBeLessThanOrEqual(7);
    }
    expect(seen100.has(93) && seen100.has(107)).toBe(true);
    expect(fuzz(2, 0, 36500, 'x')).toBe(2);
  });

  it('不同卡片會被分散到不同天', () => {
    const values = new Set(Array.from({ length: 50 }, (_, i) => fuzz(30, 10, 36500, `card${i}:4`)));
    expect(values.size).toBeGreaterThan(3);
  });
});

describe('按鈕上的間隔文字', () => {
  it.each([
    [30_000, '<1分'],
    [10 * MINUTE, '10分'],
    [3 * HOUR, '3小時'],
    [4 * DAY, '4天'],
    [60 * DAY, '2個月'],
    [548 * DAY, '1.5年'],
  ])('%d ms → %s', (ms, label) => {
    expect(formatInterval(ms)).toBe(label);
  });
});
