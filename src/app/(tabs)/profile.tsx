import { useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  LEVEL_OPTIONS,
  getLabels,
} from '@/constants/profile-options';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/providers/profile-provider';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useProfile();

  // 沒有設定的話 _layout.tsx 不會讓人進到這裡，這行只是保險。
  if (!profile) return null;

  const interestLabels = getLabels(INTEREST_OPTIONS, profile.interests);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">我的</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              學習設定
            </ThemedText>
            <SettingRow label="日文程度" value={getLabels(LEVEL_OPTIONS, [profile.level]).join('')} />
            <SettingRow label="學習目的" value={getLabels(GOAL_OPTIONS, profile.goals).join('、')} />
            <SettingRow
              label="興趣"
              value={interestLabels.length > 0 ? interestLabels.join('、') : '還沒選'}
            />
          </ThemedView>

          <Button title="修改設定" variant="secondary" onPress={() => router.push('/edit-profile')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
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
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    // 網頁版的分頁列在上方，要留空間；手機版的分頁列在下方。
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontWeight: 700,
  },
});
