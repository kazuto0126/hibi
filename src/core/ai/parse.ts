/**
 * 解析與驗證 AI 的輸出。
 *
 * 原則：永遠不要相信模型的輸出格式。
 *   - 先從文字裡把 JSON 挖出來（模型偶爾會加 ```json 或前後說明）
 *   - 每個欄位逐一檢查型別與長度，壞掉的項目丟掉，不讓整批失敗
 *   - 讀音格式寫錯（Anki 的「漢字[かな]」）自動修正
 */
import { normalizeRubyMarkup } from '../ruby';
import type { CardKind, Example, JlptLevel, SuggestedItem } from '../types';
import { AiError } from './provider';
import type { SuggestResult } from './provider';

const KINDS: CardKind[] = ['word', 'sentence', 'grammar'];
const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
const MAX_LEN = 240;

export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AiError('format', 'AI 的回覆不是預期的格式，請再試一次。');
  }
  const body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      // 常見小錯：結尾多一個逗號
      return JSON.parse(body.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      throw new AiError('format', 'AI 的回覆不是有效的 JSON，請再試一次。');
    }
  }
}

function str(v: unknown, max = MAX_LEN): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= max ? t : undefined;
}

function inferKind(ja: string): CardKind {
  if (ja.startsWith('〜') || ja.startsWith('~')) return 'grammar';
  if (/[。！？!?]$/.test(ja) || ja.length > 14) return 'sentence';
  return 'word';
}

export function normalizeItem(raw: unknown): SuggestedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const jaRaw = str(r.ja);
  const meaning = str(r.meaning);
  if (!jaRaw || !meaning) return null;
  const ja = normalizeRubyMarkup(jaRaw.replace(/^~/, '〜'));
  const kind = KINDS.includes(r.kind as CardKind) ? (r.kind as CardKind) : inferKind(ja);

  let example: Example | undefined;
  if (r.example && typeof r.example === 'object') {
    const e = r.example as Record<string, unknown>;
    const eja = str(e.ja);
    const ezh = str(e.zh);
    if (eja && ezh) example = { ja: normalizeRubyMarkup(eja), zh: ezh };
  }
  const note = str(r.note);
  const jlpt = LEVELS.includes(r.jlpt as JlptLevel) ? (r.jlpt as JlptLevel) : undefined;
  const tags = Array.isArray(r.tags)
    ? r.tags.filter((t): t is string => typeof t === 'string').slice(0, 5)
    : undefined;
  return { kind, ja, meaning, example, note, jlpt, tags };
}

export function parseItems(raw: unknown, max = 12): SuggestedItem[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown })?.items)
      ? (raw as { items: unknown[] }).items
      : [];
  return list
    .map(normalizeItem)
    .filter((x): x is SuggestedItem => x !== null)
    .slice(0, max);
}

export function parseSuggest(raw: unknown): SuggestResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const diaryJa = str(r.diaryJa, 1200);
  const items = parseItems(r.items);
  if (items.length === 0) throw new AiError('format', 'AI 沒有給出可以用的卡片，換個寫法再試一次。');
  return { diaryJa: diaryJa ? normalizeRubyMarkup(diaryJa) : null, items };
}
