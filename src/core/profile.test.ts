import { describe, expect, it } from 'vitest';
import {
  DEMO_PROFILE,
  isBeginner,
  learnerContext,
  levelGuidance,
  preferredScenarios,
  sanitizeProfile,
  starterTagsFor,
} from './profile';
import { MemoryKV, KEYS, loadData } from './repo';

describe('學習者資料', () => {
  it('零基礎、會五十音算初學者（要顯示羅馬拼音）；N5 以上不算', () => {
    expect(isBeginner({ level: 'beginner', goals: [], interests: [] })).toBe(true);
    expect(isBeginner({ level: 'kana', goals: [], interests: [] })).toBe(true);
    expect(isBeginner({ level: 'N5', goals: [], interests: [] })).toBe(false);
    expect(isBeginner(null)).toBe(false);
  });

  it('提示詞裡的學習者描述包含程度、目的、興趣', () => {
    const text = learnerContext({ level: 'kana', goals: ['travel', 'anime_drama'], interests: ['games'] });
    expect(text).toContain('會五十音（看得懂平假名、片假名）');
    expect(text).toContain('學習目的：旅遊、追劇動漫');
    expect(text).toContain('興趣：遊戲');
    expect(levelGuidance({ level: 'beginner', goals: [], interests: [] })).toContain('初學者');
    expect(learnerContext(null)).toContain('N4');
  });

  it('新手包：基本會話＋學習目的對應的情境，最多 4 個', () => {
    expect(starterTagsFor({ level: 'N5', goals: ['travel'], interests: [] })).toEqual([
      'kihon',
      'ryoko',
      'shokuji',
      'konbini',
    ]);
    expect(starterTagsFor({ level: 'N5', goals: ['work'], interests: [] })).toEqual([
      'kihon',
      'shigoto',
      'kotsu',
    ]);
    expect(starterTagsFor(null)).toEqual(['kihon', 'gakko', 'shokuji']);
  });

  it('偏好情境：先看學習目的，再看興趣，不重複', () => {
    expect(
      preferredScenarios({ level: 'N4', goals: ['exam'], interests: ['food', 'anime', 'drama'] }),
    ).toEqual(['gakko', 'shokuji', 'shumi']);
  });

  it('不合法的資料一律當成還沒設定，部分錯誤的欄位會被濾掉', () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile({ level: 'N9' })).toBeNull();
    expect(sanitizeProfile({ level: 'N3', goals: ['travel', 'hack'], interests: 'games' })).toEqual({
      level: 'N3',
      goals: ['travel'],
      interests: [],
    });
    expect(sanitizeProfile(DEMO_PROFILE)).toEqual(DEMO_PROFILE);
  });

  it('從 v1 升級：舊的 learnerLevel 欄位會被拿掉，學習者資料為 null（會出現首次設定）', async () => {
    const kv = new MemoryKV();
    await kv.setItem(KEYS.settings, JSON.stringify({ learnerLevel: 'N3', newPerDay: 20 }));
    const { settings } = await loadData(kv);
    expect(settings.profile).toBeNull();
    expect(settings.newPerDay).toBe(20);
    expect('learnerLevel' in settings).toBe(false);
  });
});
