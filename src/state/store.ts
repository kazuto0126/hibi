/**
 * App 狀態。
 *
 * 沒有用 Redux / Zustand：狀態不大，用 React 內建的 useSyncExternalStore 加一個
 * 模組層級的變數就夠了。每個動作（action）做三件事：算出新狀態 → 通知畫面 → 寫進儲存。
 * 畫面先更新、儲存在背景完成，所以按下按鈕不會卡頓。
 */
import { useSyncExternalStore } from 'react';
import { createDemoProvider } from '../core/ai/demo';
import { createClaudeProvider, type SampleFn } from '../core/ai/claude';
import { createGeminiProvider } from '../core/ai/gemini';
import type { AiProvider } from '../core/ai/provider';
import { STARTER } from '../core/data/starter';
import { DEMO_PROFILE, starterTagsFor } from '../core/profile';
import { createCard, filterNew, knownKeys } from '../core/deck';
import { FSRS6_DEFAULT_W } from '../core/fsrs';
import {
  exportBackup as toBackup,
  loadData,
  parseBackup,
  replaceAll,
  saveCards,
  saveLogs,
  saveSettings,
  type AppData,
} from '../core/repo';
import { makeConfig, newSrs, review, type SchedulerConfig } from '../core/scheduler';
import type { Card, CardSource, Rating, ReviewLog, Settings, SuggestedItem } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { Platform } from 'react-native';
import { simulateHistory } from '../core/sim';
import { detectClaudeSample } from '../platform/claude';
import { kv } from '../platform/kv';

export interface AppState extends AppData {
  ready: boolean;
  storageDegraded: boolean;
  claudeAvailable: boolean;
  /** 上一次評分前的卡片狀態，用來「復原」 */
  undo: { card: Card; logAt: number } | null;
  toast: { id: number; text: string } | null;
}

let state: AppState = {
  ready: false,
  settings: DEFAULT_SETTINGS,
  cards: [],
  logs: [],
  storageDegraded: false,
  claudeAvailable: false,
  undo: null,
  toast: null,
};

const listeners = new Set<() => void>();
let claudeSample: SampleFn | null = null;

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch, storageDegraded: kv.degraded };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useApp(): AppState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export const getState = () => state;

/** 背景寫入；失敗時（例如容量滿了）提示使用者，但不中斷操作 */
function persist(task: Promise<unknown>) {
  task.catch(() => toast('儲存失敗：裝置空間可能不足，最近的變更在關閉 App 後可能會遺失。'));
}

let toastSeq = 0;
export function toast(text: string) {
  set({ toast: { id: ++toastSeq, text } });
}

export function schedulerConfig(settings: Settings = state.settings): SchedulerConfig {
  return makeConfig({
    w: FSRS6_DEFAULT_W,
    desiredRetention: settings.desiredRetention,
  });
}

/** 網頁 Demo 第一次打開：放入「模擬使用三週」的示範資料（見 core/sim.ts） */
function demoData(settings: Settings): AppData {
  const tags = ['kihon', 'gakko', 'shokuji', 'konbini', 'tomodachi'];
  const items = STARTER.filter((it) => it.tags?.some((t) => tags.includes(t))).slice(0, 40);
  const { cards, logs } = simulateHistory(items, Date.now(), schedulerConfig(settings));
  return {
    settings: { ...settings, profile: DEMO_PROFILE, demoData: true, seenDemo: true },
    cards,
    logs,
  };
}

export async function init() {
  if (state.ready) return;
  let data = await loadData(kv);
  if (Platform.OS === 'web' && data.cards.length === 0 && data.logs.length === 0 && !data.settings.seenDemo) {
    data = demoData(data.settings);
    persist(replaceAll(kv, data));
  }
  set({ ...data, ready: true });
  // claude.ai 的能力會晚一點才回應，不阻塞啟動
  detectClaudeSample().then((sample) => {
    claudeSample = sample;
    if (sample) set({ claudeAvailable: true });
  });
}

// ── AI ──────────────────────────────────────

const demo = createDemoProvider();

export function currentProvider(settings: Settings = state.settings): AiProvider {
  const pref = settings.aiProvider;
  const gemini = () =>
    createGeminiProvider({
      apiKey: settings.geminiApiKey.trim(),
      model: settings.geminiModel,
    });
  if (pref === 'demo') return demo;
  if (pref === 'claude') return claudeSample ? createClaudeProvider(claudeSample) : demo;
  if (pref === 'gemini') return settings.geminiApiKey.trim() ? gemini() : demo;
  if (claudeSample) return createClaudeProvider(claudeSample);
  if (settings.geminiApiKey.trim()) return gemini();
  return demo;
}

// ── 卡片 ────────────────────────────────────

/** 加入卡片（自動去重），回傳實際加入幾張 */
export function addItems(items: SuggestedItem[], source: CardSource): number {
  const now = Date.now();
  const fresh = filterNew(items, knownKeys(state.cards));
  if (fresh.length === 0) return 0;
  const cards = [...state.cards, ...fresh.map((it, i) => createCard(it, source, now + i))];
  set({ cards });
  persist(saveCards(kv, cards));
  return fresh.length;
}

/** 新手包：基本會話＋依學習目的挑的情境（例如目的是旅遊 → 旅行、吃飯、便利商店） */
export function addStarterPack(): number {
  const tags = starterTagsFor(state.settings.profile) as string[];
  const items = STARTER.filter((it) => it.tags?.some((t) => tags.includes(t)));
  return addItems(items, 'starter');
}

export function answer(cardId: string, rating: Rating) {
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) return;
  const now = Date.now();
  const out = review(card.srs, rating, now, schedulerConfig(), card.id);
  const updated: Card = { ...card, srs: out.srs };
  const log: ReviewLog = { cardId, ...out.log };
  const cards = state.cards.map((c) => (c.id === cardId ? updated : c));
  const logs = [...state.logs, log];
  set({ cards, logs, undo: { card, logAt: log.at } });
  persist(Promise.all([saveCards(kv, cards), saveLogs(kv, logs, [log])]));
}

/** 復原上一次評分：卡片狀態退回、刪掉那一筆紀錄 */
export function undoLast(): Card | null {
  const u = state.undo;
  if (!u) return null;
  const removed = state.logs.filter((l) => l.at === u.logAt && l.cardId === u.card.id);
  const cards = state.cards.map((c) => (c.id === u.card.id ? u.card : c));
  const logs = state.logs.filter((l) => !(l.at === u.logAt && l.cardId === u.card.id));
  set({ cards, logs, undo: null });
  persist(Promise.all([saveCards(kv, cards), saveLogs(kv, logs, removed)]));
  return u.card;
}

export function updateCard(
  id: string,
  patch: Partial<Pick<Card, 'ja' | 'meaning' | 'example' | 'note' | 'kind'>>,
) {
  const cards = state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
  set({ cards });
  persist(saveCards(kv, cards));
}

export function deleteCard(id: string) {
  const cards = state.cards.filter((c) => c.id !== id);
  set({ cards, undo: state.undo?.card.id === id ? null : state.undo });
  persist(saveCards(kv, cards));
}

export function resetCard(id: string) {
  const cards = state.cards.map((c) => (c.id === id ? { ...c, srs: newSrs(Date.now()) } : c));
  set({ cards });
  persist(saveCards(kv, cards));
}

// ── 設定與資料 ──────────────────────────────

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  set({ settings });
  persist(saveSettings(kv, settings));
}

export function exportBackup(): string {
  return toBackup(state);
}

export async function importBackup(json: string): Promise<number> {
  const data = parseBackup(json, state.settings);
  await replaceAll(kv, data);
  set({ ...data, undo: null });
  return data.cards.length;
}

export async function resetAll() {
  const data: AppData = {
    settings: {
      ...DEFAULT_SETTINGS,
      geminiApiKey: state.settings.geminiApiKey,
      seenDemo: true,
    },
    cards: [],
    logs: [],
  };
  await replaceAll(kv, data);
  set({ ...data, undo: null });
}
