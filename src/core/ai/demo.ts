/**
 * 離線示範模式：不連網、不需要金鑰。
 *
 * - 日記推薦：用關鍵字判斷情境，再從內建詞庫挑卡片
 * - 問答：回答幾個學日文最常卡住的問題
 * 目的是讓任何人（包括面試官、教授）打開 Demo 就能完整走過一次流程。
 */
import { SCENARIO_BY_ID, detectScenarios, type ScenarioId } from '../data/scenarios';
import { STARTER } from '../data/starter';
import { dedupeKey, toPlain } from '../ruby';
import { isBeginner, preferredScenarios } from '../profile';
import type { LearnerProfile, SuggestedItem } from '../types';
import type { AiProvider, ChatMessage } from './provider';

const KIND_QUOTA = { word: 4, sentence: 2, grammar: 1 } as const;

const LEVEL_RANK: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/**
 * 從內建詞庫挑卡：依情境順序、每種卡有配額。
 * 初學者（零基礎、會五十音、N5）先挑等級低的；沒標等級的當作 N3。
 */
export function pickForScenarios(
  ids: ScenarioId[],
  known: Set<string>,
  limit = 7,
  learner: LearnerProfile | null = null,
): SuggestedItem[] {
  const order: ScenarioId[] = ids.length ? ids : ['kihon'];
  let pool = order.flatMap((id) =>
    STARTER.filter((it) => it.tags?.includes(id) && !known.has(dedupeKey(it.ja))),
  );
  if (isBeginner(learner) || learner?.level === 'N5') {
    const rank = (it: SuggestedItem) => LEVEL_RANK[it.jlpt ?? 'N3'];
    pool = pool
      .map((it, i) => ({ it, i }))
      .sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i)
      .map((x) => x.it);
  }
  const picked: SuggestedItem[] = [];
  const count = { word: 0, sentence: 0, grammar: 0 };
  for (const it of pool) {
    if (picked.length >= limit) break;
    if (count[it.kind] >= KIND_QUOTA[it.kind]) continue;
    count[it.kind]++;
    picked.push(it);
  }
  // 配額沒填滿（例如某情境的文法都學過了）→ 不分種類補滿
  for (const it of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(it)) picked.push(it);
  }
  return picked;
}

interface Faq {
  keys: string[][];
  answer: string;
  cards: SuggestedItem[];
}

const FAQS: Faq[] = [
  {
    keys: [
      ['は', 'が', '差'],
      ['は', 'が', '不同'],
      ['は', 'が', '分'],
      ['は', 'が', '區別'],
      ['は', 'が', '怎麼用'],
    ],
    answer: `簡單說：「は」標示**主題**（我們在聊什麼），「が」標示**主語**，而且常帶有「就是這個」的強調。
- {私|わたし}は{学生|がくせい}です。— 說到我，我是學生。
- {私|わたし}が{学生|がくせい}です。— （在場的人裡）我才是學生。
- {誰|だれ}が{来|き}ましたか。— 疑問詞當主語時用「が」，不能用「は」。
另外，描述眼前看到的事也常用「が」：{雨|あめ}が{降|ふ}っている。`,
    cards: [
      {
        kind: 'sentence',
        ja: '{誰|だれ}が{来|き}ましたか。',
        meaning: '誰來了？',
        note: '疑問詞當主語時用「が」。',
      },
      {
        kind: 'sentence',
        ja: '{雨|あめ}が{降|ふ}っている。',
        meaning: '正在下雨。',
        note: '描述眼前的現象用「が」。',
      },
    ],
  },
  {
    keys: [['です', 'ます', '體'], ['敬語'], ['常體'], ['禮貌體'], ['丁寧']],
    answer: `「です・ます」是**禮貌體**，對老師、店員、第一次見面的人用；**常體**（{行|い}く、{食|た}べる、だ）是朋友和家人之間用的。
- 禮貌：{明日|あした}{行|い}きます。
- 朋友間：{明日|あした}{行|い}く。
同一段話裡盡量不要混用。不確定彼此關係時，用「です・ます」最安全。`,
    cards: [
      {
        kind: 'sentence',
        ja: '{明日|あした}{行|い}きます。',
        meaning: '我明天會去。（禮貌體）',
      },
      {
        kind: 'sentence',
        ja: '{明日|あした}{行|い}く。',
        meaning: '我明天會去。（常體，對朋友）',
      },
    ],
  },
  {
    keys: [['すみません'], ['ごめん'], ['道歉']],
    answer: `兩個都能道歉，差在場合：
- **すみません**：比較正式，對陌生人、長輩用；也能拿來叫人（不好意思～）或表示感謝。
- **ごめんなさい**：比較私人、帶感情，對家人朋友用。朋友之間更隨便的說法是「ごめん」。
- 工作上對上司或客人，要說「{申|もう}し{訳|わけ}ありません」。`,
    cards: [
      {
        kind: 'sentence',
        ja: '{申|もう}し{訳|わけ}ありません。',
        meaning: '非常抱歉。',
        note: '工作場合、對客人的正式道歉。',
      },
      {
        kind: 'sentence',
        ja: 'ごめんなさい。',
        meaning: '對不起。',
        note: '對家人朋友用，比「すみません」私人。',
      },
    ],
  },
  {
    keys: [['お疲れ'], ['辛苦'], ['ご苦労']],
    answer: `「お{疲|つか}れ{様|さま}です」字面是「您辛苦了」，在日本的職場、打工、社團幾乎是萬用招呼：
- 遇到同事、下班離開時都可以說。
- 對上司也能用；「ご{苦労|くろう}{様|さま}」是上對下的說法，對長輩用會失禮。
- 朋友之間可以簡化成「おつかれ！」。`,
    cards: [
      {
        kind: 'sentence',
        ja: 'ご{苦労|くろう}{様|さま}です。',
        meaning: '辛苦了。（上對下）',
        note: '對上司、長輩不要用。',
      },
      { kind: 'sentence', ja: 'おつかれ！', meaning: '辛苦啦！（朋友間）' },
    ],
  },
  {
    keys: [['暑い'], ['熱い'], ['厚い'], ['あつい']],
    answer: `三個都讀「あつい」，靠漢字分意思：
- {暑|あつ}い：天氣熱（{今日|きょう}は{暑|あつ}い）
- {熱|あつ}い：東西燙、熱情（このお{茶|ちゃ}、{熱|あつ}い！）
- {厚|あつ}い：厚度（{厚|あつ}い{本|ほん}）`,
    cards: [
      {
        kind: 'word',
        ja: '{熱|あつ}い',
        meaning: '燙；熱情',
        example: { ja: 'このお{茶|ちゃ}、{熱|あつ}い！', zh: '這杯茶好燙！' },
      },
      {
        kind: 'word',
        ja: '{厚|あつ}い',
        meaning: '厚',
        example: {
          ja: '{厚|あつ}い{本|ほん}を{読|よ}んでいる。',
          zh: '正在讀一本很厚的書。',
        },
      },
    ],
  },
  {
    keys: [['て形'], ['て型'], ['てform'], ['te形']],
    answer: `て形是動詞最常用的變化之一，可以：
- 連接動作：{朝|あさ}{起|お}きて、{顔|かお}を{洗|あら}う。
- 請求：ちょっと{待|ま}ってください。
- 正在進行：いま{勉強|べんきょう}している。
- 請求許可：{写真|しゃしん}を{撮|と}ってもいいですか。
變化規則依動詞種類不同，例如 {書|か}く→{書|か}いて、{読|よ}む→{読|よ}んで、{食|た}べる→{食|た}べて。`,
    cards: [
      {
        kind: 'sentence',
        ja: 'ちょっと{待|ま}ってください。',
        meaning: '請稍等一下。',
      },
      {
        kind: 'grammar',
        ja: '〜ている',
        meaning: '「正在～」：動作進行中',
        example: {
          ja: 'いま{勉強|べんきょう}している。',
          zh: '我現在正在讀書。',
        },
      },
    ],
  },
];

const FALLBACK = `（離線示範模式）現在沒有連上 AI，所以只能回答幾個常見問題，例如：
- 「は」和「が」差在哪？
- 「暑い」和「熱い」怎麼分？
- 「お疲れ様です」什麼時候用？

想問任何問題的話，到「設定」選擇 AI 服務：填入 Gemini API Key（Google AI Studio 可以免費申請），或在 claude.ai 的網頁版允許使用 Claude。`;

export function matchFaq(question: string): Faq | null {
  const q = question.replace(/\s/g, '');
  return FAQS.find((f) => f.keys.some((group) => group.every((k) => q.includes(k)))) ?? null;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}

export function createDemoProvider(): AiProvider {
  return {
    id: 'demo',
    label: '離線示範',
    async suggest(req, signal) {
      await delay(450, signal);
      const fromChips = req.scenarios
        .map((label) => Object.values(SCENARIO_BY_ID).find((s) => s.label === label)?.id)
        .filter((x): x is ScenarioId => !!x);
      // 日記看不出情境時，改用首次設定的學習目的與興趣
      const detected = [...fromChips, ...detectScenarios(req.diary)];
      const ids = [...new Set(detected.length ? detected : preferredScenarios(req.learner))].slice(0, 3);
      const known = new Set(req.known.map(dedupeKey));
      return { diaryJa: null, items: pickForScenarios(ids, known, 7, req.learner) };
    },
    async chat(history: ChatMessage[], opts) {
      await delay(350, opts?.signal);
      const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
      const text = matchFaq(last)?.answer ?? FALLBACK;
      opts?.onText?.(text);
      return text;
    },
    async extractCards(text: string, _learner, known: string[], signal?: AbortSignal) {
      await delay(250, signal);
      const knownSet = new Set(known.map(dedupeKey));
      const faq = FAQS.find((f) => f.answer === text);
      if (faq) return faq.cards.filter((c) => !knownSet.has(dedupeKey(c.ja)));
      const plain = toPlain(text);
      return STARTER.filter((it) => plain.includes(toPlain(it.ja)) && !knownSet.has(dedupeKey(it.ja))).slice(
        0,
        5,
      );
    },
  };
}
