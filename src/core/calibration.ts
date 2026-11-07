/**
 * 評估「記得機率」預測準不準的指標。
 *
 * 一個好的記憶模型要做到兩件事：
 *   1. 校準（calibration）：說「80% 會記得」的那些複習，實際上真的大約 80% 記得
 *   2. 鑑別（discrimination）：會忘的卡，預測值要比會記得的卡低
 * log loss 同時反映兩者；校準曲線和 RMSE 看第 1 點；AUC 看第 2 點。
 */

export interface Outcomes {
  /** 預測記得的機率 */
  p: readonly number[];
  /** 實際結果：1 記得、0 忘記 */
  y: readonly number[];
}

const EPS = 1e-7;

/**
 * 平均對數損失：−平均(y·ln p + (1−y)·ln(1−p))。越小越好。
 * 預測 99% 會記得卻忘了，懲罰非常重；預測 50% 不論結果都是 ln 2 ≈ 0.693。
 */
export function logLoss({ p, y }: Outcomes): number {
  if (p.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = Math.min(Math.max(p[i], EPS), 1 - EPS);
    s += -(y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q));
  }
  return s / p.length;
}

export interface CalibrationBin {
  /** 這一組預測值的範圍 [lo, hi) */
  lo: number;
  hi: number;
  n: number;
  /** 這一組的平均預測值 */
  predicted: number;
  /** 這一組實際記得的比例 */
  actual: number;
}

/**
 * 校準曲線：依預測值分成 bins 組（0~10%、10~20%……），每組比較平均預測和實際記得的比例。
 * 畫成圖時，點越靠近對角線，模型越準。沒有資料的組不會出現在結果裡。
 */
export function calibrationCurve({ p, y }: Outcomes, bins = 10): CalibrationBin[] {
  const n = new Array<number>(bins).fill(0);
  const sp = new Array<number>(bins).fill(0);
  const sy = new Array<number>(bins).fill(0);
  for (let i = 0; i < p.length; i++) {
    const b = Math.min(Math.floor(p[i] * bins), bins - 1);
    n[b] += 1;
    sp[b] += p[i];
    sy[b] += y[i];
  }
  const out: CalibrationBin[] = [];
  for (let b = 0; b < bins; b++) {
    if (n[b] === 0) continue;
    out.push({ lo: b / bins, hi: (b + 1) / bins, n: n[b], predicted: sp[b] / n[b], actual: sy[b] / n[b] });
  }
  return out;
}

/**
 * 校準誤差：各組「平均預測 − 實際比例」的均方根，依每組的資料量加權。越小越好。
 * 注意：這和官方 FSRS 評測用的 RMSE(bins) 分組方式不同（官方依間隔天數、複習次數、忘記次數分組），
 * 實驗報告裡兩者都會列出。
 */
export function calibrationRmse(o: Outcomes, bins = 10): number {
  const curve = calibrationCurve(o, bins);
  const total = curve.reduce((a, b) => a + b.n, 0);
  if (total === 0) return NaN;
  const se = curve.reduce((a, b) => a + b.n * (b.predicted - b.actual) ** 2, 0);
  return Math.sqrt(se / total);
}

/**
 * AUC：隨機挑一次「記得」和一次「忘記」的複習，模型給「記得」那次比較高預測值的機率。
 * 0.5 是亂猜，1 是完美。用排名計算（Mann–Whitney U），同分算一半。
 */
export function auc({ p, y }: Outcomes): number {
  const idx = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
  let pos = 0;
  let neg = 0;
  let rankSum = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && p[idx[j + 1]] === p[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (y[idx[k]] === 1) {
        pos++;
        rankSum += avgRank;
      } else neg++;
    }
    i = j + 1;
  }
  if (pos === 0 || neg === 0) return NaN;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}
