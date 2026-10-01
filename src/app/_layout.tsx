import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

// 整個 App 最外層：套用淺色／深色主題，並用 Stack 管理頁面。
// 底部分頁放在 (tabs) 資料夾；之後的首次設定、卡片詳細頁等會疊在分頁上方。
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
