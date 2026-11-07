/**
 * 假名標註（ruby / furigana）解析。
 *
 * 格式：{漢字|かな}，例如「{勉強|べんきょう}する」。
 * 選這個格式的理由：
 *   1. 大括號與直線在日文內文幾乎不會出現，不會跟一般標點衝突。
 *   2. 一個正規表示式就能解析，LLM 也很容易照著產生。
 *   3. 同一份資料可以推導出「純文字」「全假名讀音」「分段標註」三種形式。
 */

export interface RubySegment {
  text: string;
  /** 有標註時才有值 */
  ruby?: string;
}

const RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function parseRuby(src: string): RubySegment[] {
  const out: RubySegment[] = [];
  let last = 0;
  for (const m of src.matchAll(RUBY_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) pushPlain(out, src.slice(last, idx));
    out.push({ text: m[1], ruby: m[2] });
    last = idx + m[0].length;
  }
  if (last < src.length) pushPlain(out, src.slice(last));
  return out;
}

function pushPlain(out: RubySegment[], text: string) {
  const prev = out[out.length - 1];
  if (prev && prev.ruby === undefined) prev.text += text;
  else out.push({ text });
}

/** 去掉標註，只留下日文本文 */
export function toPlain(src: string): string {
  return src.replace(RUBY_RE, '$1');
}

/** 把有標註的漢字換成讀音，得到整句的假名 */
export function toReading(src: string): string {
  return src.replace(RUBY_RE, '$2');
}

const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆ヶ]/;

export function hasKanji(s: string): boolean {
  return KANJI_RE.test(s);
}

/** 純文字裡有漢字、但沒有任何標註 → 讀音資訊不完整 */
export function missingRuby(src: string): boolean {
  return parseRuby(src).some((seg) => seg.ruby === undefined && hasKanji(seg.text));
}

const HIRA_START = 0x3041;
const HIRA_END = 0x3096;
const KATA_OFFSET = 0x60;

export function kataToHira(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out +=
      c >= HIRA_START + KATA_OFFSET && c <= HIRA_END + KATA_OFFSET
        ? String.fromCodePoint(c - KATA_OFFSET)
        : ch;
  }
  return out;
}

/**
 * LLM 偶爾會用 Anki 的「漢字[かな]」格式。這裡只轉換「漢字緊接著 [假名]」的情況，
 * 避免誤傷一般的方括號內容。
 */
export function normalizeRubyMarkup(src: string): string {
  return src
    .replace(/([\u3400-\u9FFF々〆ヶ]+)\[([\u3041-\u3096\u30A1-\u30FAー]+)\]/g, '{$1|$2}')
    .replace(/[ \u3000]+\{/g, '{')
    .trim();
}

/** 用來判斷兩張卡是否重複：去標註、去空白、全形半形統一 */
export function dedupeKey(src: string): string {
  return toPlain(src)
    .normalize('NFKC')
    .replace(/[\s。、！？!?.,「」]/g, '');
}
