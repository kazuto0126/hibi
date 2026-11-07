import { memo } from 'react';
import { Text } from 'react-native';
import { toRomaji } from '../../core/romaji';
import { useTheme } from '../theme';

/** 羅馬拼音（只給零基礎、會五十音的使用者看，見 core/profile.ts 的 isBeginner） */
export const Romaji = memo(function Romaji({
  text,
  size = 14,
  center,
}: {
  text: string;
  size?: number;
  center?: boolean;
}) {
  const { c, f } = useTheme();
  const romaji = toRomaji(text);
  if (!romaji) return null;
  return (
    <Text
      testID="romaji"
      accessibilityLabel={`羅馬拼音 ${romaji}`}
      style={{
        fontSize: size,
        lineHeight: Math.round(size * 1.45),
        color: c.inkSoft,
        fontFamily: f.ui,
        letterSpacing: 0.3,
        textAlign: center ? 'center' : 'left',
      }}
    >
      {romaji}
    </Text>
  );
});
