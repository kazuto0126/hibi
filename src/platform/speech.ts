/**
 * 日文發音（裝置內建的文字轉語音，不需要網路）。
 */
import * as Speech from 'expo-speech';
import { toPlain } from '../core/ruby';

let jaVoice: string | undefined;
let checked = false;
let hasJa = true;

async function pickVoice() {
  if (checked) return;
  checked = true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const ja = voices.filter((v) => v.language?.toLowerCase().startsWith('ja'));
    hasJa = ja.length > 0 || voices.length === 0;
    const enhanced = ja.find((v) => String(v.quality).toLowerCase() === 'enhanced');
    jaVoice = (enhanced ?? ja[0])?.identifier;
  } catch {
    // 拿不到清單就交給系統依 language 自動選
  }
}

export function speakJa(text: string, rate = 0.9) {
  const plain = toPlain(text)
    .replace(/[〜~（）()]/g, ' ')
    .trim();
  if (!plain) return;
  void pickVoice().finally(() => {
    void Speech.stop();
    Speech.speak(plain, { language: 'ja-JP', rate, voice: jaVoice });
  });
}

/** 裝置有沒有日文語音（設定頁用來提示） */
export async function hasJapaneseVoice(): Promise<boolean> {
  await pickVoice();
  return hasJa;
}
