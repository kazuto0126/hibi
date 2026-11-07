/**
 * 產生「模擬使用三週」的示範資料。
 *
 * 網頁 Demo 第一次打開時，如果直接是空的，看的人要用好幾天才看得到統計和記憶狀態。
 * 所以用一個模擬學習者，照真實的排程規則跑過三週：每天晚上 9 點複習、每天學 5 張新卡，
 * 每次是否記得依照當下的遺忘曲線擲骰子。資料會清楚標示為示範用。
 *
 * 注意：模擬學習者的記憶就是照 FSRS 模型產生的，所以「實際記憶率接近目標」在這裡是必然的，
 * 不能當成演算法有效的證據 —— 真正的驗證要用真人的複習紀錄（見 docs/導讀.md）。
 */
import { createCard } from './deck';
import { currentRecall, review, type SchedulerConfig } from './scheduler';
import { DAY, HOUR, MINUTE, learningDay, learningDayStart } from './time';
import type { Card, Rating, ReviewLog, SuggestedItem } from './types';

function rng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateHistory(
  items: SuggestedItem[],
  now: number,
  cfg: SchedulerConfig,
  opts: { days?: number; newPerDay?: number; seed?: string } = {},
): { cards: Card[]; logs: ReviewLog[] } {
  const days = opts.days ?? 21;
  const newPerDay = opts.newPerDay ?? 5;
  const rand = rng(opts.seed ?? 'hibi-demo');
  const firstDay = learningDay(now - days * DAY, cfg.tz);

  const pool = [...items];
  const cards: Card[] = [];
  const logs: ReviewLog[] = [];

  for (let d = 0; d < days; d++) {
    // 每天晚上 9 點（學習日從凌晨 4 點開始 → +17 小時）
    let t = learningDayStart(firstDay + d, cfg.tz) + 17 * HOUR;
    if (t >= now) break;
    for (let i = 0; i < newPerDay && pool.length; i++) {
      const it = pool.shift()!;
      cards.push(createCard(it, 'starter', t - 60 * MINUTE + i, `demo-${cards.length}`));
    }
    // 一次複習時段：反覆挑「現在到期」的卡，直到 20 分鐘內都沒有卡到期為止
    for (let guard = 0; guard < 500; guard++) {
      const due = cards.filter((c) => c.srs.due <= t + 20 * MINUTE).sort((a, b) => a.srs.due - b.srs.due)[0];
      if (!due) break;
      t = Math.max(t, due.srs.due) + 20_000;
      const r = currentRecall(due.srs, t, cfg) ?? 0.75;
      const p = due.srs.state === 'review' ? r : due.srs.state === 'new' ? 0.7 : 0.85;
      const recalled = rand() < p;
      const x = rand();
      const rating: Rating = !recalled ? 1 : x < 0.15 ? 2 : x < 0.85 ? 3 : 4;
      const out = review(due.srs, rating, t, cfg, due.id);
      due.srs = out.srs;
      logs.push({ cardId: due.id, ...out.log });
    }
  }
  return { cards, logs };
}
