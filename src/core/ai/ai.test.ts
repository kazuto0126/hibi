import { describe, expect, it, vi } from 'vitest';
import { createClaudeProvider, type SampleFn } from './claude';
import { createDemoProvider, matchFaq, pickForScenarios } from './demo';
import { createGeminiProvider, toAiError } from './gemini';
import { extractJson, normalizeItem, parseItems, parseSuggest } from './parse';
import { AiError } from './provider';

describe('解析 AI 輸出', () => {
  it('從 ```json 包裝、前後說明文字裡挖出 JSON', () => {
    expect(extractJson('好的！\n```json\n{"a":1}\n```\n希望有幫助')).toEqual({
      a: 1,
    });
  });

  it('容忍結尾多餘的逗號', () => {
    expect(extractJson('{"items":[{"a":1},],}')).toEqual({ items: [{ a: 1 }] });
  });

  it('完全不是 JSON 時丟出 format 錯誤', () => {
    expect(() => extractJson('抱歉，我無法回答')).toThrow(AiError);
  });

  it('逐項驗證：缺欄位的丟掉、種類自動推斷、Anki 讀音格式自動修正', () => {
    const items = parseItems({
      items: [
        { ja: '勉強[べんきょう]する', meaning: '讀書' },
        { kind: 'sentence', ja: '', meaning: '空的' },
        {
          ja: '〜てもいいですか',
          meaning: '可以～嗎',
          example: { ja: '{見|み}てもいいですか。', zh: '可以看嗎？' },
        },
        {
          ja: '{今日|きょう}は{本当|ほんとう}に{楽|たの}しかったです。',
          meaning: '今天真的很開心。',
        },
        'garbage',
        {
          kind: 'word',
          ja: '{駅|えき}',
          meaning: '車站',
          jlpt: 'N9',
          example: { ja: '例', zh: '' },
        },
      ],
    });
    expect(items.map((i) => [i.kind, i.ja])).toEqual([
      ['word', '{勉強|べんきょう}する'],
      ['grammar', '〜てもいいですか'],
      ['sentence', '{今日|きょう}は{本当|ほんとう}に{楽|たの}しかったです。'],
      ['word', '{駅|えき}'],
    ]);
    expect(items[3].jlpt).toBeUndefined();
    expect(items[3].example).toBeUndefined();
  });

  it('沒有任何可用卡片時，parseSuggest 給出可行動的錯誤訊息', () => {
    expect(() => parseSuggest({ diaryJa: 'x', items: [] })).toThrow(/換個寫法/);
    expect(normalizeItem(null)).toBeNull();
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });
}

const GOOD = {
  candidates: [
    {
      content: {
        parts: [
          { text: '先想一下…', thought: true },
          {
            text: '{"diaryJa":"{今日|きょう}はラーメンを{食|た}べた。","items":[{"kind":"word","ja":"ラーメン","meaning":"拉麵"}]}',
          },
        ],
      },
    },
  ],
};

describe('Gemini provider', () => {
  it('送出正確的請求：金鑰放在 header、JSON 模式、低思考層級；忽略思考內容', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, GOOD));
    const p = createGeminiProvider({
      apiKey: 'k-123',
      model: 'gemini-3.8-flash',
      fetchFn,
    });
    const out = await p.suggest({
      diary: '今天吃拉麵',
      scenarios: ['吃飯'],
      learner: { level: 'kana', goals: ['travel'], interests: ['food'] },
      known: ['駅'],
    });

    expect(out.items[0].ja).toBe('ラーメン');
    expect(out.diaryJa).toContain('{今日|きょう}');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('k-123');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-123');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'low',
    });
    expect(body.contents[0].parts[0].text).toContain('已學過（不要重複）：駅');
    // 首次設定的資料會放進提示詞
    const system = body.systemInstruction.parts[0].text;
    expect(system).toContain('會五十音');
    expect(system).toContain('學習目的：旅遊');
    expect(system).toContain('興趣：美食');
    expect(system).toContain('初學者');
  });

  it('模型不支援 thinkingLevel 時，拿掉參數自動重試一次', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: { message: 'thinking_level is not supported' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, GOOD));
    const p = createGeminiProvider({
      apiKey: 'k',
      model: 'gemini-3.5-flash-lite',
      fetchFn,
    });
    await p.suggest({ diary: 'x', scenarios: [], learner: null, known: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(retryBody.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('對話時把 assistant 角色轉成 Gemini 的 model 角色', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '答案' }] } }],
      }),
    );
    const p = createGeminiProvider({
      apiKey: 'k',
      model: 'gemini-3.8-flash',
      fetchFn,
    });
    const seen: string[] = [];
    const text = await p.chat(
      [
        { role: 'user', content: '問題一' },
        { role: 'assistant', content: '回答一' },
        { role: 'user', content: '問題二' },
      ],
      { onText: (t) => seen.push(t) },
    );
    expect(text).toBe('答案');
    expect(seen).toEqual(['答案']);
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });

  it.each([
    [400, 'API key not valid. Please pass a valid API key.', 'auth'],
    [403, 'permission denied', 'auth'],
    [404, 'models/x is not found', 'model'],
    [429, 'quota exceeded', 'quota'],
    [503, 'overloaded', 'unknown'],
  ])('HTTP %d → %s 類錯誤（%s）', (status, detail, code) => {
    expect(toAiError(status, detail).code).toBe(code);
  });

  it('網路中斷 → network 錯誤', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const p = createGeminiProvider({
      apiKey: 'k',
      model: 'gemini-3.8-flash',
      fetchFn,
    });
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ code: 'network' });
  });
});

describe('Claude provider（網頁 Demo 用）', () => {
  it('把家教設定接在第一則訊息前面，並轉傳串流文字', async () => {
    const sample = vi.fn<SampleFn>(async (_input, opts) => {
      opts?.onText?.({ text: '部分', delta: '部分' });
      return { text: '完整回答' };
    });
    const p = createClaudeProvider(sample);
    const seen: string[] = [];
    const out = await p.chat([{ role: 'user', content: '「は」怎麼用？' }], {
      onText: (t) => seen.push(t),
    });
    expect(out).toBe('完整回答');
    expect(seen).toEqual(['部分']);
    const msgs = sample.mock.calls[0][0] as { role: string; content: string }[];
    expect(msgs[0].content).toContain('日文家教');
    expect(msgs[0].content).toContain('「は」怎麼用？');
  });

  it('使用者沒有允許時 → consent 錯誤', async () => {
    const p = createClaudeProvider(async () => {
      throw { code: 'not_granted', message: 'no' };
    });
    await expect(p.suggest({ diary: 'x', scenarios: [], learner: null, known: [] })).rejects.toMatchObject({
      code: 'consent',
    });
  });
});

describe('離線示範 provider', () => {
  const demo = createDemoProvider();

  it('依日記內容挑出相關情境的卡片，並避開已學過的', async () => {
    const out = await demo.suggest({
      diary: '今天在便利商店買便當，店員問要不要加熱',
      scenarios: [],
      learner: null,
      known: ['袋'],
    });
    expect(out.diaryJa).toBeNull();
    expect(out.items.length).toBeGreaterThan(3);
    expect(out.items.every((i) => i.tags?.includes('konbini'))).toBe(true);
    expect(out.items.some((i) => i.ja === '{袋|ふくろ}')).toBe(false);
  });

  it('日記看不出情境時，改用首次設定的學習目的挑卡；初學者先挑簡單的', async () => {
    const out = await demo.suggest({
      diary: '嗯',
      scenarios: [],
      learner: { level: 'beginner', goals: ['travel'], interests: [] },
      known: [],
    });
    expect(out.items.every((i) => i.tags?.some((t) => ['ryoko', 'shokuji', 'konbini'].includes(t)))).toBe(
      true,
    );
    const words = out.items.filter((i) => i.jlpt);
    expect(words[0].jlpt).toBe('N5');
  });

  it('每種卡片有配額：單字 4、句子 2、文法 1', () => {
    const items = pickForScenarios(['gakko'], new Set());
    expect(items.filter((i) => i.kind === 'word')).toHaveLength(4);
    expect(items.filter((i) => i.kind === 'sentence')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'grammar')).toHaveLength(1);
  });

  it('常見問題有內建答案，答案可以整理成卡片', async () => {
    expect(matchFaq('暑い跟熱い差在哪')).not.toBeNull();
    expect(matchFaq('おいしいです是什麼意思')).toBeNull();
    const answer = await demo.chat([{ role: 'user', content: 'は和が有什麼不同？' }]);
    expect(answer).toContain('主題');
    const cards = await demo.extractCards(answer, null, []);
    expect(cards.length).toBeGreaterThan(0);
  });

  it('沒有對應答案時，說明怎麼接上 AI', async () => {
    const answer = await demo.chat([{ role: 'user', content: '幫我翻譯這首歌' }]);
    expect(answer).toContain('設定');
  });
});
