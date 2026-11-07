/**
 * 底部分頁列。圖示直接用漢字：今（今日）、習（複習）、問（問 AI）、帳（單字本），
 * 不需要另外載入圖示字型，也跟「學日文」的主題一致。
 */
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_WIDTH, useTheme } from '../theme';

export type TabId = 'today' | 'review' | 'ask' | 'library';

export const TABS: { id: TabId; glyph: string; label: string }[] = [
  { id: 'today', glyph: '今', label: '今日' },
  { id: 'review', glyph: '習', label: '複習' },
  { id: 'ask', glyph: '問', label: '問 AI' },
  { id: 'library', glyph: '帳', label: '單字本' },
];

export function TabBar({
  active,
  onChange,
  badge,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  badge: Partial<Record<TabId, number>>;
}) {
  const { c, f, dark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.surface,
        paddingBottom: insets.bottom,
      }}
    >
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
        }}
      >
        {TABS.map((t) => {
          const on = t.id === active;
          const n = badge[t.id] ?? 0;
          return (
            <Pressable
              key={t.id}
              testID={`tab-${t.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={n ? `${t.label}，${n} 張待複習` : t.label}
              onPress={() => onChange(t.id)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingTop: 8,
                paddingBottom: 8,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 28,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: on ? c.accent : 'transparent',
                }}
              />
              <Text
                style={{
                  fontSize: 22,
                  lineHeight: 28,
                  color: on ? c.accent : c.inkFaint,
                  fontFamily: f.ja,
                }}
              >
                {t.glyph}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: on ? c.accent : c.inkFaint,
                  fontFamily: f.ui,
                  fontWeight: on ? '600' : '400',
                }}
              >
                {t.label}
              </Text>
              {n > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: '58%',
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 5,
                    borderRadius: 9,
                    backgroundColor: c.highlight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: dark ? '#121418' : '#FFFFFF',
                      fontFamily: f.ui,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {n > 99 ? '99+' : n}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
