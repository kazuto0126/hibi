"""
用 FSRS 官方的訓練程式（fsrs-rs，Anki 內建的就是它）對照 Hibi 自己寫的訓練程式。

由 scripts/experiment.ts 呼叫，一般不用自己執行。需要先安裝：
    pip install fsrs-rs-python

輸入（JSON）：每次實驗的複習紀錄（依卡片分組）、訓練／測試的時間分界、要評估的幾組參數
輸出（JSON）：
  - fsrs-rs 用訓練集算出來的參數
  - 每組參數在測試集上的 log loss 與 RMSE(bins)，用 fsrs-rs 的 evaluate 計算。
    注意 fsrs-rs 的 evaluate 會依資料順序加權（越新的權重越高），
    experiment.ts 用它來確認「我們挑出來的測試資料、算出來的預測值」和官方完全一致。
"""

import json
import sys

from fsrs_rs_python import DEFAULT_PARAMETERS, FSRS, FSRSItem, FSRSReview


def build_items(cards, cutoff, test_end):
    """
    每一次「不是第一次、隔天以後」的複習，做成一個 FSRSItem（包含到這次為止的完整歷史）。
    時間早於 cutoff 的是訓練集，[cutoff, test_end) 的是測試集。
    依複習時間排序：fsrs-rs 會給越後面的資料越高的權重（recency weighting），順序要是時間順序才合理。
    """
    train, test = [], []
    for reviews in cards:
        history = []
        for j, (rating, elapsed, at) in enumerate(reviews):
            history.append(FSRSReview(rating, elapsed if j > 0 else 0))
            if j == 0 or elapsed <= 0:
                continue
            item = (at, FSRSItem(list(history)))
            if at < cutoff:
                train.append(item)
            elif at < test_end:
                test.append(item)
    train.sort(key=lambda x: x[0])
    test.sort(key=lambda x: x[0])
    return [x[1] for x in train], [x[1] for x in test]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        job = json.load(f)
    out = {"fsrs_rs_default_parameters": list(DEFAULT_PARAMETERS), "runs": {}}
    for learner in job["runs"]:
        train, test = build_items(learner["cards"], learner["cutoff"], learner["test_end"])
        fitted = FSRS(DEFAULT_PARAMETERS).compute_parameters(train)
        evals = {}
        param_sets = dict(learner["params"])
        param_sets["fsrs_rs"] = fitted
        for name, params in param_sets.items():
            ev = FSRS(params).evaluate(test)
            evals[name] = {"log_loss": ev.log_loss, "rmse_bins": ev.rmse_bins}
        out["runs"][learner["name"]] = {
            "fsrs_rs_params": fitted,
            "n_train": len(train),
            "n_test": len(test),
            "eval": evals,
        }
        print(f"  fsrs-rs：{learner['name']}（訓練 {len(train)} 筆、測試 {len(test)} 筆）", file=sys.stderr, flush=True)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
