/**
 * 卡片詳情（含記憶狀態：R、S、D）與編輯器。
 * 把演算法內部的數字攤開給使用者看，也方便向別人解釋排程是怎麼運作的。
 */
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SCENARIO_BY_ID } from '../../core/data/scenarios';
import { isBeginner } from '../../core/profile';
import { missingRuby, toPlain } from '../../core/ruby';
import { currentRecall } from '../../core/scheduler';
import { formatInterval } from '../../core/time';
import type { Card, CardKind } from '../../core/types';
import { speakJa } from '../../platform/speech';
import {
  addItems,
  deleteCard,
  resetCard,
  schedulerConfig,
  toast,
  updateCard,
  useApp,
} from '../../state/store';
import { Button, Chip, Divider, KanjiButton, Label, Tag } from '../components/Basics';
import { MASU_MAX_CHARS, MasuWord } from '../components/MasuWord';
import { Romaji } from '../components/Romaji';
import { RubyText } from '../components/RubyText';
import { Sheet } from '../components/Sheet';
import { KIND_LABEL } from '../components/SuggestionList';
import { RADIUS, SPACE, T, useTheme } from '../theme';

const SOURCE_LABEL = {
  starter: '內建詞庫',
  daily: '日記推薦',
  ask: 'AI 問答',
  manual: '手動新增',
} as const;
const STATE_LABEL = {
  new: '新卡',
  learning: '學習中',
  review: '複習中',
  relearning: '重新學習',
} as const;

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  const { c, f } = useTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, gap: SPACE.m }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: T.small, color: c.inkSoft, fontFamily: f.ui }}>{k}</Text>
        {hint ? <Text style={{ fontSize: 11, color: c.inkFaint, fontFamily: f.ui }}>{hint}</Text> : null}
      </View>
      <Text
        style={{
          fontSize: T.small,
          color: c.ink,
          fontFamily: f.ui,
          fontVariant: ['tabular-nums'],
          fontWeight: '600',
        }}
      >
        {v}
      </Text>
    </View>
  );
}

export function CardDetailSheet({
  card,
  now,
  onClose,
  onEdit,
}: {
  card: Card | null;
  now: number;
  onClose: () => void;
  onEdit: (c: Card) => void;
}) {
  const { c, f } = useTheme();
  const app = useApp();
  const beginner = isBeginner(app.settings.profile);
  const [width, setWidth] = useState(300);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [card?.id]);
  if (!card) return null;
  const s = card.srs;
  const r = currentRecall(s, now, schedulerConfig(app.settings));
  const isMasu = card.kind === 'word' && [...toPlain(card.ja)].length <= MASU_MAX_CHARS;
  const due = s.due - now;

  return (
    <Sheet visible onClose={onClose} title={KIND_LABEL[card.kind]}>
      <View
        style={{ alignItems: 'center', gap: SPACE.m, paddingVertical: SPACE.m }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {isMasu ? (
          <MasuWord text={card.ja} maxWidth={width} maxCell={64} />
        ) : (
          <RubyText text={card.ja} size={24} align="center" />
        )}
        {beginner ? <Romaji text={card.ja} size={14} center /> : null}
        <KanjiButton glyph="音" label="播放發音" onPress={() => speakJa(card.ja, app.settings.speechRate)} />
      </View>
      <Text
        style={{
          fontSize: T.title,
          fontWeight: '700',
          color: c.ink,
          fontFamily: f.ui,
        }}
      >
        {card.meaning}
      </Text>
      {card.example ? (
        <View style={{ gap: 4 }}>
          <RubyText text={card.example.ja} size={17} />
          {beginner ? <Romaji text={card.example.ja} size={12} /> : null}
          <Text style={{ fontSize: T.small, color: c.inkSoft, fontFamily: f.ui }}>{card.example.zh}</Text>
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Tag label={SOURCE_LABEL[card.source]} />
        {card.jlpt ? <Tag label={`參考 ${card.jlpt}`} color={c.inkFaint} /> : null}
        {card.tags.map((t) =>
          SCENARIO_BY_ID[t] ? <Tag key={t} label={SCENARIO_BY_ID[t].label} color={c.inkFaint} /> : null,
        )}
      </View>

      <Divider />
      <Label>記憶狀態</Label>
      <View>
        <Row k="狀態" v={STATE_LABEL[s.state]} />
        <Row
          k="下次複習"
          v={s.state === 'new' ? '還沒開始' : due <= 0 ? '現在' : `${formatInterval(due)}後`}
        />
        {r !== null ? (
          <Row k="現在記得的機率" hint="R：依遺忘曲線估計" v={`${Math.round(r * 100)}%`} />
        ) : null}
        {s.memory ? (
          <Row
            k="穩定度"
            hint="S：記得的機率掉到 90% 需要的天數"
            v={`${s.memory.stability < 1 ? s.memory.stability.toFixed(2) : s.memory.stability.toFixed(1)} 天`}
          />
        ) : null}
        {s.memory ? <Row k="難度" hint="D：1～10，越高越難記" v={s.memory.difficulty.toFixed(1)} /> : null}
        <Row k="複習次數" v={`${s.reps} 次`} />
        <Row k="忘記次數" v={`${s.lapses} 次`} />
      </View>

      <View style={{ flexDirection: 'row', gap: SPACE.s, flexWrap: 'wrap' }}>
        <Button label="編輯" variant="secondary" small onPress={() => onEdit(card)} />
        <Button
          label="重設學習進度"
          variant="ghost"
          small
          onPress={() => {
            resetCard(card.id);
            toast('已重設，這張卡會當成新卡重新學習');
          }}
        />
        <Button
          label={confirmDelete ? '再按一次就會刪除' : '刪除'}
          variant="danger"
          small
          onPress={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            deleteCard(card.id);
            toast('已刪除');
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

const KINDS: CardKind[] = ['word', 'sentence', 'grammar'];

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
}) {
  const { c, f } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          fontSize: T.body,
          color: c.ink,
          fontFamily: f.ui,
          padding: SPACE.m,
          minHeight: multiline ? 72 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          borderRadius: RADIUS.m,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
        }}
      />
    </View>
  );
}

export function CardEditorSheet({ target, onClose }: { target: Card | 'new' | null; onClose: () => void }) {
  const { c, f } = useTheme();
  const [kind, setKind] = useState<CardKind>('word');
  const [ja, setJa] = useState('');
  const [meaning, setMeaning] = useState('');
  const [exJa, setExJa] = useState('');
  const [exZh, setExZh] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const card = target && target !== 'new' ? target : null;
    setKind(card?.kind ?? 'word');
    setJa(card?.ja ?? '');
    setMeaning(card?.meaning ?? '');
    setExJa(card?.example?.ja ?? '');
    setExZh(card?.example?.zh ?? '');
    setNote(card?.note ?? '');
    setError(null);
  }, [target]);

  if (!target) return null;
  const editingCard = target === 'new' ? null : target;

  function save() {
    if (!ja.trim() || !meaning.trim()) return setError('「日文」和「中文意思」是必填。');
    const example = exJa.trim() && exZh.trim() ? { ja: exJa.trim(), zh: exZh.trim() } : undefined;
    const payload = {
      kind,
      ja: ja.trim(),
      meaning: meaning.trim(),
      example,
      note: note.trim() || undefined,
    };
    if (!editingCard) {
      const n = addItems([payload], 'manual');
      if (!n) return setError('單字本裡已經有這張卡了。');
      toast('已新增');
    } else {
      updateCard(editingCard.id, payload);
      toast('已儲存');
    }
    onClose();
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={target === 'new' ? '新增卡片' : '編輯卡片'}
      footer={<Button testID="save-card" label="儲存" onPress={save} />}
    >
      <View style={{ flexDirection: 'row', gap: SPACE.s }}>
        {KINDS.map((k) => (
          <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      <Field testID="edit-ja" label="日文" value={ja} onChange={setJa} placeholder="{勉強|べんきょう}する" />
      <Text
        style={{
          fontSize: 12,
          color: c.inkFaint,
          fontFamily: f.ui,
          lineHeight: 18,
          marginTop: -8,
        }}
      >
        用 {'{'}漢字|かな{'}'} 標讀音，送假名寫在括號外面。例如 {'{'}食|た{'}'}
        べる。
      </Text>
      {ja.trim() ? (
        <View
          style={{
            padding: SPACE.m,
            borderRadius: RADIUS.m,
            backgroundColor: c.accentSoft,
            gap: 4,
          }}
        >
          <Label tone="faint">預覽</Label>
          <RubyText text={ja} size={22} />
          {missingRuby(ja) ? (
            <Text style={{ fontSize: 12, color: c.hard, fontFamily: f.ui }}>
              有漢字還沒標讀音，這樣也可以存，但複習時看不到讀音。
            </Text>
          ) : null}
        </View>
      ) : null}
      <Field
        testID="edit-meaning"
        label="中文意思"
        value={meaning}
        onChange={setMeaning}
        placeholder="讀書；學習"
      />
      <Field
        label="例句（日文，選填）"
        value={exJa}
        onChange={setExJa}
        placeholder="{毎日|まいにち}{勉強|べんきょう}している。"
      />
      <Field label="例句（中文，選填）" value={exZh} onChange={setExZh} placeholder="每天都在讀書。" />
      <Field
        label="備註（選填）"
        value={note}
        onChange={setNote}
        multiline
        placeholder="用法、容易搞混的地方"
      />
      {error ? <Text style={{ color: c.again, fontSize: T.small, fontFamily: f.ui }}>{error}</Text> : null}
    </Sheet>
  );
}
