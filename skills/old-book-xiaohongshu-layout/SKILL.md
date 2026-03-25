---
name: old-book-xiaohongshu-layout
description: Use when a user wants to turn Chinese quote text or note copy into an old-book-style Xiaohongshu image with bundled paper background, Ming-style font, and a local Python renderer.
---

# Old Book Xiaohongshu Layout

## Overview

把一段中文文案渲染成旧书纸张质感的小红书图片。

这个 skill 自带背景图、字体和本地 Python 脚本，适合做书摘、句子卡、情绪向短文配图。

## When to Use

- 用户要“旧书风”“泛黄纸张”“书摘卡片”“明朝体”这类小红书排版图
- 需要本地直接出图，不依赖在线设计工具
- 希望复用固定视觉素材，而不是每次手工排版

不适合：

- 多页轮播排版
- 复杂贴纸、装饰元素、拼贴风封面
- 需要在线协作编辑的场景

## Quick Start

技能目录记为 `SKILL_DIR`：

`skills/old-book-xiaohongshu-layout`

先安装依赖：

```bash
python3 -m pip install -r ${SKILL_DIR}/requirements.txt
```

直接传正文：

```bash
python3 ${SKILL_DIR}/scripts/render_old_book_xiaohongshu.py \
  --title "旧书摘录" \
  --text "我们终其一生，都在学习如何与自己相处。" \
  --output ./output/old-book-layout.png
```

正文较长时，优先用文本文件：

```bash
python3 ${SKILL_DIR}/scripts/render_old_book_xiaohongshu.py \
  --title "旧书摘录" \
  --text-file ./note.txt \
  --output ./output/old-book-layout.png
```

## Assets

- 背景图：`assets/backgrounds/old-book-bg.jpg`
- 字体：`assets/fonts/huiwen-ming.ttf`
- 示例图：`assets/examples/sample-output.png`

脚本默认优先使用这些内置素材；如果用户显式传了 `--font-path` 或 `--background-image`，再覆盖默认值。

## References

- 快速使用说明见 `references/quickstart.md`
