import { defineConfig } from 'vitest/config';

// 測試一律在台北時區執行，讓「學習日以凌晨 4 點分界」的測試結果固定（Windows / macOS / Linux 都一樣）
process.env.TZ = 'Asia/Taipei';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
