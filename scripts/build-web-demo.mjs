/**
 * 把 Expo 的網頁輸出（dist/）打包成「單一 HTML 檔」，用來發布線上 Demo。
 *
 * 為什麼要單一檔案？Demo 放在 claude.ai 的 artifact 上，頁面不能從其他網址載入程式，
 * 所以把 JS bundle 直接內嵌進 HTML。
 *
 * 用法：
 *   npx expo export --platform web --output-dir dist
 *   node scripts/build-web-demo.mjs
 * 產出：dist-demo/index.html
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
);
const dist = path.join(root, 'dist');
let html = readFileSync(path.join(dist, 'index.html'), 'utf8');

const scriptRe = /<script src="(\/_expo\/static\/js\/web\/[^"]+\.js)" defer><\/script>/;
const m = html.match(scriptRe);
if (!m) throw new Error('找不到 Expo 的 JS bundle，請先執行 npx expo export --platform web');
let js = readFileSync(path.join(dist, m[1]), 'utf8');
// 內嵌的 <script> 裡不能出現 </script>、<!-- 或 <script，否則 HTML 解析器會提早結束或吃掉後面的內容。
// 換成 \x3C（同一個「<」字元的跳脫寫法），在字串、樣板字串和正規表示式裡意思都不變。
js = js.replace(/<(\/script|!--|script)/gi, '\\x3C$1');

const fonts =
  'https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Noto+Sans+TC:wght@400;500;700&display=swap';

html = html
  .replace(scriptRe, '')
  .replace(/<meta httpEquiv[^>]*>\s*/i, '')
  .replace(/<link rel="icon"[^>]*>/i, '')
  .replace(
    '</head>',
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}" data-hibi-fonts>
<style>
  body { background: #F1F2EE; margin: 0; }
  @media (prefers-color-scheme: dark) { body { background: #14161A; } }
</style>
</head>`,
  )
  // 用函式當替換值：bundle 裡有 $' 之類的字串，直接傳字串會被 replace() 當成特殊替換符號
  .replace('</body>', () => `<script>${js}</script>\n</body>`);

const outDir = path.join(root, 'dist-demo');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`dist-demo/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
