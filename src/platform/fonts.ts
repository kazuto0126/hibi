/**
 * 原生平台（iOS / Android）的日文字型。
 *
 * 內建的 Klee One 是「子集化」過的版本：原檔 7.9MB，只留下假名、常用標點、
 * JIS 第一水準漢字與全部常用漢字（共 3,486 字），縮小到 3.7MB。
 * 子集化腳本：scripts/subset-font.py
 *
 * 為什麼要內建日文字型？同一個 Unicode 漢字在中文和日文字型裡長得不一樣
 * （例如「直」「骨」「写」），台灣手機預設會用中文字型顯示日文，學到的字形就不對。
 */
import { useFonts } from 'expo-font';

export function useAppFonts(): { ready: boolean; ja: string | undefined } {
  const [loaded, error] = useFonts({
    KleeOne: require('../../assets/fonts/KleeOne-Regular-JP-subset.ttf'),
  });
  if (error) return { ready: true, ja: undefined };
  return { ready: loaded, ja: loaded ? 'KleeOne' : undefined };
}
