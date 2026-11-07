# Hibi 日々 — 給 AI 程式助手（Claude Code、Codex 等）的專案說明

Expo SDK 58（React Native 0.88、React 19、TypeScript 6）的日文學習 App。介面語言是台灣繁體中文。

## 架構規則

- `src/core/`：**純 TypeScript**，不可以 import `react-native`、`expo-*` 或任何 React 東西。
  所有商業邏輯（FSRS、排程、去重、統計、AI 解析、儲存格式、學習者設定、羅馬拼音、參數訓練）都放這裡，用 Vitest 在 Node 上測試。
- `src/platform/`：包裝裝置能力（AsyncStorage、語音、字型、claude.ai 偵測）。需要分平台時用 `.web.ts` 後綴。
- `src/state/store.ts`：唯一的全域狀態，`useSyncExternalStore` + 模組變數。新增動作時照現有模式：算新狀態 → `set()` → `persist()`。
- `src/ui/`：畫面與元件。顏色、字型一律從 `useTheme()` 取，不要寫死色碼（評分按鈕的文字色除外）。
- **不使用 Expo Router 或任何會改網址的導覽**：網頁版要能打包成單一 HTML 發布在 claude.ai，那裡只允許 `#name` 形式的網址。分頁切換在 `App.tsx` 自己處理。

## 資料格式

- 日文讀音標註格式：`{漢字|かな}`，送假名放在括號外：`{食|た}べる`。解析在 `src/core/ruby.ts`。
- 卡片、紀錄的型別在 `src/core/types.ts`。改型別時要考慮使用者手機上已存在的舊資料：
  設定一律經過 `repo.ts` 的 `normalizeSettings()`（讀取與還原備份都會用到），新欄位在那裡補預設值、舊欄位在那裡轉換。
- 學習日以凌晨 4 點分界（`src/core/time.ts`）。

## 學習者設定與初學者模式

- `settings.profile`（`LearnerProfile`：程度、學習目的、興趣）。`null` 代表還沒做首次設定，`App.tsx` 會先顯示 `OnboardingScreen`
  （示範資料模式例外，會直接套用 `DEMO_PROFILE`）。
- 選項文字與 AI 提示詞用的描述都在 `src/core/profile.ts`，從舊專案 japanessapp 搬來；`supabase/migrations/` 的資料表限制值要跟它一致。
- `isBeginner(profile)`（零基礎、會五十音）為真時：卡片一開始就顯示讀音，並在日文下方顯示羅馬拼音（`src/core/romaji.ts`，平文式）。
  羅馬拼音用「分詞」判斷助詞 は／へ／を，規則寫在 `romaji.ts` 的註解；`romaji.test.ts` 會拿 kuromoji 的詞性結果逐句比對內建詞庫。

## 參數訓練（目前只用在實驗，App 還沒有入口）

- `optimize.ts`：從 `ReviewLog` 重播、可微分版本的 FSRS-6（公式必須和 `fsrs.ts` 一致，測試會比對）、Adam。
- `autodiff.ts`：前向模式自動微分；`calibration.ts`：log loss、校準曲線、AUC；`learner.ts`：虛擬學習者。
- `npm run experiment` 會重新產生 `docs/experiment/` 和報告裡的數字；改了上面任何一個檔案，記得重跑並更新 `docs/實驗報告.md`。
- 實驗腳本用 `tsx` 執行（開發用工具，不會進 App）。官方對照需要 `pip install fsrs-rs-python`，沒有會自動略過。

## 後端（還沒接）

`supabase/migrations/` 是舊專案完成的 profiles 資料表＋RLS，留給「雲端同步與伺服器端 AI」階段用，目前 App 沒有連 Supabase。
計畫見 `docs/產品規劃.md`。

## 指令

```bash
npm test            # Vitest：核心邏輯，含 FSRS 與 ts-fsrs 的對照測試、內建詞庫讀音檢查
npm run typecheck   # tsc --noEmit
npm run format      # Prettier
npm run demo:build  # 網頁版 → dist-demo/index.html（單一檔案）
npm run demo:smoke  # 無頭 Chrome 端對端測試＋截圖（Windows 要先設 CHROME_PATH）
npm run experiment  # 參數訓練實驗（約 2 分鐘）→ docs/experiment/
```

宣告完成前，至少跑過 `npm test` 和 `npm run typecheck`。

## 套件

- 新增套件請用 `npx expo install <套件>`，確保版本跟 SDK 58 相容。
- 只用 Expo Go 內建就有的原生模組（目前：async-storage、expo-speech、expo-haptics、expo-clipboard、expo-font、safe-area-context、react-native-svg），
  否則使用者沒辦法直接用 Expo Go 執行。
- `ts-fsrs` 鎖定 6.0.0，只當測試的參考答案用，不要在 App 程式碼裡 import。

## 內建詞庫

`src/core/data/starter.ts`。新增項目後 `npm test` 會用 kuromoji 檢查讀音和羅馬拼音；分析器讀錯而人工確認無誤的，
加到 `src/core/data/reviewed.ts` 的 `REVIEWED` 白名單並寫明理由。新手包要放哪些情境由 `profile.ts` 的 `starterTagsFor()` 依學習目的決定。
