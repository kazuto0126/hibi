import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  /** primary：藍底白字的主要按鈕；secondary：灰底的次要按鈕。 */
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = 'primary', disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: isPrimary ? theme.accent : theme.backgroundElement },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      {...rest}>
      <ThemedText type="smallBold" themeColor={isPrimary ? 'onAccent' : 'text'}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
