import { useCallback, useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** 目前時間；每隔一段時間自動更新，也可以手動 refresh（例如剛評完一張卡） */
export function useNow(intervalMs = 30_000): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  const refresh = useCallback(() => setNow(Date.now()), []);
  return [now, refresh];
}

/** 鍵盤是否打開（手機上打字時把分頁列藏起來，留空間給輸入框） */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** 網頁版鍵盤快捷鍵（桌機上用空白鍵翻面、1～4 評分） */
export function useHotkeys(active: boolean, handler: (key: string) => void) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !active || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e.key);
      if (e.key === ' ') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handler]);
}
