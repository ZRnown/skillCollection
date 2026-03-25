from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen


SKILL_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = SKILL_DIR / "assets" / "template"
TEMPLATE_PATH = TEMPLATE_DIR / "infograph_template.html"
CAPTURE_SCRIPT = TEMPLATE_DIR / "capture.js"
LOGO_PATH = TEMPLATE_DIR / "logo.png"
ICON_DIR = SKILL_DIR / "assets" / "icons"

OUTPUT_DIR = Path.cwd() / f"github-trending-ljg-card-{dt.date.today().strftime('%Y%m%d')}"
OWNER_AVATAR_DIR = OUTPUT_DIR / "assets" / "owners"
DATA_PATH = OUTPUT_DIR / "weekly_data.json"
DATE_LABEL = dt.date.today().isoformat()
DISPLAY_DATE = f"{dt.date.today().year}年{dt.date.today().month}月{dt.date.today().day}日"
ISSUE_LABEL = "第一期"
BRAND_NAME = "AI造物社"
TRENDING_URL = "https://github.com/trending?since=weekly"
BETTER_ICONS_URL = "https://github.com/better-auth/better-icons"
BRAND_AVATAR_PATH: Path | None = None
COVER_HEIGHT = 1240
CARD_HEIGHT = 1440


PROJECT_COPY = {
    "obra/superpowers": {
        "title": "superpowers",
        "theme": "Agent 工作流",
        "icon": "superpowers",
        "palette": {"bg": "#F3F0EA", "accent": "#245B4A", "soft": "#D5CBBC", "ink": "#161616"},
        "summary": "把 AI 编程流程做成可复用作战手册，一次搭好，后面项目直接套。",
        "cover_summary": "把 AI 编程流程做成可复用作战手册",
        "features": [
            "把 AI 写代码最常走的全流程，整理成能直接开工的模板包。",
            "从接需求、拆任务、写提示词到验收交付，都有现成步骤可照抄。",
            "团队里的命名规范、提交流程、协作规则，都能沉淀进同一套模板。",
            "新人上手不用先踩坑，照流程跑一遍就能把项目推进起来。",
            "重复项目可以直接复用历史模板，开工速度明显更快。",
            "把你平时好用的方法持续补进去，最后会变成团队自己的方法论。",
        ],
        "highlight_title": "MIT 协议 · 商用友好",
        "highlight_text": "MIT 协议意味着你可以放心改、放心用、放心商用，授权门槛低，落地速度快。想把它接进团队生产流程也更轻松。",
        "fit_for": "适合已经在用 AI 编码、想把流程标准化的人。尤其适合经常做网站、脚手架、自动化项目，追求稳定提效的团队。",
        "cover_tags": ["工作流", "模板化"],
        "owner_avatar_url": "https://avatars.githubusercontent.com/u/45416?v=4",
    },
    "affaan-m/everything-claude-code": {
        "title": "everything-claude-code",
        "theme": "Harness 资源库",
        "icon": "everything",
        "palette": {"bg": "#F0F1F4", "accent": "#2E5B9A", "soft": "#CDD7E6", "ink": "#161616"},
        "summary": "把主流 AI 编码工具的高频玩法一次收齐，遇到问题先查就能用。",
        "cover_summary": "主流 AI 编码工具玩法一站收齐",
        "features": [
            "把 Claude Code、Codex、Cursor 等工具的关键资料放到一个入口里。",
            "提示词模板、命令写法、目录结构、实战案例，都能快速检索。",
            "工具出问题或流程接不上时，可以先按现成方案快速排查。",
            "原本散在帖子和仓库里的经验，被整理成更好用的知识库。",
            "入门用户可以按清单照做，老用户可以直接拿来做团队培训。",
            "适合持续增量沉淀，越用越像你自己的 AI 编码百科全书。",
        ],
        "highlight_title": "多工具一套打法",
        "highlight_text": "核心亮点是跨工具可复用。你换模型、换产品、换工作流时，很多经验还能直接沿用，不会每次都从零重学。",
        "fit_for": "适合刚入门 AI 编码的人，也适合资料太散、想统一知识库的团队。做内部文档、培训课件、速查手册都很合适。",
        "cover_tags": ["资料库", "多工具"],
        "owner_avatar_url": "https://avatars.githubusercontent.com/u/124439313?v=4",
    },
    "666ghj/MiroFish": {
        "title": "MiroFish",
        "theme": "群体智能预测",
        "icon": "mirofish",
        "palette": {"bg": "#EEF4F1", "accent": "#196C63", "soft": "#C8DDD8", "ink": "#13211E"},
        "summary": "让多个 AI 同台给答案再统一判断，结论更稳，视角更全。",
        "cover_summary": "让多个 AI 同台给答案再统一判断",
        "features": [
            "把同一个问题同时交给多个 AI，让它们各自给出判断和理由。",
            "系统会把多个结果放在一起做对比，差异点一眼就能看到。",
            "做趋势分析、热点判断、选题评估时，结论更有参考价值。",
            "你可以快速看出哪个模型更稳，哪个模型更激进，方便选型。",
            "原本要多人讨论的议题，可以先让 AI 跑出一版集体草案。",
            "如果你在做多 AI 协作产品，这个仓库就是现成的实验样板。",
        ],
        "highlight_title": "多模型共识",
        "highlight_text": "它最吸睛的点是把“多模型协同判断”做成可运行的工作流。你拿到的不是单点答案，而是一组可比较、可汇总、可追踪的结论。",
        "fit_for": "适合做预测、研究、选题、策略判断的人。也适合想验证多 AI 协作价值的产品团队和技术团队。",
        "cover_tags": ["多 AI", "预测"],
        "owner_avatar_url": "https://avatars.githubusercontent.com/u/110395318?v=4",
    },
    "shareAI-lab/learn-claude-code": {
        "title": "learn-claude-code",
        "theme": "从 0 造 Agent",
        "icon": "learn",
        "palette": {"bg": "#F5EFE7", "accent": "#8A5B33", "soft": "#E1D3C0", "ink": "#221813"},
        "summary": "把 AI 编码助手从 0 到 1 的搭建过程拆开讲，照着就能做出第一版。",
        "cover_summary": "把 AI 编码助手从 0 到 1 拆开讲",
        "features": [
            "从零演示 AI 编码助手的核心结构，先把完整链路跑起来。",
            "模型接入、工具调用、结果回传等关键环节都有可参考示例。",
            "每个模块不仅给代码，还解释为什么这么设计，便于你举一反三。",
            "适合新人快速建立全局认知，不会一上来就被复杂架构劝退。",
            "想做简化版 Agent 原型时，可以直接按这里的思路开干。",
            "拿来做培训、分享、课程内容也很顺，信息密度高且好理解。",
        ],
        "highlight_title": "教学级拆解",
        "highlight_text": "最大的亮点是讲解非常成体系。你不会只看到散落代码，而是能完整理解一个 AI 编码助手怎么从输入走到执行输出。",
        "fit_for": "适合 Agent 初学者、想做原型的开发者、以及需要带新人上手的团队。做科普文章和内部分享也非常省力。",
        "cover_tags": ["教程", "入门"],
        "owner_avatar_url": "https://avatars.githubusercontent.com/u/189210346?v=4",
    },
    "lightpanda-io/browser": {
        "title": "Lightpanda Browser",
        "theme": "Agent 浏览器",
        "icon": "lightpanda",
        "palette": {"bg": "#F0F5EF", "accent": "#2F6B45", "soft": "#D5E3D1", "ink": "#152017"},
        "summary": "面向 AI 自动化任务的浏览器底座，网页任务能跑得更直接、更轻。",
        "cover_summary": "面向 AI 自动化任务的浏览器底座",
        "features": [
            "专门围绕 AI 自动操作网页的需求设计，目标就是把自动化跑顺。",
            "点击、输入、抓取、流程执行这些核心动作，都能稳定承载。",
            "长时间连续任务场景下，更容易做出轻量和可控的自动化方案。",
            "可与 Playwright、Puppeteer、CDP 等常用生态衔接，迁移成本更低。",
            "做测试、爬取、RPA、网页机器人时，多了一条性能和灵活性兼顾的路。",
            "如果你对传统浏览器方案不够满意，这个方向值得重点关注。",
        ],
        "highlight_title": "Zig 原生内核",
        "highlight_text": "最突出的点是底层路线足够硬核，明确面向 AI 自动化场景。你可以把它当成“给 Agent 跑网页任务”的基础设施来理解。",
        "fit_for": "适合做网页自动化、信息抓取、流程测试、RPA、Agent 工程的人，也适合关注浏览器底层能力的开发者。",
        "cover_tags": ["浏览器", "自动化"],
        "owner_avatar_url": "https://avatars.githubusercontent.com/u/145980012?v=4",
    },
    "langchain-ai/deepagents": {
        "title": "deepagents",
        "theme": "Batteries Included",
        "icon": "deepagents",
        "palette": {"bg": "#EEF2F7", "accent": "#335B87", "soft": "#D4DEE9", "ink": "#151A20"},
        "summary": "复杂 Agent 能力开箱就有，先把业务跑起来，再按需扩展。",
        "cover_summary": "复杂 Agent 能力开箱就有，先跑再扩展",
        "features": [
            "复杂 Agent 常用能力一开始就配好，省掉大量底层拼装时间。",
            "任务规划、文件处理、子 Agent 协作这些模块可直接使用。",
            "做第一版产品验证时能明显提速，思路对了就能快速出 Demo。",
            "后续要换模型、换工具、换流程，扩展空间依然足够。",
            "对多步骤、长链路任务更友好，落地效果比单轮问答更接近实战。",
            "很多工程底座已经预置好，你可以把精力放在业务本身。",
        ],
        "highlight_title": "多 Agent 全家桶",
        "highlight_text": "最吸睛的地方是“开箱可跑 + 能力齐全”。复杂 Agent 的关键积木已经准备好，你可以直接把时间投入到业务场景和效果打磨。",
        "fit_for": "适合想快速做复杂 AI 助手原型的团队，也适合要落地多步骤工作流的项目。做产品验证、企业内部工具都很合适。",
        "cover_tags": ["多代理", "开箱即用"],
        "owner_avatar_url": "https://avatars.githubusercontent.com/u/126733545?v=4",
    },
}


DEFAULT_REPO_ORDER = list(PROJECT_COPY.keys())


def display_date_from_label(date_label: str) -> str:
    date_obj = dt.date.fromisoformat(date_label)
    return f"{date_obj.year}年{date_obj.month}月{date_obj.day}日"


def parse_num(value: str | int | None, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value
    digits = re.sub(r"[^\d]", "", str(value))
    if not digits:
        return default
    return int(digits)


def strip_html_tags(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    text = html.unescape(text)
    return " ".join(text.split())


def http_get_text(url: str, token: str | None = None) -> str:
    headers = {"User-Agent": "github-weekly-trending-cards-skill"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="ignore")


def http_get_json(url: str, token: str | None = None) -> dict:
    return json.loads(http_get_text(url, token))


def parse_trending_weekly(html_text: str) -> dict[str, dict]:
    results: dict[str, dict] = {}
    articles = re.findall(r'<article[^>]*class="Box-row"[^>]*>(.*?)</article>', html_text, flags=re.S)
    for article in articles:
        repo_match = re.search(r'href="/([^"/]+/[^"/]+)"', article)
        if not repo_match:
            continue
        full_name = repo_match.group(1)
        desc_match = re.search(r"<p[^>]*>(.*?)</p>", article, flags=re.S)
        lang_match = re.search(r'itemprop="programmingLanguage">\s*([^<]+)\s*<', article)
        week_match = re.search(r"([\d,]+)\s+stars?\s+this\s+week", article, flags=re.I)
        results[full_name] = {
            "description": strip_html_tags(desc_match.group(1)) if desc_match else "",
            "language": (lang_match.group(1).strip() if lang_match else ""),
            "stars_week_value": parse_num(week_match.group(1) if week_match else None),
        }
    return results


def load_data_map(data_path: Path) -> dict[str, dict]:
    raw = json.loads(data_path.read_text())
    mapped: dict[str, dict] = {}
    for row in raw:
        full_name = row.get("full_name")
        if full_name:
            mapped[full_name] = row
    return mapped


def build_live_rows(repo_order: list[str], token: str | None = None) -> list[dict]:
    trending_map = parse_trending_weekly(http_get_text(TRENDING_URL, token))
    rows: list[dict] = []
    for full_name in repo_order:
        api_url = f"https://api.github.com/repos/{full_name}"
        repo_api = http_get_json(api_url, token)
        owner = repo_api["owner"]["login"]
        repo = repo_api["name"]
        trend = trending_map.get(full_name, {})
        row = {
            "full_name": full_name,
            "owner": owner,
            "repo": repo,
            "url": f"https://github.com/{full_name}",
            "description": trend.get("description") or repo_api.get("description") or "",
            "language": trend.get("language") or repo_api.get("language") or "Unknown",
            "stars": fmt_num(repo_api["stargazers_count"]),
            "forks": fmt_num(repo_api["forks_count"]),
            "stars_week": fmt_num(trend.get("stars_week_value", 0)),
            "stars_week_value": int(trend.get("stars_week_value", 0)),
            "api_stars": int(repo_api["stargazers_count"]),
            "api_forks": int(repo_api["forks_count"]),
            "owner_avatar_url": repo_api["owner"].get("avatar_url") or PROJECT_COPY[full_name]["owner_avatar_url"],
        }
        rows.append(row)
    return rows


def parse_repo_order(raw_repos: str | None, top_n: int) -> list[str]:
    if raw_repos:
        candidates = [item.strip() for item in raw_repos.split(",") if item.strip()]
    else:
        candidates = list(DEFAULT_REPO_ORDER)
    repos = [repo for repo in candidates if repo in PROJECT_COPY]
    if not repos:
        raise ValueError("没有可用仓库，请使用 PROJECT_COPY 里存在的 full_name。")
    return repos[:top_n]


def apply_runtime_config(args: argparse.Namespace) -> None:
    global OUTPUT_DIR, OWNER_AVATAR_DIR, DATA_PATH
    global DATE_LABEL, DISPLAY_DATE, ISSUE_LABEL
    global BRAND_AVATAR_PATH, BRAND_NAME
    global COVER_HEIGHT, CARD_HEIGHT

    OUTPUT_DIR = args.output_dir.resolve()
    OWNER_AVATAR_DIR = OUTPUT_DIR / "assets" / "owners"
    DATA_PATH = OUTPUT_DIR / "weekly_data.json"
    DATE_LABEL = args.date
    DISPLAY_DATE = display_date_from_label(args.date)
    ISSUE_LABEL = args.issue
    BRAND_NAME = args.brand_name
    BRAND_AVATAR_PATH = args.brand_avatar.resolve() if args.brand_avatar else None
    COVER_HEIGHT = args.cover_height
    CARD_HEIGHT = args.card_height


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def fmt_num(value: int) -> str:
    return f"{value:,}"


def short_num(value: int) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value / 1_000:.1f}k"
    return str(value)


def clean_desc(value: str) -> str:
    value = value or ""
    for prefix in (
        "Sponsor Star ",
        "Star ",
    ):
        if value.startswith(prefix):
            value = value[len(prefix) :]
    if " / " in value:
        value = value.split(" / ", 1)[1]
    return " ".join(value.split())


def with_size(url: str, size: int) -> str:
    if not url:
        return ""
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}s={size}"


def load_items() -> list[dict]:
    raw = json.loads(DATA_PATH.read_text())
    items = []
    for index, item in enumerate(raw, start=1):
        full_name = item["full_name"]
        if full_name not in PROJECT_COPY:
            continue
        extra = PROJECT_COPY[full_name]
        stars = item.get("api_stars") or parse_num(item.get("stars"))
        forks = item.get("api_forks") or parse_num(item.get("forks"))
        item = {
            **item,
            **extra,
            "rank": index,
            "stars_value": stars,
            "forks_value": forks,
            "stars_week_value": parse_num(item.get("stars_week_value") or item.get("stars_week")),
            "description_clean": clean_desc(item.get("description", "")),
            "language_clean": item.get("language") or "Unknown",
            "owner_avatar_url": item.get("owner_avatar_url") or extra.get("owner_avatar_url"),
            "owner_avatar_path": OWNER_AVATAR_DIR / f"{item['owner']}.img",
        }
        items.append(item)
    return items


def select_avatar() -> Path | None:
    candidates = [
        BRAND_AVATAR_PATH,
        OUTPUT_DIR / "assets" / "avatar.png",
        OUTPUT_DIR / "assets" / "avatar.jpg",
        OUTPUT_DIR / "assets" / "avatar.jpeg",
        OUTPUT_DIR / "assets" / "avatar.webp",
    ]
    for path in candidates:
        if path and path.exists():
            return path
    return None


def icon_url(name: str) -> str:
    return f"file://{ICON_DIR / f'{name}.svg'}"


def icon_img(name: str, cls: str = "icon", alt: str = "") -> str:
    return f'<img src="{esc(icon_url(name))}" class="{esc(cls)}" alt="{esc(alt)}">'


def local_uri(path: Path) -> str:
    return path.resolve().as_uri()


def avatar_html(avatar_path: Path | None) -> str:
    if avatar_path:
        return f'<img src="{esc(local_uri(avatar_path))}" class="avatar-img" alt="{esc(BRAND_NAME)}头像">'
    return '<div class="avatar-fallback">AI</div>'


def repo_avatar_html(url: str, cls: str, alt: str) -> str:
    return f'<img src="{esc(with_size(url, 240))}" class="{esc(cls)}" alt="{esc(alt)}">'


def repo_avatar_asset_html(path: Path, fallback_url: str, cls: str, alt: str) -> str:
    src = local_uri(path) if path.exists() else with_size(fallback_url, 240)
    return f'<img src="{esc(src)}" class="{esc(cls)}" alt="{esc(alt)}">'


def feature_list_html(features: list[str]) -> str:
    items = "\n".join(f"<li>{esc(feature)}</li>" for feature in features)
    return f'<ul class="feature-list">{items}</ul>'


def watermark_html() -> str:
    positions = [
        ("8%", "-6%"),
        ("10%", "12%"),
        ("14%", "28%"),
        ("16%", "48%"),
        ("20%", "64%"),
        ("24%", "82%"),
        ("34%", "-2%"),
        ("36%", "18%"),
        ("42%", "34%"),
        ("44%", "54%"),
        ("50%", "70%"),
        ("56%", "84%"),
        ("64%", "2%"),
        ("66%", "22%"),
        ("72%", "38%"),
        ("74%", "58%"),
        ("80%", "74%"),
        ("84%", "-4%"),
        ("90%", "18%"),
        ("92%", "46%"),
    ]
    return '<div class="bg-watermarks">' + "".join(
        f'<span class="page-watermark" style="top:{top}; left:{left};">{esc(BRAND_NAME)}</span>'
        for top, left in positions
    ) + "</div>"


def cover_list_html(items: list[dict]) -> str:
    rows = []
    for item in items:
        rows.append(
            f"""
            <div class="cover-project-row">
              {repo_avatar_asset_html(item["owner_avatar_path"], item["owner_avatar_url"], "cover-avatar avatar-user", item["owner"] + " avatar")}
              <div class="cover-project-copy">
                <div class="cover-project-name">{esc(item["title"])}</div>
                <div class="cover-project-desc">{esc(item["cover_summary"])}</div>
              </div>
              <div class="cover-project-meta">
                <div class="cover-star-line">
                  {icon_img("star", "cover-star-icon", "Star")}
                  <span>{esc(short_num(item["stars_value"]))}</span>
                </div>
                <div class="cover-tags">
                  <span class="cover-tag">{esc(item["cover_tags"][0])}</span>
                  <span class="cover-tag">{esc(item["cover_tags"][1])}</span>
                </div>
              </div>
            </div>
            """
        )
    return "".join(rows)


def build_template(
    custom_css: str,
    content_html: str,
    source: str,
    ref_line: str,
    footer_avatar_path: Path | None = None,
) -> str:
    template = TEMPLATE_PATH.read_text()
    template = template.replace("{{CUSTOM_CSS}}", custom_css)
    template = template.replace("{{CONTENT_HTML}}", content_html)
    template = template.replace("{{SOURCE}}", esc(source))
    template = template.replace("{{ARXIV_LINE}}", f'<div class="arxiv">{esc(ref_line)}</div>')
    template = template.replace(
        "file:///Users/lijigang/.claude/skills/ljg-card/assets/logo.png",
        local_uri(footer_avatar_path or LOGO_PATH),
    )
    return template


def ensure_owner_avatars(items: list[dict]) -> None:
    OWNER_AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    for item in items:
        path = item["owner_avatar_path"]
        if path.exists() and path.stat().st_size > 0:
            continue
        avatar_url = item.get("owner_avatar_url", "")
        if not avatar_url:
            path.unlink(missing_ok=True)
            continue
        try:
            with urlopen(with_size(avatar_url, 240), timeout=20) as response:
                path.write_bytes(response.read())
        except Exception:
            path.unlink(missing_ok=True)


def metric_box(label: str, value: str, icon_name: str) -> str:
    return f"""
    <div class="metric">
      <div class="metric-top">
        {icon_img(icon_name, "metric-icon", label)}
        <span class="metric-label">{esc(label)}</span>
      </div>
      <div class="metric-value">{esc(value)}</div>
    </div>
    """


def render_cover(items: list[dict], avatar_path: Path | None) -> str:
    css = """
    :root {
      --bg: #f3efe8;
      --green: #d9d0c3;
      --pink: #111111;
    }
    html, body {
      height: 1240px;
    }
    .page {
      min-height: 1240px;
      height: 1240px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .colophon {
      padding: 24px 42px 28px;
      border-top: 1px solid rgba(17,17,17,0.08);
    }
    .colophon .who img {
      width: 50px;
      height: 50px;
    }
    .colophon .who span {
      font: 700 28px/1 var(--sans);
      color: var(--ink);
    }
    .colophon .arxiv {
      font-size: 26px;
    }
    .sheet {
      position: relative;
      height: 1118px;
      padding: 0 52px 16px;
      overflow: hidden;
    }
    .sheet > :not(.bg-watermarks) {
      position: relative;
      z-index: 1;
    }
    .bg-watermarks {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .page-watermark {
      position: absolute;
      font: 700 44px/1 var(--sans);
      letter-spacing: 0.08em;
      color: rgba(17,17,17,0.035);
      transform: rotate(-45deg);
      transform-origin: left top;
      white-space: nowrap;
    }
    .cover-mark {
      position: absolute;
      left: -10px;
      top: 8px;
      width: 430px;
      height: 430px;
      opacity: 0.12;
      filter: saturate(0);
    }
    .cover-stack {
      position: relative;
      top: -78px;
    }
    .cover-title {
      margin-left: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--ink);
      position: relative;
      top: -250px;
      margin-bottom: -250px;
      z-index: 2;
    }
    .cover-title .title-line-main {
      font: 700 132px/0.88 var(--serif);
      letter-spacing: -0.06em;
      white-space: nowrap;
    }
    .cover-title .title-line-sub {
      font: 700 164px/0.84 var(--serif);
      letter-spacing: -0.07em;
      white-space: nowrap;
    }
    .issue-badge {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      margin-top: 14px;
      padding: 13px 20px;
      border-radius: 999px;
      background: #111111;
      color: #f8f5ef;
      font: 700 29px/1 var(--sans);
      letter-spacing: 0.02em;
    }
    .issue-badge .issue-icon {
      width: 26px;
      height: 26px;
      filter: invert(1);
    }
    .cover-note {
      margin-top: 14px;
      font: 700 23px/1 var(--sans);
      letter-spacing: 0.02em;
      color: var(--ink);
    }
    .cover-projects {
      margin-top: 14px;
      display: grid;
      grid-template-rows: repeat(6, minmax(0, 1fr));
      gap: 10px;
      width: 100%;
      max-width: 980px;
      min-height: 620px;
      padding: 20px 22px 18px;
      border-radius: 34px;
      background: rgba(255,255,255,0.52);
      border: 1px solid rgba(17,17,17,0.08);
      box-shadow: 0 28px 48px -42px rgba(0,0,0,0.2);
    }
    .cover-project-row {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr) auto;
      gap: 18px;
      align-items: center;
      min-height: 84px;
      height: 100%;
      padding: 0;
    }
    .cover-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid rgba(17,17,17,0.08);
      background: rgba(255,255,255,0.82);
    }
    .cover-project-copy {
      min-width: 0;
    }
    .cover-project-name {
      font: 400 40px/0.98 var(--serif);
      letter-spacing: -0.05em;
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cover-project-desc {
      margin-top: 6px;
      font: 500 20px/1.18 var(--sans);
      color: var(--ink-light);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cover-project-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      min-width: 148px;
    }
    .cover-star-line {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font: 700 22px/1 var(--mono);
      color: var(--ink);
    }
    .cover-star-icon {
      width: 18px;
      height: 18px;
      opacity: 0.9;
    }
    .cover-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .cover-tag {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 0 12px;
      border-radius: 999px;
      background: rgba(17,17,17,0.06);
      border: 1px solid rgba(17,17,17,0.08);
      font: 600 14px/1 var(--sans);
      color: var(--ink-light);
      white-space: nowrap;
    }
    .cover-tag::before {
      content: "#";
      margin-right: 2px;
      font-weight: 700;
      color: rgba(17,17,17,0.72);
    }
    """
    content = f"""
    <section class="sheet">
      {watermark_html()}
      {icon_img("github", "cover-mark", "GitHub")}
      <div class="cover-stack">
        <div class="cover-title">
          <span class="title-line-main">GitHub 爆火项目</span>
          <span class="title-line-sub">周榜</span>
        </div>
        <div class="issue-badge">
          {icon_img("issue", "issue-icon", "第一期")}
          <span>{ISSUE_LABEL}</span>
        </div>
        <div class="cover-note">本期 {len(items)} 个项目</div>
        <div class="cover-projects">
          {cover_list_html(items)}
        </div>
      </div>
    </section>
    """
    return build_template(css, content, BRAND_NAME, DISPLAY_DATE, avatar_path)


def render_project(item: dict, avatar_path: Path | None) -> str:
    palette = item["palette"]
    css = f"""
    :root {{
      --bg: {palette["bg"]};
      --green: {palette["soft"]};
      --pink: {palette["accent"]};
      --ink: {palette["ink"]};
      --ink-light: rgba(17,17,17,0.62);
    }}
    html, body {{
      height: 1440px;
    }}
    .page {{
      min-height: 1440px;
      height: 1440px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }}
    .colophon {{
      padding: 24px 42px 24px;
      border-top: 1px solid rgba(17,17,17,0.08);
    }}
    .colophon .who img {{
      width: 50px;
      height: 50px;
    }}
    .colophon .who span {{
      font: 700 28px/1 var(--sans);
      color: var(--ink);
    }}
    .colophon .arxiv {{
      font-size: 26px;
    }}
    .sheet {{
      position: relative;
      height: 1342px;
      padding: 36px 42px 22px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }}
    .sheet > :not(.bg-watermarks) {{
      position: relative;
      z-index: 1;
    }}
    .bg-watermarks {{
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }}
    .page-watermark {{
      position: absolute;
      font: 700 42px/1 var(--sans);
      letter-spacing: 0.08em;
      color: rgba(17,17,17,0.03);
      transform: rotate(-45deg);
      transform-origin: left top;
      white-space: nowrap;
    }}
    .topbar {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }}
    .issue-mini {{
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 700px;
    }}
    .issue-main {{
      font: 700 34px/1.08 var(--sans);
      letter-spacing: -0.02em;
      color: var(--ink);
    }}
    .issue-date {{
      font: 600 22px/1 var(--mono);
      color: var(--pink);
    }}
    .rank-badge {{
      width: 92px;
      height: 92px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(17,17,17,0.92);
      color: #f8f5ef;
      font: 700 32px/1 var(--mono);
    }}
    .hero {{
      margin-top: 22px;
      display: grid;
      grid-template-columns: 164px minmax(0, 1fr);
      gap: 22px;
      align-items: center;
    }}
    .hero-right {{
      min-width: 0;
    }}
    .owner-avatar-wrap {{
      width: 164px;
      height: 164px;
      border-radius: 34px;
      background: rgba(255,255,255,0.8);
      border: 1px solid rgba(17,17,17,0.08);
      display: grid;
      place-items: center;
      box-shadow: 0 28px 48px -32px rgba(0,0,0,0.18);
      overflow: hidden;
      align-self: center;
    }}
    .owner-avatar-wrap img {{
      width: 132px;
      height: 132px;
      border-radius: 28px;
      object-fit: cover;
    }}
    .theme-chip {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.72);
      border: 1px solid rgba(17,17,17,0.08);
      font: 700 19px/1 var(--sans);
      color: var(--ink);
    }}
    .theme-chip img {{
      width: 18px;
      height: 18px;
    }}
    .project-name {{
      margin-top: 14px;
      font: 400 88px/0.9 var(--serif);
      letter-spacing: -0.05em;
      max-width: 760px;
      color: var(--ink);
    }}
    .project-summary {{
      margin-top: 14px;
      font: 600 28px/1.4 var(--sans);
      color: var(--ink);
      max-width: 760px;
    }}
    .repo-path {{
      margin-top: 12px;
      font: 500 22px/1.3 var(--mono);
      color: var(--ink-light);
    }}
    .metrics {{
      margin-top: 22px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }}
    .metric {{
      background: rgba(255,255,255,0.82);
      border: 1px solid rgba(17,17,17,0.08);
      border-radius: 22px;
      padding: 16px 16px 18px;
    }}
    .metric-top {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .metric-icon {{
      width: 18px;
      height: 18px;
      opacity: 0.9;
    }}
    .metric-label {{
      font: 600 15px/1.2 var(--mono);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ink-light);
    }}
    .metric-value {{
      margin-top: 10px;
      font: 700 32px/1.1 var(--sans);
      letter-spacing: -0.03em;
      color: var(--ink);
      word-break: break-word;
    }}
    .body {{
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 18px;
      align-items: stretch;
      flex: 1;
      min-height: 0;
    }}
    .story {{
      background: rgba(255,255,255,0.78);
      border: 1px solid rgba(17,17,17,0.08);
      border-radius: 28px;
      padding: 26px 26px 24px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }}
    .story-title {{
      font: 700 24px/1 var(--sans);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--pink);
      margin-bottom: 18px;
    }}
    .story p {{
      font: 600 29px/1.6 var(--sans);
      color: var(--ink);
    }}
    .feature-list {{
      list-style: none;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      gap: 18px;
      margin: 0;
      padding: 0;
      flex: 1;
    }}
    .feature-list li {{
      position: relative;
      padding-left: 28px;
      font: 600 29px/1.55 var(--sans);
      color: var(--ink);
    }}
    .feature-list li::before {{
      content: "";
      position: absolute;
      left: 0;
      top: 16px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--pink);
    }}
    .side {{
      display: grid;
      gap: 18px;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
      min-height: 0;
    }}
    .quote {{
      background: rgba(17,17,17,0.92);
      color: #f8f5ef;
      border-radius: 30px;
      padding: 26px 26px 24px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      min-height: 0;
    }}
    .quote .story-title {{
      color: #9edbc6;
      margin-bottom: 16px;
    }}
    .quote-flag {{
      font: 700 44px/1.04 var(--serif);
      letter-spacing: -0.04em;
      color: #f8f5ef;
    }}
    .quote p {{
      margin-top: 16px;
      color: #f8f5ef;
      font: 600 26px/1.55 var(--sans);
    }}
    """
    content = f"""
    <section class="sheet">
      {watermark_html()}
      <div class="topbar">
        <div class="issue-mini">
          <span class="issue-main">GitHub 爆火项目周榜 / {ISSUE_LABEL}</span>
          <span class="issue-date">{DISPLAY_DATE}</span>
        </div>
        <div class="rank-badge">#{item['rank']:02d}</div>
      </div>

      <div class="hero">
        <div class="owner-avatar-wrap">
          {repo_avatar_asset_html(item["owner_avatar_path"], item["owner_avatar_url"], "project-icon avatar mr-2 d-none d-md-block avatar-user", item["owner"] + " avatar")}
        </div>
        <div class="hero-right">
          <div class="theme-chip">
            {icon_img(item["icon"], "metric-icon", item["theme"])}
            <span>{esc(item["theme"])}</span>
          </div>
          <div class="project-name">{esc(item["title"])}</div>
          <div class="project-summary">{esc(item["summary"])}</div>
          <div class="repo-path">{esc(item["full_name"])}</div>
        </div>
      </div>

      <div class="metrics">
        {metric_box("Star", fmt_num(item["stars_value"]), "star")}
        {metric_box("本周新增", "+" + fmt_num(item["stars_week_value"]), "trend")}
        {metric_box("语言", item["language_clean"], "code")}
        {metric_box("Forks", fmt_num(item["forks_value"]), "fork")}
      </div>

      <div class="body">
        <div class="story">
          <div class="story-title">它能做什么</div>
          {feature_list_html(item["features"])}
        </div>
        <div class="side">
          <div class="quote">
            <div class="story-title">最突出的点</div>
            <div class="quote-flag">{esc(item["highlight_title"])}</div>
            <p>{esc(item["highlight_text"])}</p>
          </div>
          <div class="story">
            <div class="story-title">适合谁用</div>
            <p>{esc(item["fit_for"])}</p>
          </div>
        </div>
      </div>
    </section>
    """
    return build_template(css, content, BRAND_NAME, DISPLAY_DATE, avatar_path)


def prepare_dirs() -> tuple[Path, Path]:
    html_dir = OUTPUT_DIR / "html"
    png_dir = OUTPUT_DIR / "png"
    for path in (html_dir, png_dir):
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)
    return html_dir, png_dir


def write_sources(items: list[dict], avatar_path: Path | None) -> None:
    summary_lines = [
        f"# GitHub 爆火项目周榜 {ISSUE_LABEL}",
        "",
        f"- 时间: {DATE_LABEL}",
        f"- 数据页: {TRENDING_URL}",
        f"- 范围: Weekly Trending 中适合 AI / 开发者账号的 {len(items)} 个项目",
        f"- 品牌标注: {BRAND_NAME}",
        f"- 头像接入: {'已接入' if avatar_path else '未找到本地原图，当前使用占位圆形'}",
        "",
        "## 项目",
        "",
    ]
    for item in items:
        summary_lines.extend(
            [
                f"### #{item['rank']:02d} {item['full_name']}",
                f"- 总 Star: {fmt_num(item['stars_value'])}",
                f"- 本周新增: +{fmt_num(item['stars_week_value'])}",
                f"- 语言: {item['language_clean']}",
                f"- Forks: {fmt_num(item['forks_value'])}",
                f"- 仓库: {item['url']}",
                "",
            ]
        )
    (OUTPUT_DIR / "summary.md").write_text("\n".join(summary_lines))

    source_lines = [
        f"# Sources ({DATE_LABEL})",
        "",
        f"- Weekly Trending: {TRENDING_URL}",
        f"- Icon source tooling: {BETTER_ICONS_URL}",
    ]
    for item in items:
        source_lines.extend(
            [
                f"- Repo: {item['url']}",
                f"- API: https://api.github.com/repos/{item['full_name']}",
                f"- README API: https://api.github.com/repos/{item['full_name']}/readme",
            ]
        )
    (OUTPUT_DIR / "sources.md").write_text("\n".join(source_lines))


def capture(html_path: Path, png_path: Path, height: int) -> None:
    subprocess.run(
        [
            "node",
            str(CAPTURE_SCRIPT),
            str(html_path),
            str(png_path),
            "1080",
            str(height),
        ],
        cwd=SKILL_DIR,
        check=True,
    )


def parse_args() -> argparse.Namespace:
    today = dt.date.today().isoformat()
    parser = argparse.ArgumentParser(
        description="Generate GitHub weekly trending cards using ljg-card style template."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.cwd() / f"github-trending-ljg-card-{dt.date.today().strftime('%Y%m%d')}",
        help="Output directory for html/png/manifest.",
    )
    parser.add_argument(
        "--data-json",
        type=Path,
        default=None,
        help="Optional pre-fetched data json path. If omitted, fetches from GitHub live.",
    )
    parser.add_argument(
        "--repos",
        type=str,
        default=None,
        help="Comma-separated repo full_name list. Defaults to built-in 6 repos.",
    )
    parser.add_argument("--top-n", type=int, default=6, help="Number of repos to include.")
    parser.add_argument("--date", type=str, default=today, help="Issue date, format YYYY-MM-DD.")
    parser.add_argument("--issue", type=str, default="第一期", help="Issue label.")
    parser.add_argument("--brand-name", type=str, default="AI造物社", help="Brand text.")
    parser.add_argument("--brand-avatar", type=Path, default=None, help="Brand avatar image path.")
    parser.add_argument("--cover-height", type=int, default=1240, help="Cover PNG height.")
    parser.add_argument("--card-height", type=int, default=1440, help="Project page PNG height.")
    parser.add_argument(
        "--github-token",
        type=str,
        default=os.environ.get("GITHUB_TOKEN"),
        help="GitHub token, defaults to env GITHUB_TOKEN when omitted.",
    )
    parser.add_argument(
        "--skip-capture",
        action="store_true",
        help="Only generate HTML/manifest/sources; skip PNG screenshot capture.",
    )
    return parser.parse_args()


def resolve_rows(repo_order: list[str], args: argparse.Namespace) -> list[dict]:
    token = args.github_token or ""
    if args.data_json:
        if not args.data_json.exists():
            raise FileNotFoundError(f"--data-json 不存在: {args.data_json}")
        data_map = load_data_map(args.data_json)
        rows: list[dict] = []
        missing: list[str] = []
        for full_name in repo_order:
            row = data_map.get(full_name)
            if row:
                rows.append(row)
            else:
                missing.append(full_name)
        if missing:
            rows.extend(build_live_rows(missing, token))
        order_map = {full_name: index for index, full_name in enumerate(repo_order)}
        rows.sort(key=lambda row: order_map.get(row["full_name"], 10**9))
        return rows
    return build_live_rows(repo_order, token)


def main() -> None:
    args = parse_args()
    dt.date.fromisoformat(args.date)
    apply_runtime_config(args)

    repo_order = parse_repo_order(args.repos, args.top_n)
    rows = resolve_rows(repo_order, args)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2))

    items = load_items()
    ensure_owner_avatars(items)
    avatar_path = select_avatar()
    html_dir, png_dir = prepare_dirs()

    pages = []
    cover_path = html_dir / "00-cover.html"
    cover_path.write_text(render_cover(items, avatar_path))
    pages.append(cover_path)

    for item in items:
        html_path = html_dir / f"{item['rank']:02d}-{item['repo']}.html"
        html_path.write_text(render_project(item, avatar_path))
        pages.append(html_path)

    png_paths = []
    if not args.skip_capture:
        for html_path in pages:
            png_path = png_dir / f"{html_path.stem}.png"
            height = COVER_HEIGHT if html_path.stem == "00-cover" else CARD_HEIGHT
            capture(html_path, png_path, height)
            png_paths.append(png_path)

    write_sources(items, avatar_path)

    manifest = {
        "date": DATE_LABEL,
        "issue": ISSUE_LABEL,
        "avatar_found": bool(avatar_path),
        "avatar_path": str(avatar_path) if avatar_path else "",
        "output_dir": str(OUTPUT_DIR),
        "data_json": str(DATA_PATH),
        "html_files": [str(path) for path in pages],
        "png_files": [str(path) for path in png_paths],
        "repos": repo_order,
        "skip_capture": bool(args.skip_capture),
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
