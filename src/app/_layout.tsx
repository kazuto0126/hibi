import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ProfileProvider, useProfile } from '@/providers/profile-provider';

// 整個 App 最外層：套用淺色／深色主題，並用 Stack 管理頁面。
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </ThemeProvider>
  );
}

// 還沒完成首次設定 → 只能看到 onboarding；完成後 → 只能看到分頁和修改設定頁。
// guard 一改變，Expo Router 會自動跳到可以看的頁面。
function RootNavigator() {
  const { profile } = useProfile();
  const hasProfile = profile !== null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit-profile" />
      </Stack.Protected>
      <Stack.Protected guard={!hasProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
