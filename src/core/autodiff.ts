/**
 * 前向模式自動微分（forward-mode automatic differentiation）。
 *
 * 訓練 FSRS 參數時，需要知道「每個參數動一點點，預測誤差會怎麼變」，也就是誤差對 21 個參數的梯度。
 * 最直覺的做法是每個參數各加減一點點、重算兩次（有限差分），但那要重播全部紀錄 42 次，太慢。
 *
 * 這裡的做法是：每個數字都同時帶著「它對 21 個參數的偏微分」一起算。
 * 例如 x = w8，它的偏微分是 [0,…,1（第 8 格）,…,0]；
 * 算 y = e^x 的時候，依照微分規則 dy = e^x · dx，同時把 21 格偏微分算好。
 * 公式算完，答案旁邊就是精確的梯度，只要重播一次紀錄。
 *
 * 這是深度學習框架（PyTorch 等）自動微分的簡化版：它們用反向模式，這裡用比較好懂的前向模式。
 */

export const N_PARAMS = 21;

/** 偏微分用一般陣列存：每一步都要建立很多個長度 21 的小陣列，一般陣列配置得比 Float64Array 快 */
export type Grad = number[];

/** 常數的偏微分全是 0；共用同一個陣列，不會被修改 */
const ZERO: Grad = Object.freeze(new Array<number>(N_PARAMS).fill(0)) as Grad;

function zeros(): Grad {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

/** 一個數值 v，加上它對每個參數的偏微分 d */
export class Dual {
  constructor(
    readonly v: number,
    readonly d: Grad = ZERO,
  ) {}

  get isConstant(): boolean {
    return this.d === ZERO;
  }
}

export function constant(v: number): Dual {
  return new Dual(v);
}

/** 第 i 個參數本身：偏微分只有第 i 格是 1 */
export function variable(v: number, i: number): Dual {
  const d = zeros();
  d[i] = 1;
  return new Dual(v, d);
}

/** 結果的偏微分 = ca · a.d + cb · b.d（所有運算最後都歸結成這個形式，即連鎖律） */
function linear(v: number, a: Dual, ca: number, b?: Dual, cb = 0): Dual {
  const aConst = a.isConstant || ca === 0;
  const bConst = !b || b.isConstant || cb === 0;
  if (aConst && bConst) return new Dual(v);
  const d = zeros();
  if (!aConst) {
    const ad = a.d;
    for (let i = 0; i < N_PARAMS; i++) d[i] = ca * ad[i];
  }
  if (!bConst) {
    const bd = b!.d;
    for (let i = 0; i < N_PARAMS; i++) d[i] += cb * bd[i];
  }
  return new Dual(v, d);
}

export const add = (a: Dual, b: Dual) => linear(a.v + b.v, a, 1, b, 1);
export const sub = (a: Dual, b: Dual) => linear(a.v - b.v, a, 1, b, -1);
export const mul = (a: Dual, b: Dual) => linear(a.v * b.v, a, b.v, b, a.v);
export function div(a: Dual, b: Dual): Dual {
  const v = a.v / b.v;
  return linear(v, a, 1 / b.v, b, -v / b.v);
}
export const addc = (a: Dual, c: number) => linear(a.v + c, a, 1);
export const mulc = (a: Dual, c: number) => linear(a.v * c, a, c);

export function exp(a: Dual): Dual {
  const v = Math.exp(a.v);
  return linear(v, a, v);
}

export function log(a: Dual): Dual {
  return linear(Math.log(a.v), a, 1 / a.v);
}

/** a^b，a > 0，a、b 都可以帶偏微分：d(a^b) = a^b · (ln a · db + b/a · da) */
export function pow(a: Dual, b: Dual): Dual {
  const v = Math.pow(a.v, b.v);
  return linear(v, a, (v * b.v) / a.v, b, v * Math.log(a.v));
}

/** 夾在 [lo, hi] 之間；被夾住時是常數，偏微分為 0（和 PyTorch 的 clamp 一樣） */
export function clamp(a: Dual, lo: number, hi: number): Dual {
  if (a.v < lo) return constant(lo);
  if (a.v > hi) return constant(hi);
  return a;
}

export function min(a: Dual, b: Dual): Dual {
  return a.v <= b.v ? a : b;
}

export function max(a: Dual, b: Dual): Dual {
  return a.v >= b.v ? a : b;
}
