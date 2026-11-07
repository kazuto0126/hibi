import { describe, expect, it } from 'vitest';
import { buildQueue, createCard, filterNew, introducedToday, knownKeys, nextLearningDue } from './deck';
import { FSRS6_DEFAULT_W } from './fsrs';
import { makeConfig, review } from './scheduler';
import { forecast, retention, streak, summarize } from './stats';
import { DAY, HOUR, MINUTE } from './time';
import type { Card, ReviewLog } from './types';

const tz = () => 8 * HOUR;
const cfg = makeConfig({ w: FSRS6_DEFAULT_W, enableFuzz: false, tz });
const T0 = Date.UTC(2026, 10, 7, 2, 0, 0); // 台北 10:00

function card(ja: string, createdAt = T0): Card {
  return createCard({ kind: 'word', ja, meaning: '測試' }, 'manual', createdAt, ja);
}

describe('去重', () => {
  it('過濾掉單字本已有的、以及同一批重複的項目（忽略標註差異）', () => {
    const deck = [card('{駅|えき}')];
    const items = [{ ja: '駅' }, { ja: '{電車|でんしゃ}' }, { ja: '電車' }, { ja: '' }];
    expect(filterNew(items, knownKeys(deck)).map((i) => i.ja)).toEqual(['{電車|でんしゃ}']);
  });
});

describe('複習佇列', () => {
  it('順序：到期學習卡 → 到期複習卡 → 新卡（受每日上限限制）', () => {
    const fresh = Array.from({ length: 5 }, (_, i) => card(`新${i}`, T0 + i));
    const learning = {
      ...card('学習'),
      srs: review(card('学習').srs, 3, T0 - 20 * MINUTE, cfg).srs,
    };
    const due = {
      ...card('復習'),
      srs: { ...review(card('復習').srs, 4, T0 - 10 * DAY, cfg).srs },
    };
    const q = buildQueue([...fresh, due, learning], [], T0, 3, tz);
    expect(q.ids).toEqual(['学習', '復習', '新0', '新1', '新2']);
    expect(q.fresh).toBe(3);
  });

  it('今天已經學過的新卡會從上限扣掉', () => {
    const fresh = Array.from({ length: 5 }, (_, i) => card(`新${i}`, T0 + i));
    const logs: ReviewLog[] = ['a', 'b'].map((id) => ({
      cardId: id,
      rating: 3,
      at: T0 - HOUR,
      stateBefore: 'new',
      elapsedDays: 0,
      scheduledDays: 0,
      stabilityAfter: 2,
      difficultyAfter: 5,
      predictedRecall: null,
    }));
    expect(introducedToday(logs, T0, tz)).toBe(2);
    expect(buildQueue(fresh, logs, T0, 3, tz).fresh).toBe(1);
  });

  it('沒有別的卡時，20 分鐘內到期的學習卡會提前出現', () => {
    const c = card('学習');
    const s = review(c.srs, 3, T0, cfg).srs; // 10 分鐘後到期
    const q = buildQueue([{ ...c, srs: s }], [], T0 + MINUTE, 0, tz);
    expect(q.ids).toEqual(['学習']);
    expect(nextLearningDue([{ ...c, srs: s }], T0)?.count).toBe(1);
  });
});

describe('統計', () => {
  const log = (
    at: number,
    rating: 1 | 2 | 3 | 4,
    stateBefore: ReviewLog['stateBefore'],
    p: number | null,
  ): ReviewLog => ({
    cardId: 'x',
    rating,
    at,
    stateBefore,
    elapsedDays: 1,
    scheduledDays: 1,
    stabilityAfter: 1,
    difficultyAfter: 5,
    predictedRecall: p,
  });

  it('連續學習天數：今天還沒複習時，從昨天往回算', () => {
    const logs = [
      log(T0 - DAY, 3, 'review', 0.9),
      log(T0 - 2 * DAY, 3, 'review', 0.9),
      log(T0 - 4 * DAY, 3, 'review', 0.9),
    ];
    expect(streak(logs, T0, tz)).toBe(2);
    expect(streak([...logs, log(T0, 3, 'review', 0.9)], T0, tz)).toBe(3);
    expect(streak([], T0, tz)).toBe(0);
  });

  it('真實記憶率 vs. 預測記憶率（只算複習卡）', () => {
    const logs = [
      log(T0, 3, 'review', 0.9),
      log(T0, 3, 'review', 0.9),
      log(T0, 1, 'review', 0.8),
      log(T0, 2, 'review', 0.9),
      log(T0, 1, 'learning', null),
    ];
    const r = retention(logs, T0);
    expect(r.count).toBe(4);
    expect(r.actual).toBeCloseTo(0.75);
    expect(r.predicted).toBeCloseTo(0.875);
  });

  it('未來 7 天到期預測與單字本摘要', () => {
    const a = {
      ...card('a'),
      srs: {
        ...card('a').srs,
        state: 'review' as const,
        due: T0 - DAY,
        scheduledDays: 30,
      },
    };
    const b = {
      ...card('b'),
      srs: {
        ...card('b').srs,
        state: 'review' as const,
        due: T0 + 2 * DAY,
        scheduledDays: 3,
      },
    };
    const n = card('c');
    expect(forecast([a, b, n], T0, 7, tz)).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(summarize([a, b, n])).toEqual({
      total: 3,
      fresh: 1,
      learning: 0,
      mature: 1,
    });
  });
});
