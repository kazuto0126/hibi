"""
把 Klee One 字型「子集化」：只保留假名、標點、JIS 第一水準漢字與全部常用漢字。
原檔 7.9MB → 3.7MB，App 下載與啟動都比較快。

用法（需要 Python 3 與 fonttools）：
    pip install fonttools
    python scripts/subset-font.py KleeOne-Regular.ttf jouyou.txt assets/fonts/KleeOne-Regular-JP-subset.ttf

- KleeOne-Regular.ttf：Google Fonts 或 @expo-google-fonts/klee-one 裡的原始字型
- jouyou.txt：2,136 個常用漢字（一行或一串都可以），這次用的是
  https://github.com/davidluzgouveia/kanji-data 的 kanji-jouyou.json
"""
import sys

from fontTools import subset
from fontTools.ttLib import TTFont


def jis_level1_kanji():
    """JIS X 0208 第一水準漢字（EUC-JP 第 16～47 區），約 2,965 字"""
    out = []
    for cp in range(0x4E00, 0xA000):
        try:
            b = chr(cp).encode("euc_jp")
        except UnicodeEncodeError:
            continue
        if len(b) == 2 and 16 <= b[0] - 0xA0 <= 47:
            out.append(cp)
    return out


def main(src, jouyou_path, dst):
    jouyou = {ord(c) for c in open(jouyou_path, encoding="utf-8").read() if c.strip()}
    cps = set(range(0x20, 0x7F))  # ASCII
    cps |= set(range(0x3000, 0x3100))  # 日文標點、平假名、片假名
    cps |= set(range(0xFF00, 0xFFF0))  # 全形英數與符號
    cps |= {0x2026, 0x2025, 0x301C, 0x2015, 0x2010, 0x00D7, 0x2192, 0x2190}
    cps |= set(jis_level1_kanji()) | jouyou

    font = TTFont(src)
    keep = sorted(cps & set(font.getBestCmap().keys()))
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    s = subset.Subsetter(opts)
    s.populate(unicodes=keep)
    s.subset(font)
    font.save(dst)
    print(f"{dst}: 保留 {len(keep)} 個字元")


if __name__ == "__main__":
    main(*sys.argv[1:4])
