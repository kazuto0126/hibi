/**
 * Hibi 日々 —— 從你的日常學日文。
 *
 * 畫面結構：四個分頁（今日／複習／問 AI／單字本）＋設定面板。
 * 分頁沒有用導覽套件，而是自己切換顯示：四個畫面都保持掛載（切回來時輸入的內容還在），
 * 也不改網址，所以同一份程式碼可以直接發布成單一網頁 Demo。
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { buildQueue } from './src/core/deck';
import { useAppFonts } from './src/platform/fonts';
import { init, useApp } from './src/state/store';
import { TabBar, type TabId } from './src/ui/components/TabBar';
import { Toast } from './src/ui/components/Toast';
import { useKeyboardVisible, useNow } from './src/ui/hooks';
import { AskScreen } from './src/ui/screens/AskScreen';
import { LibraryScreen } from './src/ui/screens/LibraryScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import { ReviewScreen } from './src/ui/screens/ReviewScreen';
import { SettingsSheet } from './src/ui/screens/SettingsSheet';
import { TodayScreen } from './src/ui/screens/TodayScreen';
import { ThemeContext, UI_FONT, dark, light, type Theme } from './src/ui/theme';

export default function App() {
  const scheme = useColorScheme();
  const fonts = useAppFonts();
  const app = useApp();
  const [tab, setTab] = useState<TabId>('today');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const keyboard = useKeyboardVisible();
  const [now] = useNow(30_000);

  useEffect(() => {
    void init();
  }, []);

  const theme = useMemo<Theme>(
    () => ({
      c: scheme === 'dark' ? dark : light,
      f: { ja: fonts.ja, ui: UI_FONT },
      dark: scheme === 'dark',
    }),
    [scheme, fonts.ja],
  );

  if (!fonts.ready || !app.ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.c.paper,
        }}
      >
        <ActivityIndicator color={theme.c.accent} />
      </View>
    );
  }

  // 還沒做首次設定（而且不是網頁 Demo 的示範資料）→ 先問程度、目的、興趣
  if (!app.settings.profile && !app.settings.demoData) {
    return (
      <SafeAreaProvider>
        <ThemeContext.Provider value={theme}>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <OnboardingScreen />
        </ThemeContext.Provider>
      </SafeAreaProvider>
    );
  }

  const due = buildQueue(app.cards, app.logs, now, app.settings.newPerDay).ids.length;
  const show = (id: TabId) => ({
    flex: 1,
    display: tab === id ? ('flex' as const) : ('none' as const),
  });

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <View style={{ flex: 1, backgroundColor: theme.c.paper }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={show('today')}>
              <TodayScreen
                onStartReview={() => setTab('review')}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </View>
            <View style={show('review')}>
              <ReviewScreen active={tab === 'review'} onGoToday={() => setTab('today')} />
            </View>
            <View style={show('ask')}>
              <AskScreen />
            </View>
            <View style={show('library')}>
              <LibraryScreen />
            </View>
          </KeyboardAvoidingView>
          {keyboard ? null : <TabBar active={tab} onChange={setTab} badge={{ review: due }} />}
          <Toast />
        </View>
        <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}
