from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


SKILL_DIR = Path(__file__).resolve().parents[1]
DEFAULT_FONT_PATH = SKILL_DIR / "assets" / "fonts" / "huiwen-ming.ttf"
DEFAULT_BACKGROUND_PATH = SKILL_DIR / "assets" / "backgrounds" / "old-book-bg.jpg"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="旧书风小红书排版工具")
    text_group = parser.add_mutually_exclusive_group(required=True)
    text_group.add_argument("--text", help="正文内容")
    text_group.add_argument("--text-file", help="正文文本文件路径")
    parser.add_argument("--title", default="旧书摘录", help="标题")
    parser.add_argument("--output", default="output/old-book-layout.png", help="输出图片路径")
    parser.add_argument("--width", type=int, default=1242, help="画布宽度")
    parser.add_argument("--height", type=int, default=1660, help="画布高度")
    parser.add_argument("--font-path", default="", help="字体路径，默认使用技能自带汇文明朝体")
    parser.add_argument("--background-image", default="", help="背景图路径，默认使用技能自带旧书背景")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    return parser.parse_args()


def resolve_text(args: argparse.Namespace) -> str:
    if args.text is not None:
        return args.text.strip()
    text_path = Path(args.text_file).expanduser().resolve()
    return text_path.read_text(encoding="utf-8").strip()


def resolve_font_file(font_path_arg: str) -> Path | None:
    if font_path_arg:
        path = Path(font_path_arg).expanduser().resolve()
        if path.exists():
            return path
    if DEFAULT_FONT_PATH.exists():
        return DEFAULT_FONT_PATH
    search_dirs = [
        Path("/System/Library/Fonts"),
        Path("/Library/Fonts"),
        Path.home() / "Library/Fonts",
    ]
    keywords = ["汇文", "huiwen", "mincho", "ming", "songti", "宋体", "明朝"]
    candidates: list[Path] = []
    for directory in search_dirs:
        if not directory.exists():
            continue
        for ext in ("*.ttf", "*.otf", "*.ttc"):
            for file in directory.rglob(ext):
                name = file.name.lower()
                if any(key in name for key in keywords):
                    candidates.append(file)
    if not candidates:
        return None
    candidates.sort(key=lambda path: len(path.name))
    return candidates[0]


def resolve_background_path(background_path_arg: str) -> str:
    if background_path_arg:
        path = Path(background_path_arg).expanduser().resolve()
        if path.exists():
            return str(path)
    if DEFAULT_BACKGROUND_PATH.exists():
        return str(DEFAULT_BACKGROUND_PATH)
    return ""


def load_font(font_file: Path | None, size: int):
    if font_file:
        try:
            return ImageFont.truetype(str(font_file), size=size)
        except Exception:
            pass
    for name in ("STSongti-SC-Regular.ttc", "Songti.ttc", "PingFang.ttc"):
        try:
            return ImageFont.truetype(name, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            trial = current + char
            if draw.textlength(trial, font=font) <= max_width:
                current = trial
                continue
            if current:
                lines.append(current)
            current = char
        if current:
            lines.append(current)
    return lines


def create_old_paper(width: int, height: int, seed: int) -> Image.Image:
    random.seed(seed)
    base = Image.new("RGB", (width, height), (236, 218, 185))
    noise = Image.effect_noise((width, height), 14).convert("L")
    noise_rgb = ImageOps.colorize(noise, black=(184, 162, 128), white=(247, 233, 205))
    base = Image.blend(base, noise_rgb, 0.35)
    vertical = Image.linear_gradient("L").resize((width, height))
    vertical_tint = ImageOps.colorize(vertical, black=(223, 198, 158), white=(248, 236, 213))
    base = Image.blend(base, vertical_tint, 0.28)
    vignette = Image.radial_gradient("L").resize((width, height))
    vignette = ImageOps.invert(vignette)
    vignette = ImageEnhance.Contrast(vignette).enhance(1.55)
    edge_dark = ImageOps.colorize(vignette, black=(42, 32, 22), white=(255, 255, 255))
    base = ImageChops.multiply(base, edge_dark)
    stain = Image.effect_noise((width, height), 32).convert("L").filter(ImageFilter.GaussianBlur(2.2))
    stain = ImageOps.autocontrast(stain, cutoff=6)
    stain_col = ImageOps.colorize(stain, black=(145, 112, 84), white=(255, 248, 235))
    return Image.blend(base, stain_col, 0.18)


def load_background_image(background_path: str, width: int, height: int) -> Image.Image | None:
    if not background_path:
        return None
    path = Path(background_path).expanduser().resolve()
    if not path.exists():
        return None
    image = Image.open(path).convert("RGB")
    image = ImageOps.exif_transpose(image)
    image = ImageOps.fit(image, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    image = ImageEnhance.Color(image).enhance(0.86)
    image = ImageEnhance.Contrast(image).enhance(0.93)
    return image


def add_bleed_through(
    image: Image.Image,
    text: str,
    title: str,
    font_body,
    margin_x: int,
    margin_top: int,
) -> Image.Image:
    width, height = image.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    bleed_text = f"{title}\n\n{text}" if title.strip() else text
    lines = wrap_text(draw, bleed_text, font_body, width - margin_x * 2)
    y = margin_top
    for line in lines:
        draw.text((margin_x, y), line, fill=(68, 42, 26, 34), font=font_body)
        y += int(font_body.size * 1.4)
    mirrored = layer.transpose(Image.Transpose.FLIP_LEFT_RIGHT).filter(ImageFilter.GaussianBlur(2.8))
    shifted = ImageChops.offset(mirrored, random.randint(-15, 15), random.randint(12, 30))
    paper_rgba = image.convert("RGBA")
    paper_rgba.alpha_composite(shifted)
    return paper_rgba.convert("RGB")


def draw_front_text(
    image: Image.Image,
    title: str,
    text: str,
    font_title,
    font_body,
    margin_x: int,
    margin_top: int,
) -> Image.Image:
    draw = ImageDraw.Draw(image)
    has_title = bool(title.strip())
    if has_title:
        draw.text((margin_x + 2, margin_top + 2), title, fill=(76, 56, 36), font=font_title)
        draw.text((margin_x, margin_top), title, fill=(54, 34, 22), font=font_title)
    body_top = margin_top + int(font_title.size * 1.7) if has_title else margin_top
    lines = wrap_text(draw, text, font_body, image.width - margin_x * 2)
    y = body_top
    for line in lines:
        draw.text((margin_x + 1, y + 1), line, fill=(94, 76, 56), font=font_body)
        draw.text((margin_x, y), line, fill=(58, 41, 28), font=font_body)
        y += int(font_body.size * 1.65)
        if y > image.height - margin_top:
            break
    return image


def apply_photo_feel(image: Image.Image, seed: int) -> Image.Image:
    random.seed(seed + 7)
    grain = Image.effect_noise(image.size, 8).convert("L")
    grain_rgb = ImageOps.colorize(grain, black=(95, 88, 80), white=(168, 154, 140))
    image = Image.blend(image, grain_rgb, 0.08)
    image = ImageEnhance.Color(image).enhance(0.92)
    image = ImageEnhance.Contrast(image).enhance(0.95)
    image = ImageEnhance.Sharpness(image).enhance(0.9)
    return image.filter(ImageFilter.GaussianBlur(0.35))


def render_layout(
    text: str,
    title: str,
    width: int,
    height: int,
    font_file: Path | None,
    background_path: str,
    seed: int,
) -> Image.Image:
    font_title = load_font(font_file, int(height * 0.052))
    font_body = load_font(font_file, int(height * 0.026))
    margin_x = int(width * 0.11)
    margin_top = int(height * 0.13)
    paper_texture = create_old_paper(width=width, height=height, seed=seed)
    background = load_background_image(background_path=background_path, width=width, height=height)
    paper = paper_texture if background is None else Image.blend(background, paper_texture, 0.24)
    paper = add_bleed_through(
        image=paper,
        text=text,
        title=title,
        font_body=font_body,
        margin_x=margin_x,
        margin_top=margin_top,
    )
    paper = draw_front_text(
        image=paper,
        title=title,
        text=text,
        font_title=font_title,
        font_body=font_body,
        margin_x=margin_x,
        margin_top=margin_top,
    )
    return apply_photo_feel(paper, seed=seed)


def main() -> None:
    args = parse_args()
    text = resolve_text(args)
    output_path = Path(args.output).expanduser().resolve()
    font_file = resolve_font_file(args.font_path)
    background_path = resolve_background_path(args.background_image)
    image = render_layout(
        text=text,
        title=args.title,
        width=max(540, args.width),
        height=max(720, args.height),
        font_file=font_file,
        background_path=background_path,
        seed=args.seed,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    print(f"输出图片: {output_path}")
    print(f"字体文件: {font_file if font_file else '未找到可用字体，使用系统回退字体'}")
    print(f"背景图片: {background_path if background_path else '未使用背景图'}")


if __name__ == "__main__":
    main()
