/**
 * 內建詞庫的品質檢查。
 *
 * 讀音是人工輸入的，很容易打錯。這裡用 kuromoji（日文形態素分析器，內建 IPA 辭典）
 * 自動算出每一句的讀音，和人工標註比對。分析器也會犯錯（例如「十分」它會讀成
 * 「じゅうぶん」＝足夠），所以人工確認過的例外列在 REVIEWED 白名單裡，並註明理由。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dedupeKey, kataToHira, missingRuby, toPlain, toReading } from '../ruby';
import { SCENARIO_BY_ID, SCENARIOS, detectScenarios } from './scenarios';
import { REVIEWED } from './reviewed';
import { STARTER } from './starter';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const kuromoji = require('kuromoji') as typeof import('kuromoji');

type Tokenizer = import('kuromoji').Tokenizer<import('kuromoji').IpadicFeatures>;
let tokenizer: Tokenizer;

beforeAll(async () => {
  const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
  tokenizer = await new Promise<Tokenizer>((resolve, reject) =>
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t))),
  );
}, 30_000);

function analyzerReading(plain: string): string {
  return kataToHira(
    tokenizer
      .tokenize(plain)
      .map((t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form))
      .join(''),
  );
}

/** 每一張卡要檢查的日文：本體＋例句 */
const TEXTS = STARTER.flatMap((it) => [it.ja, ...(it.example ? [it.example.ja] : [])]).filter(
  (ja) => !ja.startsWith('〜'),
);

describe('內建詞庫', () => {
  it('共 116 項，每個情境至少 8 項', () => {
    expect(STARTER).toHaveLength(116);
    for (const sc of [...SCENARIOS.map((s) => s.id), 'kihon']) {
      expect(STARTER.filter((i) => i.tags?.includes(sc)).length).toBeGreaterThanOrEqual(8);
    }
  });

  it('沒有重複的卡片', () => {
    const keys = STARTER.map((i) => dedupeKey(i.ja));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('所有漢字都有標讀音（本體與例句）', () => {
    for (const it of STARTER) {
      expect(missingRuby(it.ja), it.ja).toBe(false);
      if (it.example) expect(missingRuby(it.example.ja), it.example.ja).toBe(false);
    }
  });

  it('單字與文法都附例句，中文意思不為空', () => {
    for (const it of STARTER) {
      expect(it.meaning.trim().length, it.ja).toBeGreaterThan(0);
      if (it.kind !== 'sentence') expect(it.example, it.ja).toBeDefined();
    }
  });

  it('人工標註的讀音與 kuromoji 分析結果一致（白名單除外）', () => {
    const mismatches: string[] = [];
    for (const ja of TEXTS) {
      const plain = toPlain(ja);
      if (plain in REVIEWED) continue;
      const mine = kataToHira(toReading(ja));
      const theirs = analyzerReading(plain);
      if (mine !== theirs) mismatches.push(`${plain}\n    標註：${mine}\n    分析：${theirs}`);
    }
    expect(mismatches, `\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('情境偵測：從中文日記猜出相關情境', () => {
    expect(detectScenarios('今天跟室友去吃拉麵，晚上還有期末報告要趕')).toEqual(
      expect.arrayContaining(['shokuji', 'gakko', 'tomodachi']),
    );
    expect(detectScenarios('搭捷運去打工，結果下大雨')[0]).toBeDefined();
    expect(detectScenarios('asdf')).toEqual([]);
    expect(SCENARIO_BY_ID.gakko.label).toBe('上課');
  });
});
