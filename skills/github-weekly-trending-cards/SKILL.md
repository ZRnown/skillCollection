---
name: github-weekly-trending-cards
description: Use when a user wants a GitHub weekly trending cover-plus-detail card set (cover + one project per page), including live star/fork/weekly-growth data and export to PNG.
---

# GitHub Weekly Trending Cards

## Overview

把 GitHub `since=weekly` 热点仓库做成一组可发社媒的卡片图：
- 第 1 页封面（周榜 + 项目列表）
- 后续每页讲 1 个项目（Star / 本周新增 / 语言 / Forks + 文案）

该 skill 复用了 `ljg-card` 风格模板，并提供一个统一脚本，一条命令生成 `html + png + manifest + sources`。

## Script Directory

把下面目录记为 `SKILL_DIR`：

`skills/github-weekly-trending-cards`

主要脚本：

`scripts/build_github_weekly_cards.py`

## Prerequisites

- `python3` 可用
- `node` 可用
- 本机可运行 Playwright Chromium（首次需要安装）

首次安装依赖：

```bash
cd ${SKILL_DIR}
npm install
npx playwright install chromium
```

## Quick Usage

在线抓取 GitHub 周榜并出图：

```bash
python3 ${SKILL_DIR}/scripts/build_github_weekly_cards.py \
  --issue "第一期" \
  --date "2026-03-23" \
  --brand-name "AI造物社" \
  --brand-avatar "/path/to/avatar.webp"
```

只生成 HTML（不截图）：

```bash
python3 ${SKILL_DIR}/scripts/build_github_weekly_cards.py --skip-capture
```

用已有 JSON 数据生成（离线可用）：

```bash
python3 ${SKILL_DIR}/scripts/build_github_weekly_cards.py \
  --data-json "/tmp/github-weekly-ai-dev-top6.json"
```

## Key Options

- `--output-dir`: 输出目录（默认当前目录下 `github-trending-ljg-card-YYYYMMDD`）
- `--repos`: 指定仓库列表（逗号分隔，`owner/repo`）
- `--top-n`: 项目数量（默认 6）
- `--issue`: 期号（默认 `第一期`）
- `--date`: 日期（`YYYY-MM-DD`）
- `--brand-name`: 底部品牌名和背景水印文本
- `--brand-avatar`: 底部品牌头像路径
- `--data-json`: 使用预取数据，不走在线拉取
- `--github-token`: 可选，传 GitHub Token（也可用环境变量 `GITHUB_TOKEN`）

## Output

输出目录内包含：

- `html/*.html`
- `png/*.png`（如果未使用 `--skip-capture`）
- `manifest.json`
- `summary.md`
- `sources.md`
- `weekly_data.json`

## Notes

- 当前文案模板针对 6 个 AI 相关仓库做了优化；如果要扩充仓库池，更新脚本中的 `PROJECT_COPY` 即可。
- 标签 `#` 由 CSS 自动补前缀，不需要手写到标签文本里。
