/**
 * 單字本：所有卡片、學習統計，以及「排程演算法準不準」的即時檢驗。
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dedupeKey, toReading } from '../../core/ruby';
import { currentRecall } from '../../core/scheduler';
import { forecast, retention, summarize } from '../../core/stats';
import { formatInterval } from '../../core/time';
import type { Card, CardKind } from '../../core/types';
import { schedulerConfig, useApp } from '../../state/store';
import { Button, Chip, Heading, Label, Panel, Tag } from '../components/Basics';
import { Forecast } from '../components/Forecast';
import { RubyText } from '../components/RubyText';
import { useNow } from '../hooks';
import { MAX_WIDTH, RADIUS, SPACE, T, useTheme } from '../theme';
import { CardDetailSheet, CardEditorSheet } from './CardSheets';

type Filter = 'all' | CardKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'word', label: '單字' },
  { id: 'sentence', label: '句子' },
  { id: 'grammar', label: '文法' },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function StateLabel({ card, now }: { card: Card; now: number }) {
  const { c, f } = useTheme();
  const s = card.srs;
  if (s.state === 'new') return <Tag label="新卡" color={c.accent} />;
  const due = s.due - now;
  const when = due <= 0 ? '現在' : `${formatInterval(due)}後`;
  const tone = s.state === 'review' ? c.good : s.state === 'relearning' ? c.again : c.hard;
  return (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      <Tag
        label={s.state === 'review' ? '複習中' : s.state === 'relearning' ? '重新學習' : '學習中'}
        color={tone}
      />
      <Text style={{ fontSize: 11, color: c.inkFaint, fontFamily: f.ui }}>{when}</Text>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const { c, f } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text
        style={{
          fontSize: T.title,
          fontWeight: '700',
          color: c.ink,
          fontFamily: f.ui,
          fontVariant: ['tabular-nums'],
        }}
      >
        {n}
      </Text>
      <Text style={{ fontSize: T.caption, color: c.inkSoft, fontFamily: f.ui }}>{label}</Text>
    </View>
  );
}

function RetentionPanel({ now }: { now: number }) {
  const { c, f } = useTheme();
  const app = useApp();
  const r = retention(app.logs, now);
  const target = app.settings.desiredRetention;
  if (r.count === 0 || r.actual === null) {
    return (
      <Panel>
        <Label>記憶率</Label>
        <Text
          style={{
            fontSize: T.small,
            color: c.inkSoft,
            fontFamily: f.ui,
            lineHeight: 21,
          }}
        >
          卡片「畢業」進入複習之後，這裡會比較兩個數字：排程系統預測你會記得的機率，和你實際記得的比例。兩者越接近，代表演算法對你越準。
        </Text>
      </Panel>
    );
  }
  const diff = r.predicted === null ? 0 : r.actual - r.predicted;
  const verdict =
    Math.abs(diff) <= 0.05
      ? '預測和實際很接近，排程對你很準。'
      : diff < 0
        ? '你比模型預期的更容易忘記，可以到「設定」把目標記憶率調高一點。'
        : '你記得比預期的好，可以把目標記憶率調低一點，減少每天的複習量。';
  return (
    <Panel>
      <Label>{`記憶率（最近 30 天，${r.count} 次複習）`}</Label>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: T.title,
              fontWeight: '700',
              color: c.ink,
              fontFamily: f.ui,
              fontVariant: ['tabular-nums'],
            }}
          >
            {pct(r.actual)}
          </Text>
          <Label tone="faint">實際記得</Label>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: T.title,
              fontWeight: '700',
              color: c.inkSoft,
              fontFamily: f.ui,
              fontVariant: ['tabular-nums'],
            }}
          >
            {r.predicted === null ? '—' : pct(r.predicted)}
          </Text>
          <Label tone="faint">模型預測</Label>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: T.title,
              fontWeight: '700',
              color: c.inkSoft,
              fontFamily: f.ui,
              fontVariant: ['tabular-nums'],
            }}
          >
            {pct(target)}
          </Text>
          <Label tone="faint">目標</Label>
        </View>
      </View>
      <Text
        style={{
          fontSize: T.small,
          color: c.inkSoft,
          fontFamily: f.ui,
          lineHeight: 21,
        }}
      >
        {verdict}
        {r.count < 20 ? '（資料還不多，僅供參考）' : ''}
      </Text>
    </Panel>
  );
}

export function LibraryScreen() {
  const { c, f } = useTheme();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [now] = useNow(30_000);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const sum = summarize(app.cards);
  const cfg = schedulerConfig(app.settings);

  const list = useMemo(() => {
    const qn = dedupeKey(query.trim());
    return app.cards
      .filter((card) => filter === 'all' || card.kind === filter)
      .filter((card) => {
        if (!qn) return true;
        return (
          dedupeKey(card.ja).includes(qn) ||
          toReading(card.ja).includes(qn) ||
          card.meaning.includes(query.trim())
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [app.cards, query, filter]);

  const open = app.cards.find((x) => x.id === openId) ?? null;

  const header = (
    <View style={{ gap: SPACE.l, paddingBottom: SPACE.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Heading>單字本</Heading>
        </View>
        <Button
          testID="add-card"
          label="新增卡片"
          variant="secondary"
          small
          onPress={() => setEditing('new')}
        />
      </View>
      <Panel style={{ flexDirection: 'row', paddingVertical: SPACE.m }}>
        <Stat n={sum.total} label="全部" />
        <Stat n={sum.mature} label="已熟記" />
        <Stat n={sum.learning} label="學習中" />
        <Stat n={sum.fresh} label="新卡" />
      </Panel>
      {app.cards.length ? (
        <Panel>
          <Label>未來 7 天要複習的卡片</Label>
          <Forecast counts={forecast(app.cards, now)} now={now} />
        </Panel>
      ) : null}
      {app.cards.length ? <RetentionPanel now={now} /> : null}
      <TextInput
        testID="library-search"
        value={query}
        onChangeText={setQuery}
        placeholder="搜尋日文、讀音或中文"
        placeholderTextColor={c.inkFaint}
        style={{
          fontSize: T.body,
          color: c.ink,
          fontFamily: f.ui,
          paddingHorizontal: SPACE.m,
          paddingVertical: 10,
          borderRadius: RADIUS.m,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
        }}
      />
      <View style={{ flexDirection: 'row', gap: SPACE.s }}>
        {FILTERS.map((x) => (
          <Chip key={x.id} label={x.label} selected={filter === x.id} onPress={() => setFilter(x.id)} />
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={list}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={header}
        contentContainerStyle={{
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: SPACE.l,
          paddingTop: insets.top + SPACE.l,
          paddingBottom: SPACE.xxl,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line }} />}
        ListEmptyComponent={
          <Text
            style={{
              color: c.inkSoft,
              fontSize: T.body,
              fontFamily: f.ui,
              paddingVertical: SPACE.xl,
              textAlign: 'center',
            }}
          >
            {app.cards.length
              ? '找不到符合的卡片。'
              : '還沒有卡片。到「今日」寫下今天的生活，或按「新增卡片」。'}
          </Text>
        }
        renderItem={({ item }) => {
          const r = currentRecall(item.srs, now, cfg);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpenId(item.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.m,
                paddingVertical: SPACE.m,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <RubyText text={item.ja} size={item.kind === 'word' ? 19 : 16} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: T.small,
                    color: c.inkSoft,
                    fontFamily: f.ui,
                  }}
                >
                  {item.meaning}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <StateLabel card={item} now={now} />
                {r !== null && item.srs.state === 'review' ? (
                  <Text
                    style={{
                      fontSize: 11,
                      color: c.inkFaint,
                      fontFamily: f.ui,
                      fontVariant: ['tabular-nums'],
                    }}
                  >{`記得 ${pct(r)}`}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
      <CardDetailSheet
        card={open}
        now={now}
        onClose={() => setOpenId(null)}
        onEdit={(card) => {
          setOpenId(null);
          setEditing(card);
        }}
      />
      <CardEditorSheet target={editing} onClose={() => setEditing(null)} />
    </View>
  );
}
