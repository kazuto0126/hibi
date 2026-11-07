/**
 * 未來 7 天的複習量。讓使用者看到「今天多做一點，明天就輕鬆一點」。
 */
import { Text, View } from 'react-native';
import { useTheme } from '../theme';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function Forecast({ counts, now }: { counts: number[]; now: number }) {
  const { c, f } = useTheme();
  const max = Math.max(1, ...counts);
  const H = 64;
  return (
    <View
      accessible
      accessibilityLabel={`未來七天複習量：${counts.map((n, i) => `${i === 0 ? '今天' : i === 1 ? '明天' : `${i} 天後`} ${n} 張`).join('，')}`}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}
    >
      {counts.map((n, i) => {
        const day = new Date(now + i * 86_400_000).getDay();
        const h = n === 0 ? 2 : Math.max(6, Math.round((n / max) * H));
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text
              style={{
                fontSize: 12,
                color: n ? c.ink : c.inkFaint,
                fontFamily: f.ui,
                fontVariant: ['tabular-nums'],
              }}
            >
              {n}
            </Text>
            <View
              style={{
                width: '100%',
                height: H,
                justifyContent: 'flex-end',
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              <View
                style={{
                  height: h,
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  backgroundColor: i === 0 ? c.accent : c.grid,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 12,
                color: i === 0 ? c.accent : c.inkSoft,
                fontFamily: f.ja,
              }}
            >
              {i === 0 ? '今日' : WEEK[day]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
