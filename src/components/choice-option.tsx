import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChoiceCardProps = {
  label: string;
  description?: string;
  selected: boolean;
  /** true：可複選（方形勾選框）；false：單選（圓形選擇鈕）。 */
  multiple?: boolean;
  onPress: () => void;
};

// 有標題和說明的選項卡片，用在「程度」和「學習目的」。
export function ChoiceCard({ label, description, selected, multiple = false, onPress }: ChoiceCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.accent : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      <View style={styles.cardText}>
        <ThemedText style={styles.cardLabel}>{label}</ThemedText>
        {description && (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        )}
      </View>
      <View
        style={[
          styles.indicator,
          multiple ? styles.indicatorSquare : styles.indicatorRound,
          {
            borderColor: selected ? theme.accent : theme.textSecondary,
            backgroundColor: selected ? theme.accent : 'transparent',
          },
        ]}>
        {selected && (
          <ThemedText type="smallBold" themeColor="onAccent">
            ✓
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

// 小小的標籤按鈕，用在「興趣」。
export function ChoiceChip({ label, selected, onPress }: ChoiceChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  cardLabel: {
    fontWeight: 700,
  },
  indicator: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorRound: {
    borderRadius: 12,
  },
  indicatorSquare: {
    borderRadius: 6,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  pressed: {
    opacity: 0.7,
  },
});
