/**
 * FSRS 參數個人化實驗：用了多久的 App，訓練自己的參數才會比預設參數準？
 *
 * 執行：npm run experiment（約 10～15 分鐘）
 * 若有安裝 fsrs-rs-python（pip install fsrs-rs-python），會同時跑官方訓練程式對照；沒有的話會略過。
 *
 * 步驟：
 *   1. 產生虛擬學習者：3 個代表性的人（平均型、忘得快、忘得慢）＋ 30 個隨機抽樣的人
 *   2. 每個人模擬用 Hibi 學 210 天（每天 10 張新卡，App 一律用預設參數排程）
 *   3. 只用前 k 天（k = 14、30、60、90、180）的紀錄訓練，再看接下來 30 天的預測準不準
 *   4. 比較四組參數：預設、我們訓練的、官方 fsrs-rs 訓練的、真正的（理論上最好）
 *
 * 輸出：docs/experiment/results.json、calibration.svg、learning-curve.svg
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  auc,
  calibrationCurve,
  calibrationRmse,
  logLoss,
  type CalibrationBin,
} from '../src/core/calibration';
import { FSRS6_DEFAULT_W } from '../src/core/fsrs';
import { PERSONAS, randomLearner, simulateLearner, type VirtualLearner } from '../src/core/learner';
import { fromLogs, predict, train, type ReviewData } from '../src/core/optimize';
import { makeConfig } from '../src/core/scheduler';
import { DAY, HOUR } from '../src/core/time';

/** --quick：只跑 3 個隨機學習者、兩種訓練天數，用來確認程式能跑（結果不寫進報告） */
const QUICK = process.argv.includes('--quick');

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = QUICK
  ? path.join(ROOT, 'scripts', 'tmp', 'experiment-quick')
  : path.join(ROOT, 'docs', 'experiment');
const TMP = path.join(ROOT, 'scripts', 'tmp');

const CONFIG = {
  start: Date.UTC(2026, 0, 5, 4), // 2026-01-05 台北中午；只影響日期，不影響結果
  totalDays: 210,
  newPerDay: 10,
  trainDays: QUICK ? [30, 90] : [14, 30, 60, 90, 180],
  testDays: 30,
  randomLearners: QUICK ? 3 : 30,
  steps: 100,
  gamma: 1,
  seed: 'hibi-experiment-v1',
  /** 畫校準曲線時，資料少於這個數量的組不畫（點太少，誤差太大） */
  minBin: 20,
};

const cfg = makeConfig({ w: FSRS6_DEFAULT_W, tz: () => 8 * HOUR });

type ModelName = 'default' | 'ours' | 'fsrsRs' | 'truth';
const MODEL_LABEL: Record<ModelName, string> = {
  default: '預設參數',
  ours: 'Hibi 訓練',
  fsrsRs: 'fsrs-rs 訓練（官方）',
  truth: '真正的參數',
};

interface Metrics {
  logLoss: number;
  calibrationRmse: number;
  auc: number;
}

interface Run {
  learner: string;
  group: 'persona' | 'random';
  trainDays: number;
  nTrain: number;
  nTest: number;
  params: Partial<Record<ModelName, number[]>>;
  metrics: Partial<Record<ModelName, Metrics>>;
  /** fsrs-rs 的 evaluate（依時間加權）和我們用同樣權重算的 log loss，差多少 */
  officialCheck?: number;
}

function metricsOf(w: readonly number[], data: ReviewData, from: number, to: number): Metrics {
  const o = predict(w, data, { from, to });
  return { logLoss: logLoss(o), calibrationRmse: calibrationRmse(o), auc: auc(o) };
}

/** fsrs-rs evaluate 的加權方式：依時間排序後，第 i 筆權重 0.25 + 0.75·(i/(n−1))³ */
function recencyWeightedLogLoss(w: readonly number[], data: ReviewData, from: number, to: number): number {
  const o = predict(w, data, { from, to });
  const idx = o.at.map((_, i) => i).sort((a, b) => o.at[a] - o.at[b]);
  const n = idx.length;
  let s = 0;
  let ws = 0;
  idx.forEach((k, i) => {
    const wt = 0.25 + 0.75 * Math.pow(n > 1 ? i / (n - 1) : 1, 3);
    s += wt * logLoss({ p: [o.p[k]], y: [o.y[k]] });
    ws += wt;
  });
  return s / ws;
}

function cardsForPython(data: ReviewData): number[][][] {
  const cards: number[][][] = [];
  for (let c = 0; c < data.cardStart.length - 1; c++) {
    const r: number[][] = [];
    for (let j = data.cardStart[c]; j < data.cardStart[c + 1]; j++)
      r.push([data.rating[j], data.elapsed[j], data.at[j]]);
    cards.push(r);
  }
  return cards;
}

function hasFsrsRs(): boolean {
  try {
    execFileSync('python3', ['-I', '-c', 'import fsrs_rs_python'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ── 統計 ─────────────────────────────────────────────────

/** 平均與 95% 信賴區間（t 分布） */
function meanCi(xs: number[]): { mean: number; lo: number; hi: number; n: number } {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  // 自由度 29 的 t 值；n 不是 30 時用近似值
  const t = n === 30 ? 2.045 : 1.96 + 2.4 / n;
  const half = (t * sd) / Math.sqrt(n);
  return { mean, lo: mean - half, hi: mean + half, n };
}

// ── 圖 ──────────────────────────────────────────────────

const C = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  text2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  /** 每個模型固定一個顏色，兩張圖一致：預設＝藍、Hibi 訓練＝橘、真正的參數＝綠、fsrs-rs＝紫 */
  model: { default: '#2a78d6', ours: '#eb6834', truth: '#1baf7a', fsrsRs: '#6250d6' } as Record<
    string,
    string
  >,
};
const FONT = `font-family="'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f2 = (x: number) => (Math.round(x * 100) / 100).toString();

function text(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; fill?: string; anchor?: string; weight?: number } = {},
) {
  return `<text x="${x}" y="${y}" ${FONT} font-size="${opts.size ?? 12}" fill="${opts.fill ?? C.text2}" text-anchor="${opts.anchor ?? 'start'}"${opts.weight ? ` font-weight="${opts.weight}"` : ''}>${esc(s)}</text>`;
}

function legend(x: number, y: number, items: { label: string; color: string }[]): string {
  let out = '';
  let cx = x;
  for (const it of items) {
    out += `<line x1="${cx}" y1="${y - 4}" x2="${cx + 16}" y2="${y - 4}" stroke="${it.color}" stroke-width="2" stroke-linecap="round"/>`;
    out += `<circle cx="${cx + 8}" cy="${y - 4}" r="4" fill="${it.color}" stroke="${C.surface}" stroke-width="2"/>`;
    out += text(cx + 22, y, it.label, { fill: C.text2 });
    // 估計文字寬度：中日文字約 12px，英數約 7px
    const width = [...it.label].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 12 : 7), 0);
    cx += 22 + width + 28;
  }
  return out;
}

/** 校準曲線（兩個並排的小圖，共用同一個座標範圍） */
function calibrationSvg(
  panels: { title: string; curves: { model: ModelName; bins: CalibrationBin[] }[] }[],
): string {
  const W = 800;
  const H = 430;
  const pw = 300;
  const ph = 260;
  const top = 108;
  const lo = 0.5;
  const sx = (v: number, x0: number) => x0 + ((v - lo) / (1 - lo)) * pw;
  const sy = (v: number) => top + ph - ((Math.max(v, lo) - lo) / (1 - lo)) * ph;
  const colorOf = C.model;
  let body = '';
  body += text(24, 30, '校準曲線：模型說會記得幾成，實際記得幾成（訓練 90 天、看之後 30 天）', {
    size: 15,
    fill: C.text,
    weight: 600,
  });
  body += legend(
    24,
    56,
    (['default', 'ours', 'truth'] as ModelName[]).map((m) => ({ label: MODEL_LABEL[m], color: colorOf[m] })),
  );
  panels.forEach((panel, pi) => {
    const x0 = 70 + pi * (pw + 80);
    for (const g of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      body += `<line x1="${x0}" y1="${sy(g)}" x2="${x0 + pw}" y2="${sy(g)}" stroke="${C.grid}" stroke-width="1"/>`;
      body += text(x0 - 8, sy(g) + 4, `${Math.round(g * 100)}%`, { size: 11, fill: C.muted, anchor: 'end' });
      body += text(sx(g, x0), top + ph + 18, `${Math.round(g * 100)}%`, {
        size: 11,
        fill: C.muted,
        anchor: 'middle',
      });
    }
    // 完美校準的對角線
    body += `<line x1="${sx(lo, x0)}" y1="${sy(lo)}" x2="${sx(1, x0)}" y2="${sy(1)}" stroke="${C.axis}" stroke-width="1"/>`;
    body += text(sx(0.97, x0), sy(0.985) - 4, '完美校準', { size: 11, fill: C.muted, anchor: 'end' });
    body += text(x0, top - 10, panel.title, { size: 13, fill: C.text, weight: 600 });
    for (const { model, bins } of panel.curves) {
      const pts = bins.filter((b) => b.n >= CONFIG.minBin);
      const color = colorOf[model];
      body += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((b) => `${sx(b.predicted, x0).toFixed(1)},${sy(b.actual).toFixed(1)}`).join(' ')}"/>`;
      for (const b of pts) {
        body += `<circle cx="${sx(b.predicted, x0).toFixed(1)}" cy="${sy(b.actual).toFixed(1)}" r="4" fill="${color}" stroke="${C.surface}" stroke-width="2"><title>${MODEL_LABEL[model]}：預測 ${f2(b.predicted * 100)}%，實際 ${f2(b.actual * 100)}%（${b.n} 次複習）</title></circle>`;
      }
    }
    body += text(x0 + pw / 2, top + ph + 38, '模型預測的記得機率', { size: 12, anchor: 'middle' });
  });
  body += `<text transform="translate(18 ${top + ph / 2}) rotate(-90)" ${FONT} font-size="12" fill="${C.text2}" text-anchor="middle">實際記得的比例</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="校準曲線"><rect width="${W}" height="${H}" fill="${C.surface}"/>${body}</svg>\n`;
}

/** 學習曲線：資料越多，個人化參數比預設參數改善多少（30 個隨機學習者的平均與 95% 信賴區間） */
function learningCurveSvg(
  series: { model: ModelName; points: { days: number; mean: number; lo: number; hi: number }[] }[],
): string {
  const W = 760;
  const H = 400;
  const left = 80;
  const top = 78;
  const pw = 600;
  const ph = 250;
  const days = CONFIG.trainDays;
  const all = series.flatMap((s) => s.points.flatMap((p) => [p.lo, p.hi]));
  const step = 0.005;
  const yMin = Math.min(0, Math.floor(Math.min(...all) / step) * step);
  const yMax = Math.ceil(Math.max(...all) / step) * step;
  const sx = (i: number) => left + 30 + (i / (days.length - 1)) * (pw - 60);
  const sy = (v: number) => top + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const labels: Record<number, string> = {
    14: '2 週',
    30: '1 個月',
    60: '2 個月',
    90: '3 個月',
    180: '6 個月',
  };
  const colorOf = C.model;
  let body = '';
  body += text(
    24,
    30,
    '用了多久之後訓練，預測會比預設參數準？（30 個虛擬學習者，之後 30 天的 log loss 改善量）',
    { size: 15, fill: C.text, weight: 600 },
  );
  body += legend(
    24,
    56,
    series.map((s) => ({ label: MODEL_LABEL[s.model], color: colorOf[s.model] })),
  );
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const y = sy(v);
    const isZero = Math.abs(v) < 1e-9;
    body += `<line x1="${left}" y1="${y}" x2="${left + pw}" y2="${y}" stroke="${isZero ? C.axis : C.grid}" stroke-width="1"/>`;
    body += text(left - 8, y + 4, v.toFixed(3), { size: 11, fill: C.muted, anchor: 'end' });
  }
  body += text(left + pw, sy(0) - 6, '0 ＝ 和預設參數一樣準', { size: 11, fill: C.muted, anchor: 'end' });
  days.forEach((d, i) => {
    body += text(sx(i), top + ph + 18, labels[d] ?? `${d} 天`, { size: 11, fill: C.muted, anchor: 'middle' });
  });
  body += text(left + pw / 2, top + ph + 40, '訓練時用了幾天的複習紀錄', { size: 12, anchor: 'middle' });
  body += `<text transform="translate(20 ${top + ph / 2}) rotate(-90)" ${FONT} font-size="12" fill="${C.text2}" text-anchor="middle">log loss 改善量（越高越好）</text>`;
  series.forEach((s, si) => {
    const color = colorOf[s.model];
    const off = (si - (series.length - 1) / 2) * 7; // 誤差線稍微錯開，避免重疊
    for (const [i, p] of s.points.entries()) {
      body += `<line x1="${sx(i) + off}" y1="${sy(p.lo)}" x2="${sx(i) + off}" y2="${sy(p.hi)}" stroke="${color}" stroke-width="1.5" opacity="0.6"/>`;
    }
    body += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.points.map((p, i) => `${(sx(i) + off).toFixed(1)},${sy(p.mean).toFixed(1)}`).join(' ')}"/>`;
    for (const [i, p] of s.points.entries()) {
      body += `<circle cx="${(sx(i) + off).toFixed(1)}" cy="${sy(p.mean).toFixed(1)}" r="4" fill="${color}" stroke="${C.surface}" stroke-width="2"><title>${MODEL_LABEL[s.model]}，${labels[days[i]]}：平均改善 ${p.mean.toFixed(4)}（95% 信賴區間 ${p.lo.toFixed(4)} ~ ${p.hi.toFixed(4)}）</title></circle>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="學習曲線"><rect width="${W}" height="${H}" fill="${C.surface}"/>${body}</svg>\n`;
}

// ── 主程式 ───────────────────────────────────────────────

function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  const t0 = Date.now();
  const learners: { L: VirtualLearner; group: Run['group'] }[] = [
    ...PERSONAS.map((L) => ({ L, group: 'persona' as const })),
    ...Array.from({ length: CONFIG.randomLearners }, (_, i) => ({
      L: { ...randomLearner(`${CONFIG.seed}:${i + 1}`), name: `隨機${i + 1}` },
      group: 'random' as const,
    })),
  ];

  const runs: Run[] = [];
  const datasets = new Map<string, ReviewData>();
  const calibrationPanels: Parameters<typeof calibrationSvg>[0] = [];
  const job: { runs: unknown[] } = { runs: [] };

  for (const { L, group } of learners) {
    const logs = simulateLearner(L, {
      cfg,
      start: CONFIG.start,
      days: CONFIG.totalDays,
      newPerDay: CONFIG.newPerDay,
      seed: CONFIG.seed,
    });
    const data = fromLogs(logs);
    datasets.set(L.name, data);
    const cards = cardsForPython(data);
    for (const k of CONFIG.trainDays) {
      const cutoff = CONFIG.start + k * DAY;
      const testEnd = cutoff + CONFIG.testDays * DAY;
      const trained = train(data, { to: cutoff }, { steps: CONFIG.steps, gamma: CONFIG.gamma });
      const params = { default: [...FSRS6_DEFAULT_W], ours: trained.w, truth: L.w };
      const run: Run = {
        learner: L.name,
        group,
        trainDays: k,
        nTrain: trained.n,
        nTest: predict(FSRS6_DEFAULT_W, data, { from: cutoff, to: testEnd }).p.length,
        params,
        metrics: {
          default: metricsOf(params.default, data, cutoff, testEnd),
          ours: metricsOf(params.ours, data, cutoff, testEnd),
          truth: metricsOf(params.truth, data, cutoff, testEnd),
        },
      };
      runs.push(run);
      job.runs.push({ name: `${L.name}|${k}`, cards, cutoff, test_end: testEnd, params });
      if (group === 'persona' && k === 90 && L.name !== '平均型') {
        calibrationPanels.push({
          title: `「${L.name}」的學習者`,
          curves: (['default', 'ours', 'truth'] as ModelName[]).map((m) => ({
            model: m,
            bins: calibrationCurve(
              predict(params[m as keyof typeof params], data, { from: cutoff, to: testEnd }),
            ),
          })),
        });
      }
    }
    console.log(`${L.name}：完成（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  }

  // 官方 fsrs-rs 對照
  let officialCheckMax: number | null = null;
  if (hasFsrsRs()) {
    console.log('執行 fsrs-rs 對照……');
    const jobPath = path.join(TMP, 'fsrs-rs-job.json');
    const outPath = path.join(TMP, 'fsrs-rs-out.json');
    writeFileSync(jobPath, JSON.stringify(job));
    execFileSync('python3', ['-I', path.join(ROOT, 'scripts', 'fsrs_rs_reference.py'), jobPath, outPath], {
      stdio: 'inherit',
    });
    const res = JSON.parse(readFileSync(outPath, 'utf8')) as {
      runs: Record<
        string,
        {
          fsrs_rs_params: number[];
          n_train: number;
          n_test: number;
          eval: Record<string, { log_loss: number }>;
        }
      >;
    };
    officialCheckMax = 0;
    for (const run of runs) {
      const r = res.runs[`${run.learner}|${run.trainDays}`];
      const data = datasets.get(run.learner)!;
      const cutoff = CONFIG.start + run.trainDays * DAY;
      const testEnd = cutoff + CONFIG.testDays * DAY;
      run.params.fsrsRs = r.fsrs_rs_params;
      run.metrics.fsrsRs = metricsOf(r.fsrs_rs_params, data, cutoff, testEnd);
      // 檢查：同一組參數、同樣的加權方式，我們算的 log loss 要和 fsrs-rs 的 evaluate 一樣
      if (r.n_train !== run.nTrain || r.n_test !== run.nTest) {
        throw new Error(`${run.learner} ${run.trainDays} 天：資料筆數和 fsrs-rs 不一致`);
      }
      const diffs = (['default', 'ours', 'truth'] as const).map((m) =>
        Math.abs(recencyWeightedLogLoss(run.params[m]!, data, cutoff, testEnd) - r.eval[m].log_loss),
      );
      run.officialCheck = Math.max(...diffs);
      officialCheckMax = Math.max(officialCheckMax, run.officialCheck);
    }
    console.log(`和 fsrs-rs evaluate 的 log loss 最大差異：${officialCheckMax.toExponential(2)}`);
  } else {
    console.log('沒有安裝 fsrs-rs-python，略過官方對照（pip install fsrs-rs-python）');
  }

  // 彙整：30 個隨機學習者，每個 k 的改善量
  const models: ModelName[] = officialCheckMax === null ? ['ours', 'truth'] : ['ours', 'fsrsRs', 'truth'];
  const summary = CONFIG.trainDays.map((k) => {
    const rs = runs.filter((r) => r.group === 'random' && r.trainDays === k);
    const improvement = Object.fromEntries(
      models.map((m) => {
        const xs = rs.map((r) => r.metrics.default!.logLoss - r.metrics[m]!.logLoss);
        return [m, { ...meanCi(xs), improvedShare: xs.filter((x) => x > 0).length / xs.length }];
      }),
    );
    const mean = (f: (r: Run) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    return {
      trainDays: k,
      meanTrainReviews: mean((r) => r.nTrain),
      meanTestReviews: mean((r) => r.nTest),
      improvement,
      oursMinusFsrsRs:
        officialCheckMax === null
          ? null
          : meanCi(rs.map((r) => r.metrics.ours!.logLoss - r.metrics.fsrsRs!.logLoss)),
      calibrationRmse: Object.fromEntries(
        (['default', ...models] as ModelName[]).map((m) => [m, mean((r) => r.metrics[m]!.calibrationRmse)]),
      ),
      auc: Object.fromEntries(
        (['default', ...models] as ModelName[]).map((m) => [m, mean((r) => r.metrics[m]!.auc)]),
      ),
    };
  });

  const personas = runs
    .filter((r) => r.group === 'persona')
    .map(({ learner, trainDays, nTrain, nTest, metrics }) => ({
      learner,
      trainDays,
      nTrain,
      nTest,
      metrics,
    }));

  writeFileSync(
    path.join(OUT, 'results.json'),
    JSON.stringify(
      {
        config: CONFIG,
        officialCheckMax,
        summary,
        personas,
        personaParams: PERSONAS.map((p) => ({ name: p.name, w: p.w })),
        runs: runs.map(({ params: _p, ...r }) => r),
      },
      null,
      1,
    ),
  );
  writeFileSync(path.join(OUT, 'calibration.svg'), calibrationSvg(calibrationPanels));
  writeFileSync(
    path.join(OUT, 'learning-curve.svg'),
    learningCurveSvg(
      (['truth', ...models.filter((m) => m !== 'truth')] as ModelName[]).map((m) => ({
        model: m,
        points: summary.map((s) => ({ days: s.trainDays, ...s.improvement[m] })),
      })),
    ),
  );

  // 摘要
  console.log(
    '\n訓練天數 | 訓練筆數 | 測試筆數 | ' +
      models.map((m) => `${MODEL_LABEL[m]}改善（改善的人數比例）`).join(' | '),
  );
  for (const s of summary) {
    console.log(
      `${s.trainDays} | ${s.meanTrainReviews.toFixed(0)} | ${s.meanTestReviews.toFixed(0)} | ` +
        models
          .map((m) => {
            const v = s.improvement[m];
            return `${v.mean.toFixed(4)} [${v.lo.toFixed(4)}, ${v.hi.toFixed(4)}] (${Math.round(v.improvedShare * 100)}%)`;
          })
          .join(' | '),
    );
  }
  console.log(`\n完成，共 ${((Date.now() - t0) / 1000).toFixed(0)} 秒。結果在 ${path.relative(ROOT, OUT)}/`);
}

main();
