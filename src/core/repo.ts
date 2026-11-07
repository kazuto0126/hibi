/**
 * 資料儲存。
 *
 * 透過一個極簡的 KV 介面（getItem / setItem / removeItem）存取，
 * 手機上接 AsyncStorage、網頁上接 localStorage、測試時接記憶體，核心邏輯完全不用改。
 *
 * 分成多個 key 存，而不是一大包 JSON：
 *   - Android 的 AsyncStorage 單一筆資料超過約 2MB 會讀不出來
 *   - 複習紀錄會一直變多，所以按月份分段（hibi:v1:logs:2026-11），每次只重寫當月那一段
 */
import { sanitizeProfile } from './profile';
import type { Card, ReviewLog, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryKV implements KV {
  readonly map = new Map<string, string>();
  async getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  async removeItem(key: string) {
    this.map.delete(key);
  }
}

/**
 * 底層儲存失敗時（例如網頁被放在禁止 localStorage 的沙盒裡）自動改用記憶體，
 * App 照樣能用，只是關掉後資料不會留下；degraded 讓介面可以提醒使用者。
 */
export class SafeKV implements KV {
  private fallback = new MemoryKV();
  degraded = false;
  constructor(private inner: KV) {}

  private async run<T>(op: (kv: KV) => Promise<T>): Promise<T> {
    if (!this.degraded) {
      try {
        return await op(this.inner);
      } catch {
        this.degraded = true;
      }
    }
    return op(this.fallback);
  }
  getItem(key: string) {
    return this.run((kv) => kv.getItem(key));
  }
  setItem(key: string, value: string) {
    return this.run((kv) => kv.setItem(key, value));
  }
  removeItem(key: string) {
    return this.run((kv) => kv.removeItem(key));
  }
}

export const KEYS = {
  settings: 'hibi:v1:settings',
  cards: 'hibi:v1:cards',
  logIndex: 'hibi:v1:logs:index',
  logs: (month: string) => `hibi:v1:logs:${month}`,
};

export interface AppData {
  settings: Settings;
  cards: Card[];
  logs: ReviewLog[];
}

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseOr<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export async function loadData(kv: KV): Promise<AppData> {
  const [settingsJson, cardsJson, indexJson] = await Promise.all([
    kv.getItem(KEYS.settings),
    kv.getItem(KEYS.cards),
    kv.getItem(KEYS.logIndex),
  ]);
  const settings = normalizeSettings(parseOr<Partial<Settings>>(settingsJson, {}));
  const cards = parseOr<Card[]>(cardsJson, []).filter(isCardLike);
  const months = parseOr<string[]>(indexJson, []);
  const chunks = await Promise.all(months.map((m) => kv.getItem(KEYS.logs(m))));
  const logs = chunks.flatMap((c) => parseOr<ReviewLog[]>(c, [])).sort((a, b) => a.at - b.at);
  return { settings, cards, logs };
}

export async function saveSettings(kv: KV, settings: Settings) {
  await kv.setItem(KEYS.settings, JSON.stringify(settings));
}

export async function saveCards(kv: KV, cards: Card[]) {
  await kv.setItem(KEYS.cards, JSON.stringify(cards));
}

/** 只重寫「這次有新增紀錄的月份」 */
export async function saveLogs(kv: KV, all: ReviewLog[], touched: ReviewLog[]) {
  const months = new Set(touched.map((l) => monthKey(l.at)));
  const index = new Set(parseOr<string[]>(await kv.getItem(KEYS.logIndex), []));
  for (const m of months) {
    await kv.setItem(KEYS.logs(m), JSON.stringify(all.filter((l) => monthKey(l.at) === m)));
    index.add(m);
  }
  await kv.setItem(KEYS.logIndex, JSON.stringify([...index].sort()));
}

export async function replaceAll(kv: KV, data: AppData) {
  const oldIndex = parseOr<string[]>(await kv.getItem(KEYS.logIndex), []);
  await Promise.all(oldIndex.map((m) => kv.removeItem(KEYS.logs(m))));
  await kv.setItem(KEYS.logIndex, '[]');
  await saveSettings(kv, data.settings);
  await saveCards(kv, data.cards);
  if (data.logs.length) await saveLogs(kv, data.logs, data.logs);
}

/** 補上新版本才有的設定、拿掉舊版本的欄位（例如 v1 的 learnerLevel），學習者資料檢查過才採用 */
export function normalizeSettings(raw: Partial<Settings> | null): Settings {
  const { learnerLevel: _legacy, ...rest } = (raw ?? {}) as Partial<Settings> & { learnerLevel?: unknown };
  return { ...DEFAULT_SETTINGS, ...rest, profile: sanitizeProfile(rest.profile) };
}

function isCardLike(c: unknown): c is Card {
  const x = c as Card;
  return (
    !!x && typeof x.id === 'string' && typeof x.ja === 'string' && !!x.srs && typeof x.srs.due === 'number'
  );
}

/** 匯出備份。刻意不包含 API Key：備份檔可能被分享或上傳，金鑰不該跟著外流。 */
export function exportBackup(data: AppData, now = Date.now()): string {
  const { geminiApiKey: _omit, ...settings } = data.settings;
  return JSON.stringify({
    app: 'hibi',
    version: 1,
    exportedAt: now,
    settings,
    cards: data.cards,
    logs: data.logs,
  });
}

export function parseBackup(json: string, current: Settings): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('這不是有效的備份檔（JSON 格式錯誤）。');
  }
  const r = raw as {
    app?: string;
    cards?: unknown;
    logs?: unknown;
    settings?: Partial<Settings>;
  };
  if (r?.app !== 'hibi' || !Array.isArray(r.cards) || !Array.isArray(r.logs)) {
    throw new Error('這不是 Hibi 的備份檔。');
  }
  const cards = r.cards.filter(isCardLike);
  const logs = (r.logs as ReviewLog[]).filter(
    (l) => l && typeof l.at === 'number' && typeof l.cardId === 'string',
  );
  return {
    settings: { ...normalizeSettings(r.settings ?? {}), geminiApiKey: current.geminiApiKey },
    cards,
    logs,
  };
}
