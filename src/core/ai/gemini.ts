/**
 * Google Gemini（使用者自備 API Key）。
 *
 * 直接呼叫 REST API，不裝 SDK：少一個相依套件，也比較好看懂請求長什麼樣子。
 * 文件：https://ai.google.dev/api/generate-content
 *
 * 安全提醒：API Key 只存在使用者自己的手機裡，備份檔也不會匯出。
 * 正式上架的 App 應該改成「手機 → 自己的後端 → Gemini」，不要把金鑰放在用戶端。
 */
import type { LearnerProfile } from '../types';
import { parseItems, parseSuggest, extractJson } from './parse';
import { chatSystem, extractSystem, extractUser, suggestSystem, suggestUser } from './prompts';
import { AiError, type AiProvider, type ChatMessage } from './provider';

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash（預設）' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite（最快）' },
];

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiOptions {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}

interface GenerateArgs {
  system: string;
  messages: ChatMessage[];
  json: boolean;
  signal?: AbortSignal;
}

export function createGeminiProvider({ apiKey, model, fetchFn }: GeminiOptions): AiProvider {
  const doFetch = fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function generate(args: GenerateArgs, withThinking = model.startsWith('gemini-3')): Promise<string> {
    const body = {
      systemInstruction: { parts: [{ text: args.system }] },
      contents: args.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: args.json ? 0.4 : 0.7,
        ...(args.json ? { responseMimeType: 'application/json' } : {}),
        // 單字卡不需要長考，降低思考層級能明顯縮短等待時間
        ...(withThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
      },
    };

    let res: Response;
    try {
      res = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: args.signal,
      });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw new AiError('aborted', '已取消。');
      throw new AiError('network', '連不上 Gemini，請確認網路連線。');
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 有些模型不支援 thinkingLevel 參數：拿掉後自動重試一次
      if (res.status === 400 && withThinking && /thinking/i.test(detail)) return generate(args, false);
      throw toAiError(res.status, detail);
    }

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!text) {
      const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason;
      throw new AiError(
        'format',
        reason === 'SAFETY'
          ? '這段內容被 Gemini 的安全機制擋下了，換個說法試試。'
          : 'Gemini 沒有回傳內容，請再試一次。',
      );
    }
    return text;
  }

  return {
    id: 'gemini',
    label: 'Gemini',
    async suggest(req, signal) {
      const text = await generate({
        system: suggestSystem(req.learner),
        messages: [
          {
            role: 'user',
            content: suggestUser(req.diary, req.scenarios, req.known),
          },
        ],
        json: true,
        signal,
      });
      return parseSuggest(extractJson(text));
    },
    async chat(history, opts) {
      const text = await generate({
        system: chatSystem(opts?.learner ?? null),
        messages: history,
        json: false,
        signal: opts?.signal,
      });
      opts?.onText?.(text);
      return text;
    },
    async extractCards(text: string, learner: LearnerProfile | null, known: string[], signal?: AbortSignal) {
      const out = await generate({
        system: extractSystem(learner),
        messages: [{ role: 'user', content: extractUser(text, known) }],
        json: true,
        signal,
      });
      return parseItems(extractJson(out), 5);
    },
  };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

export function toAiError(status: number, detail: string): AiError {
  if (status === 400 && /api key/i.test(detail))
    return new AiError('auth', 'API Key 無效。請到「設定」重新貼上，注意前後不要有空白。');
  if (status === 401 || status === 403)
    return new AiError('auth', '這把 API Key 沒有權限使用 Gemini，請到 Google AI Studio 確認金鑰狀態。');
  if (status === 404) return new AiError('model', '找不到這個模型。請到「設定」換一個模型。');
  if (status === 429) return new AiError('quota', '用量超過 Gemini 的免費額度，等一分鐘再試，或明天再來。');
  if (status >= 500) return new AiError('unknown', 'Gemini 服務暫時有問題，稍後再試一次。');
  return new AiError('unknown', `Gemini 回傳錯誤（${status}），稍後再試一次。`);
}
