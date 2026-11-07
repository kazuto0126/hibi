/**
 * 網頁版的字型：從 Google Fonts 載入（瀏覽器只會下載畫面上用到的字），
 * 不把 3.7MB 的字型檔打包進網頁。
 */
const HREF =
  'https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Noto+Sans+TC:wght@400;500;700&display=swap';

function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-hibi-fonts]')) return;
  const pre = document.createElement('link');
  pre.rel = 'preconnect';
  pre.href = 'https://fonts.gstatic.com';
  pre.crossOrigin = 'anonymous';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HREF;
  link.setAttribute('data-hibi-fonts', '');
  document.head.append(pre, link);
}

ensureStylesheet();

export function useAppFonts(): { ready: boolean; ja: string | undefined } {
  return {
    ready: true,
    ja: '"Klee One", "Hiragino Mincho ProN", "Yu Mincho", serif',
  };
}
