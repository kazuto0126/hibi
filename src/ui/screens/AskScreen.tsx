/**
 * 問 AI：隨時問日文問題，回答裡值得記的內容可以一鍵整理成卡片。
 */
import { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiError, isAbort, type ChatMessage } from '../../core/ai/provider';
import { filterNew, knownKeys } from '../../core/deck';
import { toPlain } from '../../core/ruby';
import type { SuggestedItem } from '../../core/types';
import { addItems, currentProvider, getState, toast, useApp } from '../../state/store';
import { Body, Button, Chip, Heading, Label } from '../components/Basics';
import { Rich } from '../components/Rich';
import { SuggestionList } from '../components/SuggestionList';
import { MAX_WIDTH, RADIUS, SPACE, T, useTheme } from '../theme';

interface Msg extends ChatMessage {
  id: number;
  error?: string;
  cards?: SuggestedItem[] | 'loading' | 'none';
}

const STARTERS = [
  '「は」和「が」差在哪？',
  '「暑い」和「熱い」怎麼分？',
  '「お疲れ様です」什麼時候用？',
  '在便利商店結帳會用到哪些話？',
];

let seq = 0;

export function AskScreen() {
  const { c, f } = useTheme();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const provider = currentProvider(app.settings);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patch = (id: number, p: Partial<Msg>) =>
    setMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...p } : m)));

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const user: Msg = { id: ++seq, role: 'user', content: q };
    const reply: Msg = { id: ++seq, role: 'assistant', content: '' };
    const history = [...msgs.filter((m) => !m.error && m.content), user]
      .map(({ role, content }) => ({ role, content }))
      .slice(-12);
    setMsgs((list) => [...list, user, reply]);
    setInput('');
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const out = await provider.chat(history, {
        signal: ac.signal,
        learner: app.settings.profile,
        onText: (t) => patch(reply.id, { content: t }),
      });
      patch(reply.id, { content: out });
    } catch (e) {
      if (!isAbort(e))
        patch(reply.id, {
          error: e instanceof AiError ? e.message : '發生未預期的錯誤，請再試一次。',
        });
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  async function extract(m: Msg) {
    patch(m.id, { cards: 'loading' });
    try {
      const known = getState().cards.map((x) => toPlain(x.ja));
      const items = await provider.extractCards(m.content, app.settings.profile, known);
      const fresh = filterNew(items, knownKeys(getState().cards));
      patch(m.id, { cards: fresh.length ? fresh : 'none' });
    } catch (e) {
      patch(m.id, { cards: undefined });
      toast(e instanceof AiError ? e.message : '整理卡片時發生錯誤');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: SPACE.l,
          paddingTop: insets.top + SPACE.l,
          paddingBottom: SPACE.l,
          gap: SPACE.l,
        }}
      >
        <Heading>問 AI</Heading>
        {msgs.length === 0 ? (
          <View style={{ gap: SPACE.m }}>
            <Body color={c.inkSoft}>
              想不通的文法、分不清的單字、不知道怎麼說的話，都可以問。回答裡值得記的內容，可以一鍵整理成卡片。
            </Body>
            <Label tone="faint">
              {provider.id === 'demo'
                ? '目前是離線示範，只能回答下面這幾種常見問題。'
                : `由 ${provider.label} 回答。`}
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s }}>
              {STARTERS.map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
          </View>
        ) : null}

        {msgs.map((m) =>
          m.role === 'user' ? (
            <View
              key={m.id}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '86%',
                backgroundColor: c.accent,
                borderRadius: RADIUS.l,
                borderBottomRightRadius: 4,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  color: c.onAccent,
                  fontSize: T.body,
                  lineHeight: 24,
                  fontFamily: f.ui,
                }}
              >
                {m.content}
              </Text>
            </View>
          ) : (
            <View key={m.id} style={{ gap: SPACE.s }}>
              <View
                style={{
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: RADIUS.l,
                  borderBottomLeftRadius: 4,
                  padding: 14,
                }}
              >
                {m.error ? (
                  <Text
                    style={{
                      color: c.again,
                      fontSize: T.body,
                      fontFamily: f.ui,
                    }}
                  >
                    {m.error}
                  </Text>
                ) : m.content ? (
                  <Rich text={m.content} />
                ) : (
                  <Text
                    style={{
                      color: c.inkFaint,
                      fontSize: T.body,
                      fontFamily: f.ui,
                    }}
                  >
                    思考中…
                  </Text>
                )}
              </View>
              {!m.error && m.content && !busy && m.cards === undefined ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => extract(m)}
                  style={{ alignSelf: 'flex-start' }}
                  testID="extract-cards"
                >
                  <Text
                    style={{
                      color: c.accent,
                      fontSize: T.small,
                      fontFamily: f.ui,
                      fontWeight: '600',
                    }}
                  >
                    整理成卡片
                  </Text>
                </Pressable>
              ) : null}
              {m.cards === 'loading' ? <Label tone="faint">正在整理…</Label> : null}
              {m.cards === 'none' ? <Label tone="faint">這段回答裡的內容都已經在單字本裡了。</Label> : null}
              {Array.isArray(m.cards) ? (
                <SuggestionList
                  items={m.cards}
                  onAdd={(picked) => {
                    const n = addItems(picked, 'ask');
                    toast(n ? `已加入 ${n} 張` : '這些卡片已經在單字本裡了');
                    patch(m.id, { cards: 'none' });
                  }}
                  onDismiss={() => patch(m.id, { cards: undefined })}
                />
              ) : null}
            </View>
          ),
        )}
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.paper,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: SPACE.s,
            width: '100%',
            maxWidth: MAX_WIDTH,
            alignSelf: 'center',
            padding: SPACE.m,
            alignItems: 'flex-end',
          }}
        >
          <TextInput
            testID="ask-input"
            value={input}
            onChangeText={setInput}
            placeholder="輸入問題，例如：「よろしく」怎麼用？"
            placeholderTextColor={c.inkFaint}
            multiline
            maxLength={500}
            onKeyPress={(e) => {
              const ne = e.nativeEvent as unknown as {
                key: string;
                shiftKey?: boolean;
                isComposing?: boolean;
              };
              // 網頁版：Enter 送出、Shift+Enter 換行；用注音／日文輸入法選字時不送出
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey && !ne.isComposing) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                void send(input);
              }
            }}
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 44,
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
          <Button
            testID="ask-send"
            label="送出"
            onPress={() => send(input)}
            disabled={!input.trim()}
            loading={busy}
          />
        </View>
      </View>
    </View>
  );
}
