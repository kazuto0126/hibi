/**
 * 今日：今天要複習多少、寫下今天的生活 → AI 挑出用得到的日文。
 */
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AiError, isAbort, type SuggestResult } from '../../core/ai/provider';
import { SCENARIO_BY_ID, SCENARIOS } from '../../core/data/scenarios';
import { starterTagsFor } from '../../core/profile';
import { buildQueue, filterNew, knownKeys, nextLearningDue } from '../../core/deck';
import { toPlain } from '../../core/ruby';
import { streak } from '../../core/stats';
import { formatJaDate, formatInterval } from '../../core/time';
import { speakJa } from '../../platform/speech';
import {
  addItems,
  addStarterPack,
  currentProvider,
  getState,
  resetAll,
  toast,
  useApp,
} from '../../state/store';
import { Body, Button, Chip, Heading, KanjiButton, Label, Panel } from '../components/Basics';
import { RubyText } from '../components/RubyText';
import { SuggestionList } from '../components/SuggestionList';
import { useNow } from '../hooks';
import { RADIUS, SPACE, T, useTheme } from '../theme';
import { Screen } from './Screen';

const EXAMPLE_DIARY =
  '早上睡過頭，第一節課差點遲到。中午跟室友去吃拉麵，晚上在便利商店打工，店長問我下週的班表。';

export function TodayScreen({
  onStartReview,
  onOpenSettings,
}: {
  onStartReview: () => void;
  onOpenSettings: () => void;
}) {
  const { c, f } = useTheme();
  const app = useApp();
  const [now] = useNow(30_000);
  const q = buildQueue(app.cards, app.logs, now, app.settings.newPerDay);
  const days = streak(app.logs, now);
  const nextLearn = nextLearningDue(app.cards, now);
  const provider = currentProvider(app.settings);

  const [diary, setDiary] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function suggest() {
    if (!diary.trim() && chips.length === 0) {
      setError('先寫幾句今天發生的事，或選一個情境。');
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const known = getState().cards.map((card) => toPlain(card.ja));
      const res = await provider.suggest(
        { diary, scenarios: chips, learner: app.settings.profile, known },
        ac.signal,
      );
      const items = filterNew(res.items, knownKeys(getState().cards));
      if (items.length === 0) {
        setError('推薦的內容都已經在單字本裡了。多寫一點今天的細節再試試。');
      } else {
        setResult({ ...res, items });
      }
    } catch (e) {
      if (!isAbort(e)) setError(e instanceof AiError ? e.message : '發生未預期的錯誤，請再試一次。');
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }

  function add(picked: SuggestResult['items']) {
    const n = addItems(picked, 'daily');
    toast(n ? `已加入 ${n} 張，到「複習」就能開始練習` : '這些卡片已經在單字本裡了');
    setResult(null);
    setDiary('');
    setChips([]);
  }

  const empty = app.cards.length === 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: T.display,
              lineHeight: 40,
              color: c.ink,
              fontFamily: f.ja,
            }}
            accessibilityRole="header"
          >
            {formatJaDate(now)}
          </Text>
          <Label>{days > 0 ? `已經連續學習 ${days} 天` : '今天是個開始的好日子'}</Label>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSettings}
          hitSlop={10}
          style={{ paddingTop: 10 }}
        >
          <Text
            style={{
              color: c.accent,
              fontSize: T.body,
              fontFamily: f.ui,
              fontWeight: '600',
            }}
          >
            設定
          </Text>
        </Pressable>
      </View>

      {app.settings.demoData ? (
        <Panel style={{ borderColor: c.highlight, borderStyle: 'dashed' }}>
          <Body color={c.inkSoft}>
            這是示範資料：模擬一個人用了三週的樣子，讓你直接看到複習排程、記憶狀態和統計。可以照常操作；想從自己的日常開始時再清空。
          </Body>
          <Button
            testID="clear-demo"
            label="清空示範資料，從頭開始"
            variant="ghost"
            small
            style={{ alignSelf: 'flex-start' }}
            onPress={async () => {
              await resetAll();
              toast('已清空，從你的日常開始吧');
            }}
          />
        </Panel>
      ) : null}

      {empty ? (
        <Panel>
          <Heading>從你的日常開始學日文</Heading>
          <Body color={c.inkSoft}>
            每天用中文寫下今天做了什麼，Hibi
            會挑出你明天就用得到的日文，再用記憶演算法安排複習時間，在快忘記的時候提醒你。
          </Body>
          <Button
            testID="starter-pack"
            label={`加入新手包：${starterTagsFor(app.settings.profile)
              .map((id) => SCENARIO_BY_ID[id]?.label ?? '基本會話')
              .join('、')}`}
            variant="secondary"
            onPress={() => {
              const n = addStarterPack();
              toast(`已加入 ${n} 張新手包卡片`);
            }}
          />
        </Panel>
      ) : (
        <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.l }}>
          <View style={{ alignItems: 'center', minWidth: 64 }}>
            <Text
              style={{
                fontSize: 40,
                lineHeight: 46,
                fontWeight: '700',
                color: q.ids.length ? c.ink : c.inkFaint,
                fontFamily: f.ui,
                fontVariant: ['tabular-nums'],
              }}
            >
              {q.ids.length}
            </Text>
            <Label tone="faint">張待複習</Label>
          </View>
          <View style={{ flex: 1, gap: SPACE.s }}>
            {q.ids.length ? (
              <>
                <Label>
                  {[
                    q.learning && `學習中 ${q.learning}`,
                    q.review && `複習 ${q.review}`,
                    q.fresh && `新卡 ${q.fresh}`,
                  ]
                    .filter(Boolean)
                    .join('、')}
                </Label>
                <Button testID="start-review" label="開始複習" onPress={onStartReview} />
              </>
            ) : (
              <Body color={c.inkSoft}>
                {nextLearn
                  ? `今天的份量完成了。${formatInterval(Math.max(0, nextLearn.at - now))}後還有 ${nextLearn.count} 張學習中的卡片會回來。`
                  : '今天的份量完成了。寫下今天的生活，收集明天的新單字吧。'}
              </Body>
            )}
          </View>
        </Panel>
      )}

      <Panel>
        <Heading>今天過得如何？</Heading>
        <Label>用中文寫幾句就好。會從裡面挑出你明天用得到的日文。</Label>
        <TextInput
          testID="diary-input"
          value={diary}
          onChangeText={setDiary}
          multiline
          placeholder={`例如：${EXAMPLE_DIARY}`}
          placeholderTextColor={c.inkFaint}
          maxLength={800}
          style={{
            minHeight: 116,
            textAlignVertical: 'top',
            fontSize: T.body,
            lineHeight: 26,
            color: c.ink,
            fontFamily: f.ui,
            padding: SPACE.m,
            borderRadius: RADIUS.m,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.paper,
          }}
        />
        {!diary ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDiary(EXAMPLE_DIARY)}
            style={{ alignSelf: 'flex-start' }}
            testID="fill-example"
          >
            <Text style={{ color: c.accent, fontSize: T.small, fontFamily: f.ui }}>填入範例日記</Text>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s }}>
          {SCENARIOS.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              selected={chips.includes(s.label)}
              onPress={() =>
                setChips((cur) =>
                  cur.includes(s.label) ? cur.filter((x) => x !== s.label) : [...cur, s.label],
                )
              }
            />
          ))}
        </View>
        <Button
          testID="suggest"
          label={busy ? '正在挑選…' : '從今天挑單字'}
          loading={busy}
          onPress={suggest}
        />
        <Label tone="faint">
          {provider.id === 'demo'
            ? '目前是離線示範：從內建的生活詞庫挑選。到「設定」接上 AI，就能拿到專屬於你今天的卡片和日記日文版。'
            : `由 ${provider.label} 挑選，可能需要幾秒鐘。`}
        </Label>
        {error ? <Text style={{ color: c.again, fontSize: T.small, fontFamily: f.ui }}>{error}</Text> : null}
      </Panel>

      {result ? (
        <View style={{ gap: SPACE.m }}>
          {result.diaryJa ? (
            <Panel>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Label>你的今天，用日文說</Label>
                </View>
                <KanjiButton
                  glyph="音"
                  label="播放日記發音"
                  onPress={() => speakJa(result.diaryJa!, app.settings.speechRate)}
                />
              </View>
              <RubyText text={result.diaryJa} size={19} />
            </Panel>
          ) : null}
          <Heading size={T.lead}>為你挑的 {result.items.length} 張</Heading>
          <SuggestionList items={result.items} onAdd={add} onDismiss={() => setResult(null)} />
        </View>
      ) : null}
    </Screen>
  );
}
