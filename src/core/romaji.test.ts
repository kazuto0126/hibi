/**
 * 羅馬拼音的測試。
 *
 * 1. 假名 → 羅馬字的規則（拗音、促音、撥音、長音、外來語）用手寫的例子逐條檢查。
 * 2. 助詞「は／へ／を」的判斷，用 kuromoji 斷詞結果當參考答案：
 *    分析器知道每個字的詞性，詞性是「助詞」的は唸 wa。內建詞庫的每一句都要跟它一致。
 *    （空格是排版用的，比對時忽略。）
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { REVIEWED } from './data/reviewed';
import { STARTER } from './data/starter';
import { kanaToRomaji, toRomaji } from './romaji';
import { toPlain } from './ruby';

describe('假名 → 羅馬字', () => {
  it.each([
    ['すし', 'sushi'],
    ['ちょっと', 'chotto'],
    ['きって', 'kitte'],
    ['まっちゃ', 'matcha'],
    ['しゃしん', 'shashin'],
    ['じゅぎょう', 'jugyou'],
    ['げんいん', "gen'in"],
    ['きんようび', "kin'youbi"],
    ['しんぶん', 'shinbun'],
    ['ラーメン', 'raamen'],
    ['パーティー', 'paatii'],
    ['ファイル', 'fairu'],
    ['ヴァイオリン', 'vaiorin'],
    ['ディズニー', 'dizunii'],
    ['ふじさん', 'fujisan'],
    ['つづく', 'tsuzuku'],
  ])('%s → %s', (kana, romaji) => {
    expect(kanaToRomaji(kana)).toBe(romaji);
  });
});

describe('有讀音標註的句子 → 羅馬拼音', () => {
  it.each([
    ['{今日|きょう}はいい{天気|てんき}ですね。', 'kyou wa ii tenki desune.'],
    ['{荷物|にもつ}を{預|あず}けてもいいですか。', 'nimotsu o azuketemoii desuka.'],
    ['これは{試着|しちゃく}してもいいですか。', 'kore wa shichaku shitemoii desuka.'],
    ['どこへ{行|い}きますか。', 'doko e ikimasuka.'],
    ['{次|つぎ}の{駅|えき}で{乗|の}り{換|か}えます。', 'tsugi no eki de norikaemasu.'],
    ['{雨|あめ}が{降|ふ}ってきた。', 'ame ga futtekita.'],
    ['{上|あ}がる', 'agaru'],
    ['お{釣|つ}りは{三十円|さんじゅうえん}です。', 'otsuri wa sanjuuen desu.'],
    ['ご{飯|はん}を{大盛|おおも}りにしてください。', 'gohan o oomorinishite kudasai.'],
    ['ご{注文|ちゅうもん}はお{決|き}まりですか。', 'gochuumon wa okimari desuka.'],
    ['レシートは{大丈夫|だいじょうぶ}です。', 'reshiito wa daijoubu desu.'],
    ['こんにちは！', 'konnichiwa!'],
    ['〜てもいいですか', 'temoii desuka'],
  ])('%s', (src, romaji) => {
    expect(toRomaji(src)).toBe(romaji);
  });
});

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji') as typeof import('kuromoji');
type Tokenizer = import('kuromoji').Tokenizer<import('kuromoji').IpadicFeatures>;
let tokenizer: Tokenizer;

beforeAll(async () => {
  const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
  tokenizer = await new Promise<Tokenizer>((resolve, reject) =>
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t))),
  );
}, 30_000);

/** 參考答案：用 kuromoji 的詞性判斷助詞，其餘用它算出的讀音 */
function reference(plain: string): string {
  const kana = tokenizer
    .tokenize(plain)
    .map((t) => {
      if (t.pos === '助詞' && t.surface_form === 'は') return 'わ';
      if (t.pos === '助詞' && t.surface_form === 'へ') return 'え';
      return t.reading && t.reading !== '*' ? t.reading : t.surface_form;
    })
    .join('');
  return kanaToRomaji(kana);
}

describe('內建詞庫的羅馬拼音與 kuromoji 斷詞結果一致', () => {
  it('所有句子與例句（分析器讀錯的白名單除外）', () => {
    const texts = STARTER.flatMap((it) => [it.ja, ...(it.example ? [it.example.ja] : [])]).filter(
      (ja) => !ja.startsWith('〜') && !(toPlain(ja) in REVIEWED),
    );
    const mismatches: string[] = [];
    for (const ja of texts) {
      // 空格與撇號（n'）只跟斷詞位置有關，比對發音時去掉
      const mine = toRomaji(ja).replace(/[\s']/g, '');
      const theirs = reference(toPlain(ja)).replace(/[\s']/g, '');
      if (mine !== theirs)
        mismatches.push(`${toPlain(ja)}\n    本程式：${toRomaji(ja)}\n    參考：  ${theirs}`);
    }
    expect(texts.length).toBeGreaterThan(150);
    expect(mismatches, `\n${mismatches.join('\n')}`).toEqual([]);
  });
});
