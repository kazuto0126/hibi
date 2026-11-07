import { describe, expect, it } from 'vitest';
import { STARTER } from './data/starter';
import { FSRS6_DEFAULT_W } from './fsrs';
import { makeConfig } from './scheduler';
import { simulateHistory } from './sim';
import { retention } from './stats';
import { HOUR } from './time';

const cfg = makeConfig({ w: FSRS6_DEFAULT_W, tz: () => 8 * HOUR });
const NOW = Date.UTC(2026, 10, 7, 4, 0); // 台北 12:00

describe('示範資料（模擬學習者）', () => {
  const { cards, logs } = simulateHistory(STARTER.slice(0, 40), NOW, cfg);

  it('三週每天 5 張新卡 → 40 張全部開始學習，且所有紀錄都在現在之前', () => {
    expect(cards).toHaveLength(40);
    expect(cards.every((c) => c.srs.state !== 'new')).toBe(true);
    expect(logs.length).toBeGreaterThan(150);
    expect(logs.every((l) => l.at < NOW)).toBe(true);
  });

  it('同樣的種子產生同樣的資料', () => {
    const again = simulateHistory(STARTER.slice(0, 40), NOW, cfg);
    expect(again.logs.map((l) => l.rating)).toEqual(logs.map((l) => l.rating));
  });

  it('有已經畢業的複習卡，統計畫面有東西可以看', () => {
    expect(cards.filter((c) => c.srs.state === 'review').length).toBeGreaterThan(20);
    expect(retention(logs, NOW).count).toBeGreaterThan(20);
  });
});
