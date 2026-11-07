/**
 * 偵測是否在 claude.ai 的網頁 Demo 裡執行。
 *
 * claude.ai 會在頁面上提供 window.claude.use()；要到 "sample" 能力就能請 Claude 回答，
 * 用的是正在看頁面的人自己的帳號。手機 App 和一般瀏覽器裡沒有這個物件，直接回傳 null。
 */
import { Platform } from 'react-native';
import type { SampleFn } from '../core/ai/claude';

/** 是不是在 claude.ai 的網頁 Demo 裡（同步判斷，不代表使用者已允許使用 Claude） */
export function isClaudeHost(): boolean {
  if (Platform.OS !== 'web') return false;
  const host = (globalThis as { claude?: { use?: unknown } }).claude;
  return !!host && typeof host.use === 'function';
}

export async function detectClaudeSample(): Promise<SampleFn | null> {
  if (Platform.OS !== 'web') return null;
  const host = (globalThis as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (!host || typeof host.use !== 'function') return null;
  try {
    const sample = await host.use('sample');
    return typeof sample === 'function' ? (sample as SampleFn) : null;
  } catch {
    return null;
  }
}
