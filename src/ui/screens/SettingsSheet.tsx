/**
 * 設定：AI 服務、學習參數、資料備份。
 */
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text, TextInput, View } from 'react-native';
import { GEMINI_MODELS, createGeminiProvider } from '../../core/ai/gemini';
import { AiError } from '../../core/ai/provider';
import type { LearnerProfile, Settings } from '../../core/types';
import { GoalPicker, InterestPicker, LevelPicker } from '../components/ProfilePickers';
import { isClaudeHost } from '../../platform/claude';
import { hasJapaneseVoice, speakJa } from '../../platform/speech';
import {
  currentProvider,
  exportBackup,
  importBackup,
  resetAll,
  toast,
  updateSettings,
  useApp,
} from '../../state/store';
import { Body, Button, Chip, Divider, Heading, Label, Stepper } from '../components/Basics';
import { Sheet } from '../components/Sheet';
import { RADIUS, SPACE, T, useTheme } from '../theme';

const RATES = [
  { v: 0.7, label: '慢' },
  { v: 0.9, label: '稍慢' },
  { v: 1.0, label: '正常' },
  { v: 1.2, label: '快' },
];

export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c, f } = useTheme();
  const app = useApp();
  const s = app.settings;
  // 設定頁只有在完成首次設定（或示範資料）後才看得到，這裡的預設值只是保險
  const profile: LearnerProfile = s.profile ?? { level: 'N4', goals: [], interests: [] };
  const active = currentProvider(s);
  const [key, setKey] = useState(s.geminiApiKey);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backup, setBackup] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);

  useEffect(() => {
    if (visible) {
      setKey(s.geminiApiKey);
      setTestMsg(null);
      setConfirmReset(false);
      void hasJapaneseVoice().then(setVoiceOk);
    }
  }, [visible]);

  const set = (p: Partial<Settings>) => updateSettings(p);

  async function testGemini() {
    setTesting(true);
    setTestMsg(null);
    try {
      const p = createGeminiProvider({
        apiKey: key.trim(),
        model: s.geminiModel,
      });
      await p.chat([{ role: 'user', content: '用一句日文跟我打招呼，不用解釋。' }]);
      set({ geminiApiKey: key.trim() });
      setTestMsg({ ok: true, text: '連線成功，已儲存金鑰。' });
    } catch (e) {
      setTestMsg({
        ok: false,
        text: e instanceof AiError ? e.message : '連線失敗，請再試一次。',
      });
    } finally {
      setTesting(false);
    }
  }

  const onClaude = isClaudeHost();
  const providers: {
    id: Settings['aiProvider'];
    label: string;
    show: boolean;
  }[] = [
    { id: 'auto', label: '自動', show: true },
    { id: 'gemini', label: 'Gemini', show: !onClaude },
    { id: 'claude', label: 'Claude', show: app.claudeAvailable },
    { id: 'demo', label: '離線示範', show: true },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="設定">
      <Heading size={T.lead}>AI 服務</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s }}>
        {providers
          .filter((p) => p.show)
          .map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              selected={s.aiProvider === p.id}
              onPress={() => set({ aiProvider: p.id })}
            />
          ))}
      </View>
      <Label>
        {`目前使用：${active.label}。`}
        {s.aiProvider === 'auto'
          ? '自動模式會優先用 Claude（網頁 Demo 內）、再來是 Gemini，都沒有就用離線示範。'
          : ''}
      </Label>

      {onClaude ? (
        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            color: c.inkFaint,
            fontFamily: f.ui,
          }}
        >
          這個網頁 Demo 透過你自己的 Claude 帳號使用 AI，第一次使用時會請你允許。手機 App 版可以改用
          Gemini（自備免費 API Key）。
        </Text>
      ) : (
        <View style={{ gap: SPACE.s }}>
          <Label>Gemini API Key</Label>
          <TextInput
            testID="gemini-key"
            value={key}
            onChangeText={setKey}
            placeholder="貼上你的 API Key"
            placeholderTextColor={c.inkFaint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              fontSize: T.body,
              color: c.ink,
              fontFamily: f.ui,
              padding: SPACE.m,
              borderRadius: RADIUS.m,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.surface,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              lineHeight: 18,
              color: c.inkFaint,
              fontFamily: f.ui,
            }}
          >
            到 Google AI
            Studio（aistudio.google.com/apikey）可以免費申請。金鑰只存在這台裝置上，匯出備份時不會包含。
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s }}>
            {GEMINI_MODELS.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                selected={s.geminiModel === m.id}
                onPress={() => set({ geminiModel: m.id })}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: SPACE.s, flexWrap: 'wrap' }}>
            <Button label="測試並儲存" small onPress={testGemini} loading={testing} disabled={!key.trim()} />
            <Button
              label="開啟 Google AI Studio"
              small
              variant="ghost"
              onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
            />
          </View>
          {testMsg ? (
            <Text
              style={{
                fontSize: T.small,
                color: testMsg.ok ? c.good : c.again,
                fontFamily: f.ui,
              }}
            >
              {testMsg.text}
            </Text>
          ) : null}
        </View>
      )}

      <Divider />
      <Heading size={T.lead}>學習</Heading>
      <View style={{ gap: SPACE.s }}>
        <Label>目標記憶率</Label>
        <Stepper
          label="目標記憶率"
          value={s.desiredRetention}
          step={0.01}
          min={0.8}
          max={0.97}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ desiredRetention: v })}
        />
        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            color: c.inkFaint,
            fontFamily: f.ui,
          }}
        >
          希望卡片到期那天，你還記得的機率。調高比較不容易忘，但每天要複習的量會明顯變多；90%
          是多數人的平衡點。
        </Text>
      </View>
      <View style={{ gap: SPACE.s }}>
        <Label>每天最多學幾張新卡</Label>
        <Stepper
          label="每日新卡上限"
          value={s.newPerDay}
          step={5}
          min={0}
          max={50}
          format={(v) => `${v} 張`}
          onChange={(v) => set({ newPerDay: v })}
        />
      </View>
      <View style={{ gap: SPACE.s }}>
        <Label>我的程度</Label>
        <LevelPicker
          compact
          value={profile.level}
          onChange={(level) => set({ profile: { ...profile, level } })}
        />
        <Text style={{ fontSize: 12, lineHeight: 18, color: c.inkFaint, fontFamily: f.ui }}>
          選「零基礎」或「會五十音」時，日文會一律附上讀音和羅馬拼音。
        </Text>
      </View>
      <View style={{ gap: SPACE.s }}>
        <Label>學習目的（AI 挑卡、新手包會參考）</Label>
        <GoalPicker
          compact
          value={profile.goals}
          onChange={(goals) => set({ profile: { ...profile, goals } })}
        />
      </View>
      <View style={{ gap: SPACE.s }}>
        <Label>興趣</Label>
        <InterestPicker
          value={profile.interests}
          onChange={(interests) => set({ profile: { ...profile, interests } })}
        />
      </View>
      <View style={{ gap: SPACE.s }}>
        <Label>發音速度</Label>
        <View style={{ flexDirection: 'row', gap: SPACE.s }}>
          {RATES.map((r) => (
            <Chip
              key={r.v}
              label={r.label}
              selected={Math.abs(s.speechRate - r.v) < 0.01}
              onPress={() => {
                set({ speechRate: r.v });
                speakJa('{今日|きょう}もよろしくお{願|ねが}いします', r.v);
              }}
            />
          ))}
        </View>
        {!voiceOk ? (
          <Text style={{ fontSize: 12, color: c.hard, fontFamily: f.ui }}>
            這台裝置好像沒有日文語音。可以到系統設定的「文字轉語音」下載日文語音。
          </Text>
        ) : null}
      </View>

      <Divider />
      <Heading size={T.lead}>資料</Heading>
      {app.storageDegraded ? (
        <Body color={c.hard}>這個環境不允許儲存資料，關掉頁面後內容會消失。要長期使用，請用手機 App。</Body>
      ) : (
        <Label>資料只存在這台裝置上。換手機前記得先匯出備份。</Label>
      )}
      <View style={{ flexDirection: 'row', gap: SPACE.s, flexWrap: 'wrap' }}>
        <Button
          label="複製備份"
          small
          variant="secondary"
          onPress={async () => {
            try {
              await Clipboard.setStringAsync(exportBackup());
              toast(`已複製 ${app.cards.length} 張卡片的備份，貼到記事本保存即可`);
            } catch {
              toast('這個環境不能使用剪貼簿');
            }
          }}
        />
      </View>
      <TextInput
        value={backup}
        onChangeText={setBackup}
        placeholder="要還原時，把備份內容貼在這裡"
        placeholderTextColor={c.inkFaint}
        multiline
        style={{
          minHeight: 64,
          fontSize: 12,
          color: c.ink,
          fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
          }),
          padding: SPACE.m,
          borderRadius: RADIUS.m,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
          textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', gap: SPACE.s, flexWrap: 'wrap' }}>
        <Button
          label="從備份還原"
          small
          variant="secondary"
          disabled={!backup.trim()}
          onPress={async () => {
            try {
              const n = await importBackup(backup);
              setBackup('');
              toast(`已還原 ${n} 張卡片`);
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        />
        <Button
          label={confirmReset ? '再按一次就會清除全部' : '清除所有資料'}
          small
          variant="danger"
          onPress={async () => {
            if (!confirmReset) return setConfirmReset(true);
            await resetAll();
            setConfirmReset(false);
            toast('已清除所有卡片與紀錄');
          }}
        />
      </View>

      <Divider />
      <Heading size={T.lead}>關於</Heading>
      <Text
        style={{
          fontSize: 12,
          lineHeight: 19,
          color: c.inkSoft,
          fontFamily: f.ui,
        }}
      >
        Hibi 日々 v1.0{'\n'}
        排程演算法：FSRS-6（與開源參考實作 ts-fsrs 逐步比對一致）{'\n'}
        日文字型：Klee One（SIL Open Font License 1.1）
      </Text>
    </Sheet>
  );
}
