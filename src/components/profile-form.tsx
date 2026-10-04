import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChoiceCard, ChoiceChip } from '@/components/choice-option';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  LEVEL_OPTIONS,
  type Goal,
  type Interest,
  type Level,
  type Profile,
} from '@/constants/profile-options';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STEP_COUNT = 3;

type ProfileFormProps = {
  /** 修改設定時傳入原本的設定，選項會預先選好。 */
  initialProfile?: Profile | null;
  /** 最後一頁按鈕的文字，例如「開始學習」或「儲存」。 */
  submitLabel: string;
  onSubmit: (profile: Profile) => Promise<void>;
  /** 有傳的話，第一頁左下角會出現「取消」。 */
  onCancel?: () => void;
};

// 3 頁的設定表單：程度 → 學習目的 → 興趣。首次設定和修改設定共用。
export function ProfileForm({ initialProfile, submitLabel, onSubmit, onCancel }: ProfileFormProps) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Level | null>(initialProfile?.level ?? null);
  const [goals, setGoals] = useState<Goal[]>(initialProfile?.goals ?? []);
  const [interests, setInterests] = useState<Interest[]>(initialProfile?.interests ?? []);
  const [isSaving, setIsSaving] = useState(false);

  const isLastStep = step === STEP_COUNT - 1;
  const canContinue = step === 0 ? level !== null : step === 1 ? goals.length > 0 : true;

  async function handleNext() {
    if (!isLastStep) {
      setStep(step + 1);
      return;
    }
    if (!level) return;

    setIsSaving(true);
    try {
      await onSubmit({ level, goals, interests });
    } catch {
      Alert.alert('儲存失敗', '請檢查網路連線後再試一次。');
    } finally {
      setIsSaving(false);
    }
  }

  function handleBack() {
    if (step === 0) {
      onCancel?.();
    } else {
      setStep(step - 1);
    }
  }

  const showBackButton = step > 0 || onCancel !== undefined;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textSecondary">
            {step + 1} / {STEP_COUNT}
          </ThemedText>
          <View style={styles.progress}>
            {Array.from({ length: STEP_COUNT }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.progressSegment,
                  { backgroundColor: index <= step ? theme.accent : theme.backgroundSelected },
                ]}
              />
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {step === 0 && (
            <>
              <StepTitle
                title="你的日文程度是？"
                description="AI 會依照你的程度，挑選適合的單字和句子。"
              />
              {LEVEL_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  selected={level === option.value}
                  onPress={() => setLevel(option.value)}
                />
              ))}
            </>
          )}

          {step === 1 && (
            <>
              <StepTitle title="你為什麼想學日文？" description="可以複選，至少選一個。" />
              {GOAL_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  selected={goals.includes(option.value)}
                  multiple
                  onPress={() => setGoals(toggle(goals, option.value))}
                />
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <StepTitle
                title="你對什麼有興趣？"
                description="可以複選，也可以先跳過。AI 會優先用這些主題當例句。"
              />
              <View style={styles.chips}>
                {INTEREST_OPTIONS.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={interests.includes(option.value)}
                    onPress={() => setInterests(toggle(interests, option.value))}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {showBackButton && (
            <Button
              title={step === 0 ? '取消' : '上一步'}
              variant="secondary"
              onPress={handleBack}
              disabled={isSaving}
              style={styles.footerButton}
            />
          )}
          <Button
            title={isLastStep ? (isSaving ? '儲存中…' : submitLabel) : '下一步'}
            onPress={handleNext}
            disabled={!canContinue || isSaving}
            style={styles.footerButton}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function StepTitle({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.stepTitle}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{description}</ThemedText>
    </View>
  );
}

/** 已選就取消、沒選就加入（複選用）。 */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  header: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  progress: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  stepTitle: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  footerButton: {
    flex: 1,
  },
});
