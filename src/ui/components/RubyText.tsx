/**
 * 有假名標註的文字（振り仮名）。
 *
 * React Native 沒有 HTML 的 <ruby>，所以自己排版：每個字（或一組漢字）是一個小直欄，
 * 上面放讀音、下面放本字，再用 flex-wrap 讓直欄自動換行。
 * 換行規則照日文的「禁則處理」：句號、逗號、右括號不能出現在行首，左括號不能出現在行尾。
 */
import { memo } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { parseRuby } from '../../core/ruby';
import { useTheme } from '../theme';

interface Part {
  base: string;
  ruby?: string;
  bold?: boolean;
  /** 這段是日文（套日文字型）還是中文 */
  ja: boolean;
}
type Group = Part[];

const NO_LINE_START = /^[、。，．,.!！?？）」』】〕》〉…ー〜ぁぃぅぇぉっゃゅょァィゥェォッャュョ:：;；]$/;
const NO_LINE_END = /^[（「『【〔《〈(]$/;
const KANA = /[\u3040-\u30FF]/;

export interface Span {
  text: string;
  bold?: boolean;
}

export function toGroups(spans: Span[], mixed: boolean): Group[] {
  const parts: Part[] = [];
  for (const span of spans) {
    for (const seg of parseRuby(span.text)) {
      if (seg.ruby) {
        parts.push({
          base: seg.text,
          ruby: seg.ruby,
          bold: span.bold,
          ja: true,
        });
        continue;
      }
      // 英數字串保持完整，其他字元一字一段
      const tokens = seg.text.match(/[A-Za-z0-9][A-Za-z0-9.,'%+\-/]*|\s+|[\s\S]/gu) ?? [];
      for (const t of tokens) parts.push({ base: t, bold: span.bold, ja: !mixed || KANA.test(t) });
    }
  }
  const groups: Group[] = [];
  let pendingOpen: Part[] = [];
  for (const p of parts) {
    if (NO_LINE_START.test(p.base) && groups.length) {
      groups[groups.length - 1].push(p);
    } else if (NO_LINE_END.test(p.base)) {
      pendingOpen.push(p);
    } else {
      groups.push([...pendingOpen, p]);
      pendingOpen = [];
    }
  }
  if (pendingOpen.length) groups.push(pendingOpen);
  return groups;
}

interface Props {
  text: string;
  size?: number;
  color?: string;
  showRuby?: boolean;
  /** 中日混排（AI 回答）：只有假名和標註段落用日文字型 */
  mixed?: boolean;
  align?: 'left' | 'center';
  spans?: Span[];
  weight?: TextStyle['fontWeight'];
}

export const RubyText = memo(function RubyText({
  text,
  size = 18,
  color,
  showRuby = true,
  mixed = false,
  align = 'left',
  spans,
  weight,
}: Props) {
  const { c, f } = useTheme();
  const groups = toGroups(spans ?? [{ text }], mixed);
  const hasRuby = showRuby && groups.some((g) => g.some((p) => p.ruby));
  const rubySize = Math.max(9, Math.round(size * 0.5));
  const baseStyle: TextStyle = {
    fontSize: size,
    lineHeight: Math.round(size * 1.45),
    color: color ?? c.ink,
  };
  const rubyStyle: TextStyle = {
    fontSize: rubySize,
    lineHeight: Math.round(rubySize * 1.25),
    color: c.inkSoft,
    fontFamily: f.ja,
  };

  const rubyLine = Math.round(rubySize * 1.25);
  const flat = groups.flat();
  let idx = 0;

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
      accessible
      accessibilityLabel={(spans ?? [{ text }])
        .map((s) => s.text)
        .join('')
        .replace(/\{([^|}]+)\|([^}]+)\}/g, '$1（$2）')}
    >
      {groups.map((g, gi) => (
        <View key={gi} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          {g.map((p, pi) => {
            const i = idx++;
            const base = (
              <Text
                style={[
                  baseStyle,
                  { fontFamily: p.ja ? f.ja : f.ui },
                  p.bold || weight ? { fontWeight: p.bold ? '700' : weight } : null,
                ]}
              >
                {/^\s+$/.test(p.base) ? '\u00A0' : p.base}
              </Text>
            );
            if (!hasRuby) return <View key={pi}>{base}</View>;
            if (!p.ruby)
              return (
                <View key={pi} style={{ paddingTop: rubyLine }}>
                  {base}
                </View>
              );

            // 讀音比漢字寬時（例如「注文」上面的「ちゅうもん」），先讓讀音伸到左右沒有讀音的字上方
            // （最多半個字），還不夠才把這一欄撐寬，避免漢字和前後的假名之間出現空隙。
            const baseW = [...p.base].length * size;
            const rubyW = [...p.ruby].length * rubySize;
            const extra = Math.max(0, rubyW - baseW);
            const room = (n?: Part) => (n && !n.ruby ? Math.min(extra / 2, size * 0.5) : 0);
            const padL = extra / 2 - room(flat[i - 1]);
            const padR = extra / 2 - room(flat[i + 1]);
            return (
              <View
                key={pi}
                style={{
                  paddingTop: rubyLine,
                  paddingLeft: padL,
                  paddingRight: padR,
                }}
              >
                <Text
                  style={[
                    rubyStyle,
                    // 網頁版的 Text 預設 max-width: 100%（相對於這一欄），讀音比漢字寬時會被截斷，所以明確覆蓋
                    {
                      position: 'absolute',
                      top: 0,
                      left: padL + (baseW - rubyW) / 2 - 2,
                      width: rubyW + 4,
                      maxWidth: rubyW + 4,
                      textAlign: 'center',
                    },
                  ]}
                >
                  {p.ruby}
                </Text>
                {base}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
});
