import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { StartupError } from '@/components/startup-error';
import { ProfileProvider, useProfile } from '@/providers/profile-provider';

// 登入和讀取設定需要一點時間，這段期間先停在啟動畫面，讀好再收起來。
SplashScreen.preventAutoHideAsync();

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
  const { status, profile, retry } = useProfile();
  const hasProfile = profile !== null;

  useEffect(() => {
    if (status !== 'loading') {
      SplashScreen.hide();
    }
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'error') return <StartupError onRetry={retry} />;

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
