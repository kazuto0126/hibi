import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { RADIUS, SPACE, T, useTheme } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  small,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  testID?: string;
}) {
  const { c, f } = useTheme();
  const bg = {
    primary: c.accent,
    secondary: c.accentSoft,
    ghost: 'transparent',
    danger: 'transparent',
  }[variant];
  const fg = {
    primary: c.onAccent,
    secondary: c.accent,
    ghost: c.accent,
    danger: c.again,
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        {
          backgroundColor: bg,
          borderRadius: RADIUS.m,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 18,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: off ? 0.45 : pressed ? 0.75 : hovered ? 0.9 : 1,
          borderWidth: focused ? 2 : 0,
          borderColor: c.highlight,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text
        style={{
          color: fg,
          fontSize: small ? T.small : T.body,
          fontWeight: '600',
          fontFamily: f.ui,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { c, f } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.line,
        backgroundColor: selected ? c.accent : c.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? c.onAccent : c.inkSoft,
          fontSize: T.small,
          fontFamily: f.ui,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 用一個漢字當圖示的圓形按鈕（例如「音」＝播放發音） */
export function KanjiButton({
  glyph,
  label,
  onPress,
  size = 36,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  size?: number;
}) {
  const { c, f } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.accentSoft : 'transparent',
      })}
    >
      <Text
        style={{
          color: c.accent,
          fontSize: Math.round(size * 0.48),
          lineHeight: Math.round(size * 0.62),
          fontFamily: f.ja,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

export function Label({ children, tone = 'soft' }: { children: ReactNode; tone?: 'soft' | 'faint' }) {
  const { c, f } = useTheme();
  return (
    <Text
      style={{
        fontSize: T.small,
        color: tone === 'soft' ? c.inkSoft : c.inkFaint,
        fontFamily: f.ui,
        lineHeight: 20,
      }}
    >
      {children}
    </Text>
  );
}

export function Heading({ children, size = T.title }: { children: ReactNode; size?: number }) {
  const { c, f } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: size,
        fontWeight: '700',
        color: c.ink,
        fontFamily: f.ui,
        lineHeight: Math.round(size * 1.35),
      }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  color,
  size = T.body,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  const { c, f } = useTheme();
  return (
    <Text
      style={{
        fontSize: size,
        color: color ?? c.ink,
        fontFamily: f.ui,
        lineHeight: Math.round(size * 1.6),
      }}
    >
      {children}
    </Text>
  );
}

/** 小標籤：卡片種類、JLPT 等級、狀態 */
export function Tag({ label, color }: { label: string; color?: string }) {
  const { c, f } = useTheme();
  const col = color ?? c.inkSoft;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: col,
        borderRadius: RADIUS.s,
        paddingHorizontal: 6,
        paddingVertical: 1,
      }}
    >
      <Text style={{ fontSize: 11, color: col, fontFamily: f.ui, lineHeight: 16 }}>{label}</Text>
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: RADIUS.l,
          borderWidth: 1,
          borderColor: c.line,
          padding: SPACE.l,
          gap: SPACE.m,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}

/** 數字加減器（目標記憶率、每日新卡數） */
export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
  label: string;
}) {
  const { c, f } = useTheme();
  const btn = (txt: string, delta: number) => {
    const next = Math.round((value + delta) * 100) / 100;
    const off = next < min - 1e-9 || next > max + 1e-9;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${delta > 0 ? '增加' : '減少'}`}
        onPress={off ? undefined : () => onChange(next)}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: c.line,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: off ? 0.35 : pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ fontSize: 20, color: c.ink, fontFamily: f.ui }}>{txt}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.m }}>
      {btn('−', -step)}
      <Text
        accessibilityLabel={`${label} ${format(value)}`}
        style={{
          minWidth: 64,
          textAlign: 'center',
          fontSize: T.lead,
          fontWeight: '600',
          color: c.ink,
          fontFamily: f.ui,
          fontVariant: ['tabular-nums'],
        }}
      >
        {format(value)}
      </Text>
      {btn('+', step)}
    </View>
  );
}
