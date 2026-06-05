# -*- coding: utf-8 -*-
"""放大 + 锐化 dashboard 图片，徽章抠白底透明，并重命名为代码期望的英文名。"""
import os
from PIL import Image, ImageFilter

DIR = os.path.join(os.path.dirname(__file__), 'gmp-web', 'public', 'dashboard')

# 中文原名 -> 英文目标名
MAP = {
    'GMP 盾牌 Banner.png':   ('hero.png',            'banner'),
    '「初学者」徽章.png':     ('badge-beginner.png',  'badge'),
    '「勤奋学习」徽章.png':   ('badge-diligent.png',  'badge'),
    '「实训达人」徽章.png':   ('badge-expert.png',    'badge'),
    '「知识探索者」徽章.png': ('badge-explorer.png',  'badge'),
}


def process_banner(src, dst):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    # 2x 放大（LANCZOS 高质量）
    im = im.resize((w * 2, h * 2), Image.LANCZOS)
    # 轻度锐化恢复观感
    im = im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=130, threshold=2))
    im.save(dst, 'PNG', optimize=True)
    print(f'  banner {w}x{h} -> {im.size[0]}x{im.size[1]}  {dst}')


def process_badge(src, dst):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    # 放大到 ~256px（适配 retina），按比例
    scale = 256 / max(w, h)
    nw, nh = int(w * scale), int(h * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    # 抠近白色背景 -> 透明
    px = im.load()
    for y in range(nh):
        for x in range(nw):
            r, g, b, a = px[x, y]
            if r > 238 and g > 238 and b > 238:
                px[x, y] = (r, g, b, 0)
    # 锐化
    im = im.filter(ImageFilter.UnsharpMask(radius=1.8, percent=140, threshold=2))
    im.save(dst, 'PNG', optimize=True)
    print(f'  badge  {w}x{h} -> {nw}x{nh} (透明)  {dst}')


def main():
    for cn, (en, kind) in MAP.items():
        src = os.path.join(DIR, cn)
        dst = os.path.join(DIR, en)
        if not os.path.exists(src):
            print(f'  缺失: {cn}')
            continue
        if kind == 'banner':
            process_banner(src, dst)
        else:
            process_badge(src, dst)


if __name__ == '__main__':
    main()
    print('done')
