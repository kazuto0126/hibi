import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_WIDTH, SPACE } from '../theme';

/** 每個分頁共用的外框：可捲動、置中、最寬 560，手機上避開瀏海 */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const inner = {
    width: '100%' as const,
    maxWidth: MAX_WIDTH,
    alignSelf: 'center' as const,
    paddingHorizontal: SPACE.l,
    paddingTop: insets.top + SPACE.l,
    paddingBottom: SPACE.xxl,
    gap: SPACE.l,
  };
  if (!scroll) return <View style={[inner, { flex: 1 }]}>{children}</View>;
  return (
    <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
