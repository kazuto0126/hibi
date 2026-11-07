/**
 * 首次設定：程度 → 學習目的 → 興趣，三頁。
 * 流程沿用舊版 japanessapp 的設計；填完之後 AI 挑卡、回答問題、新手包都會參考這些資料。
 */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Goal, Interest, Level } from '../../core/types';
import { updateSettings } from '../../state/store';
import { Body, Button } from '../components/Basics';
import { GoalPicker, InterestPicker, LevelPicker } from '../components/ProfilePickers';
import { MAX_WIDTH, SPACE, T, useTheme } from '../theme';

const STEPS = [
  { title: '你的日文程度？', hint: '用來決定要挑多難的單字。之後可以在「設定」修改。' },
  { title: '為什麼想學日文？', hint: '可以複選。AI 會多挑跟目的有關的說法。' },
  { title: '平常喜歡什麼？', hint: '選幾個就好，也可以跳過。例句會盡量跟興趣有關。' },
];

export function OnboardingScreen() {
  const { c, f } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Level | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);

  const canNext = step === 0 ? level !== null : step === 1 ? goals.length > 0 : true;
  const last = step === STEPS.length - 1;

  function next() {
    if (!last) return setStep(step + 1);
    if (level) updateSettings({ profile: { level, goals, interests } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView
        contentContainerStyle={{
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: SPACE.l,
          paddingTop: insets.top + SPACE.xl,
          paddingBottom: SPACE.xl,
          gap: SPACE.l,
        }}
      >
        <View
          style={{ flexDirection: 'row', gap: 6 }}
          accessibilityLabel={`第 ${step + 1} 步，共 ${STEPS.length} 步`}
        >
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.line }}
            />
          ))}
        </View>
        <Text
          style={{ fontSize: T.caption, color: c.inkFaint, fontFamily: f.ui }}
        >{`首次設定 ${step + 1} / ${STEPS.length}`}</Text>
        <Text
          accessibilityRole="header"
          style={{ fontSize: T.display - 4, fontWeight: '700', color: c.ink, fontFamily: f.ui }}
        >
          {STEPS[step].title}
        </Text>
        <Body color={c.inkSoft}>{STEPS[step].hint}</Body>
        {step === 0 ? <LevelPicker value={level} onChange={setLevel} /> : null}
        {step === 1 ? <GoalPicker value={goals} onChange={setGoals} /> : null}
        {step === 2 ? <InterestPicker value={interests} onChange={setInterests} /> : null}
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.surface,
          paddingBottom: insets.bottom,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: SPACE.s,
            width: '100%',
            maxWidth: MAX_WIDTH,
            alignSelf: 'center',
            padding: SPACE.l,
          }}
        >
          {step > 0 ? <Button label="上一步" variant="ghost" onPress={() => setStep(step - 1)} /> : null}
          <Button
            testID="onboarding-next"
            label={last ? '開始學習' : '下一步'}
            onPress={next}
            disabled={!canNext}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}
