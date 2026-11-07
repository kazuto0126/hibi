/**
 * 練習格（ます目）單字。
 *
 * 模仿日本小學生的漢字練習簿：每個字一個方格，中間有十字虛線，讀音標在漢字正上方。
 * 這是整個 App 最有辨識度的畫面元素，也讓使用者自然注意到每個字的字形。
 */
import { memo } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { parseRuby, toPlain } from '../../core/ruby';
import { useTheme } from '../theme';
import { RubyText } from './RubyText';

interface Props {
  text: string;
  /** 0 = 隱藏讀音、1 = 顯示，可以傳 Animated.Value 做淡入 */
  rubyOpacity?: Animated.Value | number;
  maxWidth: number;
  maxCell?: number;
}

/** 太長的詞（例如片語）改用一般排版 */
export const MASU_MAX_CHARS = 8;

export const MasuWord = memo(function MasuWord({ text, rubyOpacity = 1, maxWidth, maxCell = 76 }: Props) {
  const { c, f } = useTheme();
  const plain = toPlain(text);
  const chars = [...plain];
  if (chars.length > MASU_MAX_CHARS) {
    return (
      <Animated.View>
        <RubyText text={text} size={30} align="center" showRuby />
      </Animated.View>
    );
  }
  const cell = Math.max(36, Math.min(maxCell, Math.floor((maxWidth - 8) / chars.length)));
  const rubySize = Math.max(11, Math.round(cell * 0.28));
  const segs = parseRuby(text);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-end',
      }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1（$2）')}
    >
      {segs.map((seg, si) => (
        <View key={si} style={{ alignItems: 'center', marginLeft: si === 0 ? 0 : -1 }}>
          <Animated.Text
            style={{
              fontSize: rubySize,
              lineHeight: Math.round(rubySize * 1.4),
              color: c.inkSoft,
              fontFamily: f.ja,
              opacity: rubyOpacity,
              letterSpacing: 1,
            }}
          >
            {seg.ruby ?? '\u00A0'}
          </Animated.Text>
          <View style={{ flexDirection: 'row' }}>
            {[...seg.text].map((ch, ci) => (
              <View
                key={ci}
                style={{
                  width: cell,
                  height: cell,
                  marginLeft: ci === 0 ? 0 : -1,
                }}
              >
                <Svg width={cell} height={cell} style={{ position: 'absolute' }}>
                  <Rect
                    x={0.5}
                    y={0.5}
                    width={cell - 1}
                    height={cell - 1}
                    fill={c.surface}
                    stroke={c.grid}
                    strokeWidth={1}
                  />
                  <Line
                    x1={cell / 2}
                    y1={3}
                    x2={cell / 2}
                    y2={cell - 3}
                    stroke={c.guide}
                    strokeWidth={1}
                    strokeDasharray="3 4"
                  />
                  <Line
                    x1={3}
                    y1={cell / 2}
                    x2={cell - 3}
                    y2={cell / 2}
                    stroke={c.guide}
                    strokeWidth={1}
                    strokeDasharray="3 4"
                  />
                </Svg>
                <Text
                  style={{
                    width: cell,
                    height: cell,
                    fontSize: Math.round(cell * 0.66),
                    lineHeight: cell,
                    textAlign: 'center',
                    color: c.ink,
                    fontFamily: f.ja,
                    ...(Platform.OS === 'android'
                      ? {
                          includeFontPadding: false,
                          textAlignVertical: 'center' as const,
                        }
                      : null),
                  }}
                >
                  {ch}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
});
