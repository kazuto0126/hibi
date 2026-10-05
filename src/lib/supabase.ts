import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// 這兩個值從 .env 讀進來（範本見 .env.example）。改了 .env 之後要重新執行 expo start 才會生效。
// Publishable key 本來就是設計給 App 用的公開金鑰，資料靠資料庫的 RLS 保護。
// Secret key 絕對不能放進 App。
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    '找不到 Supabase 設定：請確認專案根目錄有 .env，並填好 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY。'
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // 手機用 AsyncStorage 記住登入狀態；網頁版不指定，Supabase 會自己用瀏覽器的 localStorage。
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// 手機上 App 切到背景時暫停自動更新登入憑證，回到前景再繼續。
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
