/**
 * AI 服務的共同介面（Strategy / Provider 模式）。
 *
 * 畫面只認得 AiProvider 這個介面，不知道背後是 Gemini、Claude 還是離線示範。
 * 好處：
 *   - 換模型或新增廠商，只要多寫一個 provider，畫面一行都不用改
 *   - 測試時可以塞一個假的 provider
 *   - 沒有網路或沒有金鑰時，自動退回離線示範，App 不會壞掉
 */
import type { AiProviderId, LearnerProfile, SuggestedItem } from '../types';

export interface SuggestRequest {
  diary: string;
  /** 使用者勾選或系統偵測到的情境（中文標籤） */
  scenarios: string[];
  /** 首次設定填的程度、目的、興趣（還沒填時是 null） */
  learner: LearnerProfile | null;
  /** 單字本裡已經有的日文（純文字），請 AI 避開 */
  known: string[];
}

export interface SuggestResult {
  /** 日記的日文版（離線示範模式沒有） */
  diaryJa: string | null;
  items: SuggestedItem[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** 串流輸出時，每收到一段就回傳「目前為止的完整文字」 */
  onText?: (fullText: string) => void;
  signal?: AbortSignal;
  learner?: LearnerProfile | null;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly label: string;
  suggest(req: SuggestRequest, signal?: AbortSignal): Promise<SuggestResult>;
  chat(history: ChatMessage[], opts?: ChatOptions): Promise<string>;
  extractCards(
    text: string,
    learner: LearnerProfile | null,
    known: string[],
    signal?: AbortSignal,
  ): Promise<SuggestedItem[]>;
}

export type AiErrorCode =
  'auth' | 'quota' | 'model' | 'network' | 'format' | 'consent' | 'aborted' | 'unknown';

/** 錯誤訊息直接寫成給使用者看的話：發生什麼事、怎麼解決 */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export function isAbort(e: unknown): boolean {
  return (e as { name?: string })?.name === 'AbortError' || (e as AiError)?.code === 'aborted';
}
