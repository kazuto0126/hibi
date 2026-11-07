/**
 * 設計 token。
 *
 * 色彩取自日本傳統色：
 *   瑠璃紺（主色）、朱（重來）、山吹（提醒）、萌黄（記得），底色是偏冷的和紙白。
 * 字型：日文用 Klee One（教科書體風格，字形就是學校教的寫法），中文介面用系統黑體。
 */
import { createContext, useContext } from 'react';
import { Platform } from 'react-native';

export interface Palette {
  paper: string;
  surface: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  /** 練習格的外框 */
  grid: string;
  /** 練習格中央的十字虛線 */
  guide: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  highlight: string;
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export const light: Palette = {
  paper: '#F1F2EE',
  surface: '#FAFAF7',
  ink: '#1F232A',
  inkSoft: '#525862',
  inkFaint: '#8A9099',
  line: '#D9DCD5',
  grid: '#B9C7A9',
  guide: '#E5AE9F',
  accent: '#1D4A8C',
  accentSoft: '#E1E8F3',
  onAccent: '#FFFFFF',
  highlight: '#C98A00',
  again: '#C1432D',
  hard: '#A8730F',
  good: '#467838',
  easy: '#1D4A8C',
};

export const dark: Palette = {
  paper: '#14161A',
  surface: '#1C1F24',
  ink: '#E9EAE5',
  inkSoft: '#B0B4BA',
  inkFaint: '#7E838B',
  line: '#2E3239',
  grid: '#44523A',
  guide: '#73433A',
  accent: '#93B3EA',
  accentSoft: '#22314B',
  onAccent: '#0F1624',
  highlight: '#EDB33A',
  again: '#EE7B63',
  hard: '#DDA94C',
  good: '#93C47F',
  easy: '#93B3EA',
};

export interface Fonts {
  /** 日文（Klee One）；原生平台若字型載入失敗則為 undefined，退回系統字型 */
  ja: string | undefined;
  ui: string | undefined;
}

export const UI_FONT: string | undefined = Platform.select({
  web: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
  default: undefined,
});

export interface Theme {
  c: Palette;
  f: Fonts;
  dark: boolean;
}

export const ThemeContext = createContext<Theme>({
  c: light,
  f: { ja: undefined, ui: UI_FONT },
  dark: false,
});
export const useTheme = () => useContext(ThemeContext);

/** 字級：以 4 為基準的比例尺 */
export const T = {
  caption: 12,
  small: 14,
  body: 16,
  lead: 18,
  title: 22,
  display: 30,
} as const;

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { s: 6, m: 10, l: 16 } as const;
export const MAX_WIDTH = 560;
