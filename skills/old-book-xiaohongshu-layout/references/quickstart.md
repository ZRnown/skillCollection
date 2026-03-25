# Quickstart

## 1) 安装依赖

```bash
export SKILL_DIR="/path/to/thy1cc-skill/skills/old-book-xiaohongshu-layout"
python3 -m pip install -r "$SKILL_DIR/requirements.txt"
```

## 2) 直接传正文出图

```bash
python3 "$SKILL_DIR/scripts/render_old_book_xiaohongshu.py" \
  --title "旧书摘录" \
  --text "我们终其一生，都在学习如何与自己相处。" \
  --output ./output/old-book-layout.png
```

## 3) 用文本文件出图

```bash
python3 "$SKILL_DIR/scripts/render_old_book_xiaohongshu.py" \
  --title "旧书摘录" \
  --text-file ./note.txt \
  --output ./output/old-book-layout.png
```

## 4) 可选自定义参数

- `--width` / `--height`：调整画布尺寸，默认 `1242x1660`
- `--seed`：固定随机纹理
- `--font-path`：覆盖默认字体
- `--background-image`：覆盖默认背景图
