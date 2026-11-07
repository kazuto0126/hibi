/**
 * 時間相關工具。
 *
 * 「學習日」以凌晨 4 點為分界（和 Anki 一樣）：
 * 晚上 11 點複習、凌晨 1 點又複習，算同一天，不會被當成「隔了一天」。
 * 對常熬夜唸書的大學生來說，這比用午夜分界合理。
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const DAY_START_HOUR = 4;

/** 取得本地時區相對 UTC 的位移（毫秒）。可注入，方便測試。 */
export type TzOffsetFn = (ts: number) => number;
export const localTzOffset: TzOffsetFn = (ts) => -new Date(ts).getTimezoneOffset() * MINUTE;

/** 時間戳屬於第幾個學習日（整數） */
export function learningDay(
  ts: number,
  tz: TzOffsetFn = localTzOffset,
  dayStartHour = DAY_START_HOUR,
): number {
  return Math.floor((ts + tz(ts) - dayStartHour * HOUR) / DAY);
}

/** 第 n 個學習日開始的那一刻（epoch 毫秒） */
export function learningDayStart(
  day: number,
  tz: TzOffsetFn = localTzOffset,
  dayStartHour = DAY_START_HOUR,
): number {
  const approx = day * DAY + dayStartHour * HOUR;
  // 先用近似值求時區位移，再修正一次（處理日光節約時間的邊界）
  const first = approx - tz(approx);
  return approx - tz(first);
}

/** 兩個時間點之間隔了幾個學習日 */
export function elapsedLearningDays(from: number, to: number, tz: TzOffsetFn = localTzOffset): number {
  return Math.max(0, learningDay(to, tz) - learningDay(from, tz));
}

/** 把間隔轉成按鈕上的簡短文字：「<1分」「10分」「3天」「2個月」「1.5年」 */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1分';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}分`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}小時`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}天`;
  if (days < 365) return `${trimNum(days / 30)}個月`;
  return `${trimNum(days / 365)}年`;
}

function trimNum(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

const JA_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 日本式日期：11月7日（土） */
export function formatJaDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日（${JA_WEEKDAYS[d.getDay()]}）`;
}
