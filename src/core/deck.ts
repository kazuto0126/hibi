/**
 * 單字本（deck）的操作：建立卡片、去重、排出今天的複習佇列。
 */

import { dedupeKey } from './ruby';
import { newSrs } from './scheduler';
import { MINUTE, TzOffsetFn, learningDay, localTzOffset } from './time';
import type { Card, CardSource, ReviewLog, SuggestedItem } from './types';

let counter = 0;
export function makeId(now = Date.now()): string {
  counter = (counter + 1) % 1296;
  return `${now.toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

export function createCard(item: SuggestedItem, source: CardSource, now: number, id = makeId(now)): Card {
  return {
    id,
    kind: item.kind,
    ja: item.ja.trim(),
    meaning: item.meaning.trim(),
    example: item.example,
    note: item.note,
    tags: item.tags ?? [],
    jlpt: item.jlpt,
    source,
    createdAt: now,
    srs: newSrs(now),
  };
}

/** 回傳單字本裡已經有的日文（去標註後），讓 AI 推薦時避開 */
export function knownKeys(cards: Card[]): Set<string> {
  return new Set(cards.map((c) => dedupeKey(c.ja)));
}

/** 過濾掉單字本已經有的、以及這批裡重複的項目 */
export function filterNew<T extends { ja: string }>(items: T[], known: Set<string>): T[] {
  const seen = new Set(known);
  const out: T[] = [];
  for (const it of items) {
    const k = dedupeKey(it.ja);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** 今天（以學習日計）已經開始學的新卡數 */
export function introducedToday(logs: ReviewLog[], now: number, tz: TzOffsetFn = localTzOffset): number {
  const today = learningDay(now, tz);
  const ids = new Set<string>();
  for (const l of logs) if (l.stateBefore === 'new' && learningDay(l.at, tz) === today) ids.add(l.cardId);
  return ids.size;
}

export interface QueueInfo {
  /** 依序要出現的卡片 id */
  ids: string[];
  learning: number;
  review: number;
  fresh: number;
}

/** 學習步驟的卡片，若 20 分鐘內就到期、而且沒有別的卡可做，就提前出現（同 Anki 的 learn ahead） */
const LEARN_AHEAD = 20 * MINUTE;

/**
 * 排出現在要複習的佇列：
 *   1. 到期的學習中／重學卡（短間隔，最怕拖）
 *   2. 到期的複習卡（越早到期越前面）
 *   3. 新卡（不超過每日上限）
 */
export function buildQueue(
  cards: Card[],
  logs: ReviewLog[],
  now: number,
  newPerDay: number,
  tz: TzOffsetFn = localTzOffset,
): QueueInfo {
  const learning = cards
    .filter((c) => (c.srs.state === 'learning' || c.srs.state === 'relearning') && c.srs.due <= now)
    .sort((a, b) => a.srs.due - b.srs.due);
  const review = cards
    .filter((c) => c.srs.state === 'review' && c.srs.due <= now)
    .sort((a, b) => a.srs.due - b.srs.due);
  const remainingNew = Math.max(0, newPerDay - introducedToday(logs, now, tz));
  const fresh = cards
    .filter((c) => c.srs.state === 'new')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, remainingNew);

  let ids = [...learning, ...review, ...fresh].map((c) => c.id);
  if (ids.length === 0) {
    ids = cards
      .filter(
        (c) => (c.srs.state === 'learning' || c.srs.state === 'relearning') && c.srs.due <= now + LEARN_AHEAD,
      )
      .sort((a, b) => a.srs.due - b.srs.due)
      .map((c) => c.id);
  }
  return {
    ids,
    learning: learning.length,
    review: review.length,
    fresh: fresh.length,
  };
}

/** 下一張學習步驟卡什麼時候到期（佇列空了的時候，用來顯示「10 分鐘後還有 3 張」） */
export function nextLearningDue(cards: Card[], now: number): { at: number; count: number } | null {
  const pending = cards.filter(
    (c) => (c.srs.state === 'learning' || c.srs.state === 'relearning') && c.srs.due > now,
  );
  if (pending.length === 0) return null;
  const at = Math.min(...pending.map((c) => c.srs.due));
  return { at, count: pending.length };
}
