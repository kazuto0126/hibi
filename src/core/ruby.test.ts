import { describe, expect, it } from 'vitest';
import {
  dedupeKey,
  hasKanji,
  kataToHira,
  missingRuby,
  normalizeRubyMarkup,
  parseRuby,
  toPlain,
  toReading,
} from './ruby';

describe('假名標註 {漢字|かな}', () => {
  const src = '{毎日|まいにち}{日本語|にほんご}を{勉強|べんきょう}しています。';

  it('拆成標註段落與一般文字', () => {
    expect(parseRuby(src)).toEqual([
      { text: '毎日', ruby: 'まいにち' },
      { text: '日本語', ruby: 'にほんご' },
      { text: 'を' },
      { text: '勉強', ruby: 'べんきょう' },
      { text: 'しています。' },
    ]);
  });

  it('推導出純文字與全假名讀音', () => {
    expect(toPlain(src)).toBe('毎日日本語を勉強しています。');
    expect(toReading(src)).toBe('まいにちにほんごをべんきょうしています。');
  });

  it('沒有標註的字串原樣保留', () => {
    expect(parseRuby('ありがとう')).toEqual([{ text: 'ありがとう' }]);
    expect(toPlain('ありがとう')).toBe('ありがとう');
  });

  it('偵測漏標讀音的漢字', () => {
    expect(missingRuby('{今日|きょう}は暑い')).toBe(true);
    expect(missingRuby('{今日|きょう}は{暑|あつ}い')).toBe(false);
    expect(missingRuby('おはよう')).toBe(false);
  });

  it('把 Anki 格式「漢字[かな]」轉成 {漢字|かな}', () => {
    expect(normalizeRubyMarkup('日本語[にほんご]を 勉強[べんきょう]する')).toBe(
      '{日本語|にほんご}を{勉強|べんきょう}する',
    );
    expect(normalizeRubyMarkup('[注意]これは例')).toBe('[注意]これは例');
  });

  it('其他工具函式', () => {
    expect(hasKanji('ラーメン')).toBe(false);
    expect(hasKanji('お会計')).toBe(true);
    expect(kataToHira('ラーメン')).toBe('らーめん');
    expect(dedupeKey('{袋|ふくろ}は要りません。')).toBe(dedupeKey('袋は要りません'));
  });
});
