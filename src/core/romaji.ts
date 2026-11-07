/**
 * 羅馬拼音（平文式／Hepburn）。
 *
 * 舊版規劃的內容規則：「零基礎和會五十音的使用者，日文一律附假名與羅馬拼音」。
 * 讀音已經有 {漢字|かな} 標註，所以只要把假名轉成羅馬字，再處理三個難點：
 *
 *   1. 助詞的發音：「は」當助詞時唸 wa、「へ」唸 e、「を」唸 o。
 *      沒有斷詞器，只能靠位置判斷：緊接在漢字詞、片假名詞或常見代名詞後面的「は」就是助詞。
 *      （日文送假名幾乎不會以「は」開頭，所以這個規則很少出錯；
 *       src/core/romaji.test.ts 用 kuromoji 斷詞的結果逐句對照驗證。）
 *   2. 促音「っ」：重複下一個子音（きって → kitte、まっちゃ → matcha）。
 *   3. 「ん」後面接母音或 y 時加撇號（げんいん → gen'in），長音「ー」重複前一個母音（ラーメン → raamen）。
 *
 * 斷詞（空格）只做到「大致好讀」：漢字詞、片假名詞、助詞前後與標點之後加空格。
 */
import { kataToHira, parseRuby } from './ruby';

const BASE: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'i',
  ゑ: 'e',
  を: 'o',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ゎ: 'wa',
};

/** 兩個字一起唸的組合（拗音、外來語用的組合） */
const DIGRAPH: Record<string, string> = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  ぢゃ: 'ja',
  ぢゅ: 'ju',
  ぢょ: 'jo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  ふゅ: 'fyu',
  てぃ: 'ti',
  でぃ: 'di',
  とぅ: 'tu',
  どぅ: 'du',
  てゅ: 'tyu',
  でゅ: 'dyu',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'wo',
  いぇ: 'ye',
  しぇ: 'she',
  じぇ: 'je',
  ちぇ: 'che',
  つぁ: 'tsa',
  つぃ: 'tsi',
  つぇ: 'tse',
  つぉ: 'tso',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
  くぁ: 'kwa',
  ぐぁ: 'gwa',
};

const PUNCT: Record<string, string> = {
  '。': '. ',
  '、': ', ',
  '，': ', ',
  '！': '! ',
  '？': '? ',
  '!': '! ',
  '?': '? ',
  '「': ' "',
  '」': '" ',
  '『': ' "',
  '』': '" ',
  '（': ' (',
  '）': ') ',
  '〜': '~',
  '～': '~',
  '・': ' ',
  '…': '... ',
  '　': ' ',
};

/** 用來標記「這裡是詞的邊界」的符號（不會出現在一般文字裡） */
const SEP = '\u0000';

function isVowelStart(s: string | undefined) {
  return !!s && /^[aiueoy]/.test(s);
}

/** 純假名 → 羅馬字（平假名、片假名都可以；SEP 會變成空格） */
export function kanaToRomaji(input: string): string {
  const s = [...kataToHira(input)];
  let out = '';
  let geminate = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'っ') {
      geminate = true;
      continue;
    }
    if (ch === 'ー') {
      const v = out.match(/[aiueo](?=[^aiueo]*$)/)?.[0];
      if (v && /[aiueo]$/.test(out)) out += v;
      continue;
    }
    if (ch === SEP) {
      out += ' ';
      geminate = false;
      continue;
    }
    const pair = s[i] + (s[i + 1] ?? '');
    let syl: string | undefined = DIGRAPH[pair];
    if (syl) i++;
    else syl = BASE[ch];
    if (syl === undefined) {
      out += PUNCT[ch] ?? ch;
      geminate = false;
      continue;
    }
    if (ch === 'ん') {
      const next = DIGRAPH[(s[i + 1] ?? '') + (s[i + 2] ?? '')] ?? BASE[s[i + 1] ?? ''];
      out += isVowelStart(next) ? "n'" : 'n';
      continue;
    }
    if (geminate) {
      out += syl.startsWith('ch') ? 't' : /^[aiueo]/.test(syl) ? '' : syl[0];
      geminate = false;
    }
    out += syl;
  }
  return out;
}

/** 這些字後面的「は」是助詞（代名詞、時間詞、助詞後面接は） */
const BEFORE_WA =
  /(これ|それ|あれ|どれ|ここ|そこ|あそこ|どこ|わたし|あたし|あなた|ぼく|おれ|きみ|みんな|だれ|なに|いま|きょう|あした|きのう|ことし|では|には|とは|から|まで|で|に|と|こんにち|こんばん)$/;
const BEFORE_E = /(どこ|ここ|そこ|あそこ|うち)$/;

type Kind = 'word' | 'kata' | 'hira' | 'other';
interface Piece {
  kind: Kind;
  text: string;
  /** 漢字詞的字數（判斷後面的平假名是不是送假名） */
  kanji?: number;
}

function pieces(src: string): Piece[] {
  const out: Piece[] = [];
  for (const seg of parseRuby(src)) {
    if (seg.ruby) {
      out.push({ kind: 'word', text: seg.ruby, kanji: [...seg.text].length });
      continue;
    }
    for (const m of seg.text.matchAll(/[ァ-ヺー]+|[ぁ-ゖー]+|[^ぁ-ゖァ-ヺー]+/gu)) {
      const t = m[0];
      const kind: Kind = /^[ァ-ヺ]/.test(t) ? 'kata' : /^[ぁ-ゖ]/.test(t) ? 'hira' : 'other';
      out.push({ kind, text: t });
    }
  }
  return out;
}

/** 把一段平假名裡當助詞用的「は／へ／を」換成發音，並在助詞前後加邊界 */
function markParticles(hira: string, afterWord: boolean, afterSingleKanji: boolean): string {
  let out = '';
  const chars = [...hira];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const before = out.split(SEP).join('');
    // 「{釣|つ}りは」「{推|お}しは」：單字漢字＋一個送假名組成的名詞，後面的「は」也是助詞
    const atStart = (i === 0 && afterWord) || (i === 1 && afterSingleKanji);
    if (ch === 'を') {
      out += `${SEP}を${SEP}`;
    } else if (ch === 'は' && /(こんにち|こんばん)$/.test(before)) {
      out += 'わ'; // こんにちは、こんばんは：唸 wa，但不分開寫
    } else if (ch === 'は' && (atStart || BEFORE_WA.test(before))) {
      out += `${SEP}わ${SEP}`;
    } else if (ch === 'へ' && (atStart || BEFORE_E.test(before))) {
      out += `${SEP}え${SEP}`;
    } else if (
      i > 0 &&
      (hira.startsWith('です', i) || hira.startsWith('でした', i) || hira.startsWith('ください', i))
    ) {
      out += SEP + ch; // 「いいです」→ ii desu
    } else {
      out += ch;
    }
  }
  return out;
}

/** 單一漢字後面接一個字、而且不是助詞 → 多半是複合動詞的送假名（乗り換える、締め切り） */
const PARTICLE_CHAR = new Set(['に', 'で', 'と', 'が', 'も', 'の', 'や', 'は', 'へ', 'を']);
// 不含し、す、せ：「{勉強|べんきょう}する」這類する動詞比較常見，要分開寫成 benkyou suru
const OKURIGANA_START = new Set([...'りみめきけえいちびろるれらっんうくつむぶぐわげぎ']);
const PARTICLE_WORDS = new Set([
  ...PARTICLE_CHAR,
  'から',
  'まで',
  'より',
  'には',
  'では',
  'とは',
  'にも',
  'でも',
]);

function needsBreakBeforeWord(ps: Piece[], i: number): boolean {
  const prev = ps[i - 1];
  if (!prev) return false;
  if (prev.kind === 'kata') return true;
  if (prev.kind === 'word') return (prev.kanji ?? 0) > 1;
  if (prev.kind !== 'hira') return false;
  const t = [...prev.text];
  const prevWord = ps[i - 2];
  const afterSingleKanji = prevWord?.kind === 'word' && prevWord.kanji === 1;
  if (afterSingleKanji && t.length === 1 && !PARTICLE_CHAR.has(t[0])) return false;
  // 接頭語「お」「ご」：お弁当、ご飯、ご注文
  const last = t[t.length - 1];
  if ((last === 'お' || last === 'ご') && (t.length === 1 || PARTICLE_CHAR.has(t[t.length - 2])))
    return false;
  return true;
}

/** 有 {漢字|かな} 標註的日文 → 羅馬拼音 */
export function toRomaji(src: string): string {
  const ps = pieces(src.replace(/^〜/, ''));
  let stream = '';
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const prev = ps[i - 1];
    if (p.kind === 'word') {
      if (needsBreakBeforeWord(ps, i)) stream += SEP;
      stream += p.text;
    } else if (p.kind === 'kata') {
      stream += `${SEP}${p.text}${SEP}`;
    } else if (p.kind === 'hira') {
      const afterWord = prev?.kind === 'word' || prev?.kind === 'kata';
      const next = ps[i + 1];
      // 多字漢字詞（多半是音讀複合詞）後面的平假名不是送假名，另起一個詞；
      // 單字漢字後面如果是「夾在兩個詞中間的助詞」（{駅|えき}で{乗|の}る），也分開
      const loneParticle = PARTICLE_WORDS.has(p.text) && !!next && next.kind !== 'hira';
      const multiKanji = prev?.kind === 'word' && (prev.kanji ?? 0) > 1;
      // 例外：多字漢字也可能有送假名（{大盛|おおも}り、{頑張|がんば}る），以常見送假名開頭時不分開
      const okurigana = multiKanji && OKURIGANA_START.has([...p.text][0]);
      if (prev?.kind === 'word' && ((multiKanji && !okurigana) || loneParticle)) stream += SEP;
      stream += markParticles(p.text, afterWord, prev?.kind === 'word' && prev.kanji === 1);
    } else {
      stream += p.text;
    }
  }
  return kanaToRomaji(stream)
    .replace(/\s+([.,!?)"~])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
