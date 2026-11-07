/**
 * AI 回答的簡易排版：段落、條列（- ・ * 1.）、**粗體**，加上假名標註。
 * 刻意只支援這幾種，提示詞也要求 AI 不要用表格和標題。
 */
import { memo } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { RubyText, type Span } from './RubyText';

const RUBY_RE = /\{[^|{}]+\|[^{}]+\}/;

function spansOf(line: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: line.slice(last, i) });
    out.push({ text: m[1], bold: true });
    last = i + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

export const Rich = memo(function Rich({ text, size = 16 }: { text: string; size?: number }) {
  const { c, f } = useTheme();
  const lines = text.replace(/\r/g, '').split('\n');
  return (
    <View style={{ gap: 6 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return null;
        const bullet = line.match(/^\s*(?:[-*・•]|(\d+)[.)、])\s*(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingLeft: 2 }}>
              <Text
                style={{
                  fontSize: size,
                  lineHeight: Math.round(size * 1.45),
                  // 這行有讀音時，標記要往下對齊到本字那一行
                  marginTop: RUBY_RE.test(bullet[2])
                    ? Math.round(Math.max(9, Math.round(size * 0.5)) * 1.25)
                    : 0,
                  color: c.inkFaint,
                  fontFamily: f.ui,
                }}
              >
                {bullet[1] ? `${bullet[1]}.` : '・'}
              </Text>
              <View style={{ flex: 1 }}>
                <RubyText text="" spans={spansOf(bullet[2])} size={size} mixed />
              </View>
            </View>
          );
        }
        return <RubyText key={i} text="" spans={spansOf(line.replace(/^#+\s*/, ''))} size={size} mixed />;
      })}
    </View>
  );
});
