/**
 * 複習：看日文 → 想一想 → 翻面 → 依照記得的程度評分。
 * 四個按鈕下方預先顯示「選了之後多久會再看到」，讓評分的後果一目了然。
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, Text, View } from 'react-native';
import { buildQueue, nextLearningDue } from '../../core/deck';
import { toPlain } from '../../core/ruby';
import { scheduleAll } from '../../core/scheduler';
import { isBeginner } from '../../core/profile';
import { forecast } from '../../core/stats';
import { formatInterval } from '../../core/time';
import type { Rating } from '../../core/types';
import { speakJa } from '../../platform/speech';
import { answer, schedulerConfig, undoLast, useApp } from '../../state/store';
import { Body, Button, Heading, KanjiButton, Label, Panel, Tag } from '../components/Basics';
import { Forecast } from '../components/Forecast';
import { MASU_MAX_CHARS, MasuWord } from '../components/MasuWord';
import { Romaji } from '../components/Romaji';
import { RubyText } from '../components/RubyText';
import { KIND_LABEL } from '../components/SuggestionList';
import { useHotkeys, useNow } from '../hooks';
import { RADIUS, SPACE, T, useTheme } from '../theme';
import { Screen } from './Screen';

const RATING_UI: {
  r: Rating;
  label: string;
  key: 'again' | 'hard' | 'good' | 'easy';
}[] = [
  { r: 1, label: '重來', key: 'again' },
  { r: 2, label: '困難', key: 'hard' },
  { r: 3, label: '記得', key: 'good' },
  { r: 4, label: '簡單', key: 'easy' },
];

export function ReviewScreen({ active, onGoToday }: { active: boolean; onGoToday: () => void }) {
  const { c, f, dark } = useTheme();
  const onRating = dark ? '#121418' : '#FFFFFF';
  const app = useApp();
  const [now, refresh] = useNow(15_000);
  const q = buildQueue(app.cards, app.logs, now, app.settings.newPerDay);
  const card = app.cards.find((x) => x.id === q.ids[0]);
  // 記下「哪一張卡（第幾次複習）」已翻面，換卡時自然就是未翻面，不需要額外重設
  const cardKey = card ? `${card.id}:${card.srs.reps}` : '';
  const [revealedKey, setRevealedKey] = useState('');
  const revealed = revealedKey === cardKey && cardKey !== '';
  const [width, setWidth] = useState(320);
  const [session, setSession] = useState({ done: 0, remembered: 0 });
  const fade = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => (reduceMotion.current = v))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);
  const reveal = useCallback(() => {
    if (!card || revealed) return;
    fade.setValue(0);
    setRevealedKey(cardKey);
    if (reduceMotion.current) fade.setValue(1);
    else
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
  }, [card, revealed, cardKey, fade]);

  const rate = useCallback(
    (r: Rating) => {
      if (!card || !revealed) return;
      if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
      answer(card.id, r);
      setSession((s) => ({
        done: s.done + 1,
        remembered: s.remembered + (r >= 2 ? 1 : 0),
      }));
      refresh();
    },
    [card, revealed, refresh],
  );

  useHotkeys(
    active,
    useCallback(
      (key: string) => {
        if (key === ' ' || key === 'Enter') reveal();
        else if (['1', '2', '3', '4'].includes(key)) rate(Number(key) as Rating);
      },
      [reveal, rate],
    ),
  );

  if (!card) {
    const next = nextLearningDue(app.cards, now);
    return (
      <Screen>
        <Heading>{session.done ? 'お疲れ様でした！' : '目前沒有要複習的卡片'}</Heading>
        {session.done ? (
          <Body color={c.inkSoft}>
            這一輪複習了 {session.done} 張，其中 {session.remembered}{' '}
            張記得。系統已經依照你的答題情況，重新安排好每張卡下次出現的時間。
          </Body>
        ) : null}
        {next ? (
          <Body
            color={c.inkSoft}
          >{`${formatInterval(Math.max(0, next.at - now))}後還有 ${next.count} 張學習中的卡片會回來。`}</Body>
        ) : null}
        {app.cards.length === 0 ? (
          <Panel>
            <Body>單字本還是空的。到「今日」寫下今天的生活，或加入新手包。</Body>
            <Button label="到今日" variant="secondary" onPress={onGoToday} />
          </Panel>
        ) : (
          <Panel>
            <Label>未來 7 天要複習的卡片</Label>
            <Forecast counts={forecast(app.cards, now)} now={now} />
          </Panel>
        )}
        {app.undo ? (
          <Button
            label="復原上一張"
            variant="ghost"
            onPress={() => {
              undoLast();
              refresh();
            }}
          />
        ) : null}
      </Screen>
    );
  }

  const outcomes = scheduleAll(card.srs, now, schedulerConfig(app.settings), card.id);
  const isMasu = card.kind === 'word' && [...toPlain(card.ja)].length <= MASU_MAX_CHARS;
  // 零基礎、會五十音：讀音一開始就顯示，並加上羅馬拼音（考的是「看懂意思」，不是「認得漢字」）
  const beginner = isBeginner(app.settings.profile);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Label>{`剩下 ${q.ids.length} 張`}</Label>
        </View>
        {app.undo ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              undoLast();
              refresh();
            }}
            hitSlop={10}
          >
            <Text style={{ color: c.accent, fontSize: T.small, fontFamily: f.ui }}>復原上一張</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        testID="review-card"
        accessibilityRole="button"
        accessibilityHint={revealed ? undefined : '點一下顯示答案'}
        onPress={reveal}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width - SPACE.xl * 2)}
        style={{
          backgroundColor: c.surface,
          borderRadius: RADIUS.l,
          borderWidth: 1,
          borderColor: c.line,
          paddingHorizontal: SPACE.xl,
          paddingVertical: SPACE.xxl,
          gap: SPACE.l,
          minHeight: 300,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          <Tag label={KIND_LABEL[card.kind]} />
          {card.srs.state === 'new' ? <Tag label="新卡" color={c.accent} /> : null}
          {card.srs.state === 'relearning' ? <Tag label="重新學習" color={c.again} /> : null}
        </View>

        <View
          style={{
            alignItems: 'center',
            minHeight: 110,
            justifyContent: 'center',
          }}
        >
          {isMasu ? (
            <MasuWord text={card.ja} maxWidth={width} rubyOpacity={beginner ? 1 : fade} />
          ) : (
            <RubyText
              text={card.ja}
              size={card.kind === 'sentence' ? 24 : 26}
              align="center"
              showRuby={beginner || revealed}
            />
          )}
          {beginner ? (
            <View style={{ marginTop: SPACE.s }}>
              <Romaji text={card.ja} size={15} center />
            </View>
          ) : null}
        </View>

        {revealed ? (
          <Animated.View style={{ opacity: fade, gap: SPACE.m }}>
            <View style={{ height: 1, backgroundColor: c.line }} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.m,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: T.title,
                  lineHeight: 30,
                  fontWeight: '700',
                  color: c.ink,
                  fontFamily: f.ui,
                }}
              >
                {card.meaning}
              </Text>
              <KanjiButton
                glyph="音"
                label="播放發音"
                onPress={() => speakJa(card.ja, app.settings.speechRate)}
              />
            </View>
            {card.example ? (
              <View style={{ gap: 4 }}>
                <RubyText text={card.example.ja} size={17} />
                {beginner ? <Romaji text={card.example.ja} size={13} /> : null}
                <Text
                  style={{
                    fontSize: T.small,
                    color: c.inkSoft,
                    fontFamily: f.ui,
                  }}
                >
                  {card.example.zh}
                </Text>
              </View>
            ) : null}
            {card.note ? (
              <Text
                style={{
                  fontSize: T.small,
                  lineHeight: 21,
                  color: c.inkSoft,
                  fontFamily: f.ui,
                }}
              >
                {card.note}
              </Text>
            ) : null}
          </Animated.View>
        ) : (
          <Text
            style={{
              textAlign: 'center',
              color: c.inkFaint,
              fontSize: T.small,
              fontFamily: f.ui,
            }}
          >
            {beginner ? '先在心裡想想意思，再點一下卡片翻面' : '先在心裡想想意思和讀音，再點一下卡片翻面'}
          </Text>
        )}
      </Pressable>

      {revealed ? (
        <View style={{ flexDirection: 'row', gap: SPACE.s }} accessibilityRole="radiogroup">
          {RATING_UI.map(({ r, label, key }) => (
            <Pressable
              key={r}
              testID={`rate-${r}`}
              accessibilityRole="button"
              accessibilityLabel={`${label}，${formatInterval(outcomes[r].srs.due - now)}後再複習`}
              onPress={() => rate(r)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: RADIUS.m,
                backgroundColor: c[key],
                alignItems: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  color: onRating,
                  fontSize: T.body,
                  fontWeight: '700',
                  fontFamily: f.ui,
                }}
              >
                {label}
              </Text>
              <Text
                style={{
                  color: onRating,
                  opacity: 0.9,
                  fontSize: T.caption,
                  fontFamily: f.ui,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatInterval(outcomes[r].srs.due - now)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Button testID="reveal" label="顯示答案" onPress={reveal} />
      )}
      {Platform.OS === 'web' ? <Label tone="faint">鍵盤：空白鍵翻面，1～4 評分</Label> : null}
    </Screen>
  );
}
