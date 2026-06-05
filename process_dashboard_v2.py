# -*- coding: utf-8 -*-
"""处理用户新上传的高清图：Banner 转 hero.png；徽章用边缘洪水填充抠白底透明。"""
import os
from collections import deque
from PIL import Image, ImageFilter

DIR = os.path.join(os.path.dirname(__file__), 'gmp-web', 'public', 'dashboard')

# 哈希原名 -> (英文目标名, 类型)
MAP = {
    'f6f0c9355613a98d751783d17bf896eb.png': ('hero.png',           'banner'),
    '61a49cb7ffa647746bc14aba0426fd5d.jpg': ('badge-beginner.png', 'badge'),
    '6c01805607e6b62925f4fdcff5cffa75.jpg': ('badge-diligent.png', 'badge'),
    '6340f8c2e00a6d547f79cbb2ceeee87f.png': ('badge-explorer.png', 'badge'),
    '1f56bd2d674590045d3fb8b1db496245.png': ('badge-expert.png',   'badge'),
}

WHITE = 228  # 近白阈值


def process_banner(src, dst):
    im = Image.open(src).convert('RGB')
    # Banner 已是高清，直接保存（适度限制宽度到 1940 即可）
    if im.size[0] > 1940:
        r = 1940 / im.size[0]
        im = im.resize((1940, int(im.size[1] * r)), Image.LANCZOS)
    im.save(dst, 'PNG', optimize=True)
    print(f'  banner -> {im.size[0]}x{im.size[1]}  {os.path.basename(dst)}')


def flood_remove_bg(im):
    """从四周边缘洪水填充，移除与边缘连通的近白背景，保留内部白色。"""
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    q = deque()

    def is_white(x, y):
        r, g, b, a = px[x, y]
        return r >= WHITE and g >= WHITE and b >= WHITE

    # 边缘入队
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y * w + x] and is_white(x, y):
                visited[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y * w + x] and is_white(x, y):
                visited[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx] and is_white(nx, ny):
                visited[ny * w + nx] = 1
                q.append((nx, ny))
    return im


def process_badge(src, dst):
    im = Image.open(src).convert('RGBA')
    # 先缩到 256（洪水填充更快）
    scale = 256 / max(im.size)
    im = im.resize((int(im.size[0] * scale), int(im.size[1] * scale)), Image.LANCZOS)
    im = flood_remove_bg(im)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.5, percent=110, threshold=2))
    im.save(dst, 'PNG', optimize=True)
    print(f'  badge -> {im.size[0]}x{im.size[1]} (透明)  {os.path.basename(dst)}')


def main():
    for src_name, (dst_name, kind) in MAP.items():
        src = os.path.join(DIR, src_name)
        dst = os.path.join(DIR, dst_name)
        if not os.path.exists(src):
            print(f'  缺失: {src_name}')
            continue
        if kind == 'banner':
            process_banner(src, dst)
        else:
            process_badge(src, dst)
    print('done')


if __name__ == '__main__':
    main()
