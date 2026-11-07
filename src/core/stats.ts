/**
 * 學習統計。除了給使用者看，也是評估排程演算法的依據：
 * 「模型預測會記得的機率」和「實際記得的比例」是否一致（校準，calibration）。
 */

import { TzOffsetFn, learningDay, localTzOffset } from './time';
import type { Card, ReviewLog } from './types';

/** 未來 n 天每天有幾張複習卡到期（已逾期的算在今天） */
export function forecast(cards: Card[], now: number, days = 7, tz: TzOffsetFn = localTzOffset): number[] {
  const today = learningDay(now, tz);
  const out = new Array<number>(days).fill(0);
  for (const c of cards) {
    if (c.srs.state === 'new') continue;
    const d = Math.max(0, learningDay(c.srs.due, tz) - today);
    if (d < days) out[d] += 1;
  }
  return out;
}

/** 連續學習天數：從今天（或昨天，如果今天還沒複習）往回數 */
export function streak(logs: ReviewLog[], now: number, tz: TzOffsetFn = localTzOffset): number {
  if (logs.length === 0) return 0;
  const days = new Set(logs.map((l) => learningDay(l.at, tz)));
  let d = learningDay(now, tz);
  if (!days.has(d)) d -= 1;
  let n = 0;
  while (days.has(d)) {
    n += 1;
    d -= 1;
  }
  return n;
}

export interface RetentionReport {
  /** 統計到的「複習卡」次數（不含學習步驟） */
  count: number;
  /** 實際記得的比例（評分 ≥ 困難） */
  actual: number | null;
  /** 模型事前預測的平均記得機率 */
  predicted: number | null;
}

/**
 * 真實記憶率 vs. 預測記憶率。
 * 如果兩者接近，代表 FSRS 的記憶模型對這個使用者是準的；
 * 差很多，就是該用自己的複習紀錄重新訓練參數的訊號。
 */
export function retention(logs: ReviewLog[], now: number, windowDays = 30): RetentionReport {
  const since = now - windowDays * 86_400_000;
  const rel = logs.filter((l) => l.stateBefore === 'review' && l.at >= since);
  if (rel.length === 0) return { count: 0, actual: null, predicted: null };
  const recalled = rel.filter((l) => l.rating >= 2).length;
  const preds = rel.map((l) => l.predictedRecall).filter((p): p is number => p !== null);
  return {
    count: rel.length,
    actual: recalled / rel.length,
    predicted: preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : null,
  };
}

export interface DeckSummary {
  total: number;
  fresh: number;
  learning: number;
  /** 複習間隔 ≥ 21 天，視為「已熟記」（Anki 的 mature 定義） */
  mature: number;
}

export function summarize(cards: Card[]): DeckSummary {
  let fresh = 0;
  let learning = 0;
  let mature = 0;
  for (const c of cards) {
    if (c.srs.state === 'new') fresh++;
    else if (c.srs.state === 'learning' || c.srs.state === 'relearning') learning++;
    if (c.srs.state === 'review' && c.srs.scheduledDays >= 21) mature++;
  }
  return { total: cards.length, fresh, learning, mature };
}
