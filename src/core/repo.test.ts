import { describe, expect, it } from 'vitest';
import { createCard } from './deck';
import {
  KEYS,
  MemoryKV,
  SafeKV,
  exportBackup,
  loadData,
  monthKey,
  parseBackup,
  replaceAll,
  saveCards,
  saveLogs,
} from './repo';
import { DEFAULT_SETTINGS, type ReviewLog } from './types';

const log = (at: number, id = 'a'): ReviewLog => ({
  cardId: id,
  rating: 3,
  at,
  stateBefore: 'review',
  elapsedDays: 3,
  scheduledDays: 7,
  stabilityAfter: 7,
  difficultyAfter: 5,
  predictedRecall: 0.9,
});

describe('儲存層', () => {
  it('空的儲存空間 → 預設設定、空單字本', async () => {
    const data = await loadData(new MemoryKV());
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.cards).toEqual([]);
    expect(data.logs).toEqual([]);
  });

  it('複習紀錄按月份分段，只重寫有變動的月份', async () => {
    const kv = new MemoryKV();
    const oct = log(Date.UTC(2026, 9, 15));
    const nov = log(Date.UTC(2026, 10, 7));
    await saveLogs(kv, [oct], [oct]);
    await saveLogs(kv, [oct, nov], [nov]);
    expect(JSON.parse(kv.map.get(KEYS.logIndex)!)).toEqual([monthKey(oct.at), monthKey(nov.at)]);
    expect(JSON.parse(kv.map.get(KEYS.logs(monthKey(nov.at)))!)).toHaveLength(1);
    const data = await loadData(kv);
    expect(data.logs.map((l) => l.at)).toEqual([oct.at, nov.at]);
  });

  it('資料損毀時不會讓 App 打不開', async () => {
    const kv = new MemoryKV();
    await kv.setItem(KEYS.cards, '{壞掉的 JSON');
    await kv.setItem(KEYS.settings, 'null');
    const data = await loadData(kv);
    expect(data.cards).toEqual([]);
    expect(data.settings.newPerDay).toBe(DEFAULT_SETTINGS.newPerDay);
  });

  it('底層儲存丟錯時，自動改用記憶體並標記 degraded', async () => {
    const broken = {
      getItem: async () => {
        throw new Error('SecurityError');
      },
      setItem: async () => {
        throw new Error('SecurityError');
      },
      removeItem: async () => {
        throw new Error('SecurityError');
      },
    };
    const kv = new SafeKV(broken);
    const card = createCard({ kind: 'word', ja: '{駅|えき}', meaning: '車站' }, 'manual', 1, 'id1');
    await saveCards(kv, [card]);
    expect(kv.degraded).toBe(true);
    expect((await loadData(kv)).cards).toHaveLength(1);
  });

  it('匯出備份不包含 API Key；匯入時保留目前裝置的金鑰', async () => {
    const card = createCard({ kind: 'word', ja: '{駅|えき}', meaning: '車站' }, 'manual', 1, 'id1');
    const json = exportBackup({
      settings: { ...DEFAULT_SETTINGS, geminiApiKey: 'SECRET' },
      cards: [card],
      logs: [log(5)],
    });
    expect(json).not.toContain('SECRET');
    const restored = parseBackup(json, {
      ...DEFAULT_SETTINGS,
      geminiApiKey: 'MINE',
    });
    expect(restored.cards).toHaveLength(1);
    expect(restored.settings.geminiApiKey).toBe('MINE');
    expect(() => parseBackup('{"app":"other"}', DEFAULT_SETTINGS)).toThrow(/Hibi/);
    expect(() => parseBackup('不是 JSON', DEFAULT_SETTINGS)).toThrow(/JSON/);
  });

  it('整批取代（匯入備份）會清掉舊的紀錄分段', async () => {
    const kv = new MemoryKV();
    const old = log(Date.UTC(2026, 0, 5));
    await saveLogs(kv, [old], [old]);
    await replaceAll(kv, {
      settings: DEFAULT_SETTINGS,
      cards: [],
      logs: [log(Date.UTC(2026, 10, 1))],
    });
    expect(kv.map.has(KEYS.logs(monthKey(old.at)))).toBe(false);
    expect((await loadData(kv)).logs).toHaveLength(1);
  });
});
