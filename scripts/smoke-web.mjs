/**
 * 網頁版端對端冒煙測試（smoke test）：用無頭 Chrome 實際點過一輪主要流程，並存下截圖。
 *
 * 用法：
 *   npx expo export --platform web --output-dir dist
 *   node scripts/build-web-demo.mjs
 *   node scripts/smoke-web.mjs            （Windows 請先設定 CHROME_PATH 指到 chrome.exe）
 * 截圖輸出到 docs/screenshots/
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/usr/bin/google-chrome');
const KLEE = readFileSync(path.join(root, 'assets/fonts/KleeOne-Regular-JP-subset.ttf'));

// 測試環境不一定連得到 Google Fonts：攔截字型請求，改用本機字型，截圖才會跟實際一樣
const FONT_CSS = `
@font-face { font-family: 'Klee One'; font-weight: 400 700; src: url('https://hibi.test/klee.ttf') format('truetype'); }
@font-face { font-family: 'Noto Sans TC'; font-weight: 400; src: local('Noto Sans CJK TC'), local('NotoSansCJKtc-Regular'), local('Microsoft JhengHei'); }
@font-face { font-family: 'Noto Sans TC'; font-weight: 500 700; src: local('Noto Sans CJK TC Bold'), local('NotoSansCJKtc-Bold'), local('Microsoft JhengHei Bold'); }`;

const errors = [];
const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`✓ ${name}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('https://fonts.googleapis.com/')) {
      return req.respond({
        status: 200,
        contentType: 'text/css',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: FONT_CSS,
      });
    }
    if (url === 'https://hibi.test/klee.ttf') {
      return req.respond({
        status: 200,
        contentType: 'font/ttf',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: KLEE,
      });
    }
    if (url.startsWith('https://fonts.gstatic.com/')) return req.abort();
    return req.continue();
  });

  const shot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  };
  const byTestId = (id) => `[data-testid="${id}"]`;
  const click = async (id) => {
    await page.waitForSelector(byTestId(id), { visible: true });
    // 用 DOM 的 click()：React Native Web 的 Pressable 會把它當成一般點擊處理
    await page.$eval(byTestId(id), (el) => el.click());
  };
  // 有假名標註的文字是一字一格排版，innerText 會在字與字之間插入換行，所以比對前先去掉空白
  const waitText = (text, timeout = 8000) =>
    page.waitForFunction(
      (t) => document.body.innerText.replace(/\s/g, '').includes(t.replace(/\s/g, '')),
      { timeout },
      text,
    );
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('[role="button"],[role="checkbox"],[role="tab"]')];
      const el =
        els.find((e) => e.offsetParent !== null && e.innerText.trim() === t) ??
        els.find((e) => e.offsetParent !== null && e.innerText.includes(t));
      if (!el) return false;
      el.click();
      return true;
    }, text);
    if (!ok) throw new Error(`找不到按鈕：${text}`);
  };

  await page.goto(pathToFileURL(path.join(root, 'dist-demo', 'index.html')).href);
  await waitText('今天過得如何');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitText('這是示範資料');
  await shot('01-today-demo');
  step('第一次打開：自動放入「模擬使用三週」的示範資料');

  await click('tab-library');
  await waitText('實際記得');
  await shot('02-library-demo');
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="button"]')].filter(
      (e) => e.offsetParent !== null && /複習中/.test(e.innerText),
    );
    rows[0]?.click();
  });
  await waitText('穩定度');
  await shot('03-card-detail');
  await clickText('完成');
  await page.waitForFunction(() => !document.body.innerText.includes('記憶狀態'));
  await new Promise((r) => setTimeout(r, 400));
  step('單字本統計（記憶率：實際 vs 預測）與卡片記憶狀態（R / S / D）');

  await click('tab-review');
  await page.waitForSelector(byTestId('review-card'), { visible: true });
  await shot('04-review-front');
  await click('reveal');
  await page.waitForSelector(byTestId('rate-3'), { visible: true });
  await shot('05-review-back');
  await click('rate-3');
  await page.waitForSelector(byTestId('reveal'), { visible: true });
  await page.keyboard.press('Space');
  await page.waitForSelector(byTestId('rate-1'), { visible: true });
  await page.keyboard.press('1');
  await waitText('復原上一張');
  step('複習：翻面、四個評分的下次間隔、鍵盤快捷鍵、復原');

  await click('tab-today');
  await click('clear-demo');
  await waitText('你的日文程度？');
  await shot('12-onboarding');
  await click('level-kana');
  await click('onboarding-next');
  await waitText('為什麼想學日文？');
  await click('goal-travel');
  await click('onboarding-next');
  await waitText('平常喜歡什麼？');
  await click('interest-food');
  await click('onboarding-next');
  await waitText('從你的日常開始學日文');
  await waitText('加入新手包：基本會話、旅行、吃飯、便利商店');
  await shot('06-today-empty');
  step('清空示範資料 → 首次設定（程度、目的、興趣）→ 新手包依目的挑選');

  await click('starter-pack');
  await waitText('張待複習');
  await click('tab-review');
  await page.waitForSelector(byTestId('romaji'), { visible: true });
  await shot('13-review-romaji');
  await click('tab-today');
  step('「會五十音」程度：複習卡一開始就有讀音與羅馬拼音');

  await click('fill-example');
  await click('suggest');
  await waitText('為你挑的', 8000);
  await shot('07-today-suggestions');
  await click('add-suggestions');
  await waitText('已加入');
  step('新手包＋離線示範模式：從範例日記挑出卡片並加入');

  await click('tab-ask');
  await clickText('「は」和「が」差在哪？');
  await waitText('主題', 8000);
  await click('extract-cards');
  await page.waitForSelector(byTestId('add-suggestions'), { visible: true });
  await shot('08-ask');
  await click('add-suggestions');
  await waitText('已加入');
  step('問 AI：常見問題回答並整理成卡片');

  await click('tab-library');
  await click('add-card');
  await page.type(byTestId('edit-ja'), '{日本語|にほんご}');
  await page.type(byTestId('edit-meaning'), '日文');
  await click('save-card');
  await waitText('已新增');
  await new Promise((r) => setTimeout(r, 400));
  step('手動新增卡片');

  await click('tab-today');
  await clickText('設定');
  await waitText('目標記憶率');
  await shot('09-settings');
  await click('level-N4');
  await clickText('完成');
  await page.waitForFunction(() => !document.body.innerText.includes('目標記憶率'));
  await click('tab-review');
  await page.waitForSelector(byTestId('reveal'), { visible: true });
  const romajiShown = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="romaji"]')].some((e) => e.offsetParent !== null),
  );
  if (romajiShown) throw new Error('改成 N4 之後不應該再顯示羅馬拼音');
  await click('tab-today');
  step('設定頁：改程度後羅馬拼音隨之關閉');

  await page.reload();
  await waitText('張待複習');
  const state = await page.evaluate(() => ({
    keys: Object.keys(localStorage).filter((k) => k.startsWith('hibi:')).length,
    demo: document.body.innerText.includes('這是示範資料'),
  }));
  if (state.keys < 3) throw new Error('重新整理後資料沒有保存');
  if (state.demo) throw new Error('清空後不應該再產生示範資料');
  step('重新整理後資料仍在，且不會重新產生示範資料');

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.reload();
  await waitText('張待複習');
  await shot('10-today-dark');
  await click('tab-review');
  await click('reveal');
  await page.waitForSelector(byTestId('rate-3'), { visible: true });
  await shot('11-review-dark');
  step('深色模式');
} finally {
  await browser.close();
}

const real = errors.filter((e) => !/favicon|ERR_FAILED|net::/i.test(e));
if (real.length) {
  console.error('\n頁面錯誤：\n' + real.join('\n'));
  process.exit(1);
}
console.log(`\n全部通過（${steps.length} 個步驟），截圖在 docs/screenshots/`);
