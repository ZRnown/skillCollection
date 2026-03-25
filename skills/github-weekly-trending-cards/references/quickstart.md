# Quickstart

## 1) 进入技能目录

```bash
cd /Users/wanghaixin/skillCollection/skills/github-weekly-trending-cards
```

## 2) 首次安装截图依赖

```bash
cd /Users/wanghaixin/skillCollection/skills/github-weekly-trending-cards
npm install
npx playwright install chromium
```

## 3) 生成一套周榜卡片

```bash
python3 scripts/build_github_weekly_cards.py \
  --issue "第一期" \
  --date "2026-03-23" \
  --brand-name "AI造物社" \
  --brand-avatar "/Users/wanghaixin/Documents/Obsidian Vault/小红书/1040g2jo31touef2n6i6g5pnkshane242qganhgg.webp"
```

## 4) 产物位置

默认会输出到当前目录下：

`github-trending-ljg-card-YYYYMMDD`

其中 `png/00-cover.png` 是封面。
