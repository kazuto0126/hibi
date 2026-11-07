/**
 * AI 或內建詞庫推薦的卡片清單：勾選要的，一次加入單字本。
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SuggestedItem } from '../../core/types';
import { speakJa } from '../../platform/speech';
import { useApp } from '../../state/store';
import { RADIUS, SPACE, T, useTheme } from '../theme';
import { Button, KanjiButton, Tag } from './Basics';
import { isBeginner } from '../../core/profile';
import { Romaji } from './Romaji';
import { RubyText } from './RubyText';

export const KIND_LABEL = {
  word: '單字',
  sentence: '句子',
  grammar: '文法',
} as const;

export function SuggestionList({
  items,
  onAdd,
  onDismiss,
}: {
  items: SuggestedItem[];
  onAdd: (picked: SuggestedItem[]) => void;
  onDismiss: () => void;
}) {
  const { c, f } = useTheme();
  const { settings } = useApp();
  const beginner = isBeginner(settings.profile);
  const [picked, setPicked] = useState<boolean[]>(() => items.map(() => true));
  useEffect(() => setPicked(items.map(() => true)), [items]);
  const count = picked.filter(Boolean).length;

  return (
    <View style={{ gap: SPACE.s }}>
      {items.map((it, i) => {
        const on = picked[i];
        return (
          <Pressable
            key={`${it.ja}-${i}`}
            testID={`suggestion-${i}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: SPACE.m,
              padding: SPACE.m,
              borderRadius: RADIUS.m,
              borderWidth: 1,
              borderColor: on ? c.accent : c.line,
              backgroundColor: on ? c.surface : 'transparent',
              opacity: pressed ? 0.85 : on ? 1 : 0.6,
            })}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: on ? c.accent : c.inkFaint,
                backgroundColor: on ? c.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4,
              }}
            >
              {on ? (
                <Text
                  style={{
                    color: c.onAccent,
                    fontSize: 14,
                    lineHeight: 16,
                    fontWeight: '700',
                  }}
                >
                  ✓
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Tag label={KIND_LABEL[it.kind]} />
                {it.jlpt ? <Tag label={it.jlpt} color={c.inkFaint} /> : null}
              </View>
              <RubyText text={it.ja} size={it.kind === 'word' ? 22 : 18} />
              {beginner ? <Romaji text={it.ja} size={13} /> : null}
              <Text style={{ fontSize: T.body, color: c.ink, fontFamily: f.ui }}>{it.meaning}</Text>
              {it.example ? (
                <View style={{ marginTop: 2, gap: 2 }}>
                  <RubyText text={it.example.ja} size={15} color={c.inkSoft} />
                  {beginner ? <Romaji text={it.example.ja} size={12} /> : null}
                  <Text
                    style={{
                      fontSize: T.small,
                      color: c.inkFaint,
                      fontFamily: f.ui,
                    }}
                  >
                    {it.example.zh}
                  </Text>
                </View>
              ) : null}
              {it.note ? (
                <Text
                  style={{
                    fontSize: T.small,
                    color: c.inkSoft,
                    fontFamily: f.ui,
                  }}
                >
                  {it.note}
                </Text>
              ) : null}
            </View>
            <KanjiButton
              glyph="音"
              label="播放發音"
              size={32}
              onPress={() => speakJa(it.ja, settings.speechRate)}
            />
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', gap: SPACE.s, marginTop: SPACE.xs }}>
        <Button
          testID="add-suggestions"
          label={count ? `加入 ${count} 張到單字本` : '先勾選要的卡片'}
          disabled={!count}
          onPress={() => onAdd(items.filter((_, i) => picked[i]))}
          style={{ flex: 1 }}
        />
        <Button label="都不要" variant="ghost" onPress={onDismiss} />
      </View>
    </View>
  );
}
