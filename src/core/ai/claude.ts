/**
 * Claude（只在 claude.ai 上的網頁 Demo 可用）。
 *
 * 網頁版 Demo 發布在 claude.ai，頁面可以透過平台提供的 sample() 請 Claude 回答，
 * 用的是「正在看這個頁面的人」自己的 Claude 帳號，所以不需要任何 API Key。
 * 這裡只依賴一個函式型別，平台偵測在 src/platform/claude.ts。
 */
import type { LearnerProfile } from '../types';
import { extractJson, parseItems, parseSuggest } from './parse';
import { chatSystem, extractSystem, extractUser, suggestSystem, suggestUser } from './prompts';
import { AiError, type AiProvider, type ChatMessage } from './provider';

export interface SampleOptions {
  onText?: (e: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  cache?: boolean;
  modelTier?: 'quick' | 'default' | 'complex';
}
export type SampleFn = (
  input: string | ChatMessage[],
  opts?: SampleOptions,
) => Promise<{ text: string; truncated?: boolean }>;

function toAiError(e: unknown): AiError {
  const code = (e as { code?: string })?.code;
  const name = (e as { name?: string })?.name;
  if (name === 'AbortError') return new AiError('aborted', '已取消。');
  if (code === 'not_granted')
    return new AiError('consent', '需要先允許這個頁面使用 Claude，才能請 AI 幫忙。');
  if (code === 'rate_limited') return new AiError('quota', 'Claude 目前太忙，等一下再試。');
  return new AiError('unknown', 'Claude 暫時無法回應，稍後再試一次。');
}

export function createClaudeProvider(sample: SampleFn): AiProvider {
  async function ask(input: string | ChatMessage[], opts: SampleOptions = {}): Promise<string> {
    try {
      const res = await sample(input, { cache: false, ...opts });
      return res.text;
    } catch (e) {
      throw toAiError(e);
    }
  }

  return {
    id: 'claude',
    label: 'Claude',
    async suggest(req, signal) {
      const text = await ask(
        `${suggestSystem(req.learner)}\n\n---\n\n${suggestUser(req.diary, req.scenarios, req.known)}`,
        { signal },
      );
      return parseSuggest(extractJson(text));
    },
    async chat(history, opts) {
      // sample() 沒有 system 角色：把家教設定放在第一則使用者訊息前面
      const [first, ...rest] = history;
      const messages: ChatMessage[] = first
        ? [
            {
              role: 'user',
              content: `${chatSystem(opts?.learner ?? null)}\n\n---\n\n${first.content}`,
            },
            ...rest,
          ]
        : [];
      return ask(messages, {
        signal: opts?.signal,
        onText: (e) => opts?.onText?.(e.text),
      });
    },
    async extractCards(text: string, learner: LearnerProfile | null, known: string[], signal?: AbortSignal) {
      const out = await ask(`${extractSystem(learner)}\n\n---\n\n${extractUser(text, known)}`, {
        signal,
        modelTier: 'quick',
      });
      return parseItems(extractJson(out), 5);
    },
  };
}
