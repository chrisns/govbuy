#!/usr/bin/env python3
"""Render the social share card (1200x630) in the cns.me editorial design system, using the real
brand variable fonts (Fraunces / Hanken Grotesk / JetBrains Mono). Stats are passed in from the site
build so the card is always current. Best-effort: build-site.mjs calls this and ignores failure.

  python3 og-card.py <stats.json> <out.png>

stats.json: {frameworks, listings, fused_awards, awarded, generated}  (pre-formatted display strings)
"""
import json
import sys
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE / ".ogfonts"

# Brand variable fonts (Google Fonts OFL). Cached in .ogfonts (gitignored); auto-downloaded if missing
# so the card can be regenerated on any machine. The generated public/og.png itself is committed.
FONT_SRC = {
    "Fraunces.ttf": "https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "Fraunces-Italic.ttf": "https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "HankenGrotesk.ttf": "https://github.com/google/fonts/raw/main/ofl/hankengrotesk/HankenGrotesk%5Bwght%5D.ttf",
    "JetBrainsMono.ttf": "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
}


def ensure_fonts():
    FONTS.mkdir(exist_ok=True)
    for name, url in FONT_SRC.items():
        p = FONTS / name
        if p.exists() and p.stat().st_size > 1000:
            continue
        req = urllib.request.Request(url, headers={"User-Agent": "govbuy-build"})
        with urllib.request.urlopen(req, timeout=60) as r:
            p.write_bytes(r.read())
W, H = 1200, 630
SS = 2  # supersample for crisp text, downscale at the end

PAPER = (244, 239, 231)
BONE = (251, 248, 242)
INK = (20, 17, 15)
INK2 = (42, 38, 34)
INK3 = (92, 84, 76)
PINK = (229, 25, 127)
PINK_DEEP = (179, 14, 97)
PAPER2 = (235, 228, 216)
PAPER3 = (221, 211, 194)


def font(name, size, wght=None, opsz=None):
    f = ImageFont.truetype(str(FONTS / name), size * SS)
    try:
        axes = f.get_variation_axes()
        names = [a["name"].decode() if isinstance(a["name"], bytes) else a["name"] for a in axes]
        vals = [a["default"] for a in axes]
        for i, n in enumerate(names):
            if n == "Weight" and wght is not None:
                vals[i] = wght
            elif n == "Optical Size" and opsz is not None:
                vals[i] = opsz
            elif n in ("Softness", "Wonky"):
                vals[i] = 0
        f.set_variation_by_axes(vals)
    except Exception:
        pass
    return f


def tracked(draw, xy, text, fnt, fill, tracking=0, anchor="la"):
    """Draw text with letter-spacing (PIL has none natively). Returns end x."""
    x, y = xy
    if anchor[0] == "r":
        total = sum(draw.textlength(c, font=fnt) for c in text) + tracking * SS * (len(text) - 1)
        x -= total
    for c in text:
        draw.text((x, y), c, font=fnt, fill=fill, anchor="l" + anchor[1])
        x += draw.textlength(c, font=fnt) + tracking * SS
    return x


def main():
    ensure_fonts()
    stats = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    M = 72 * SS

    img = Image.new("RGB", (W * SS, H * SS), PAPER)
    d = ImageDraw.Draw(img)

    # subtle frame + corner rule
    d.rectangle([12 * SS, 12 * SS, (W - 12) * SS, (H - 12) * SS], outline=INK, width=2 * SS)
    d.rectangle([12 * SS, 12 * SS, (W - 12) * SS, 18 * SS], fill=INK)  # heavy top rule

    # brand row
    by = 52 * SS
    f_brand = font("Fraunces.ttf", 30, wght=900, opsz=40)
    f_brand_i = font("Fraunces-Italic.ttf", 30, wght=900, opsz=40)
    x = M
    d.text((x, by), "cns", font=f_brand, fill=INK, anchor="lm")
    x += d.textlength("cns", font=f_brand)
    d.ellipse([x + 4 * SS, by - 4 * SS, x + 12 * SS, by + 4 * SS], fill=PINK)
    x += 18 * SS
    d.text((x, by), "me", font=f_brand_i, fill=INK, anchor="lm")
    x += d.textlength("me", font=f_brand_i) + 12 * SS
    f_mono = font("JetBrainsMono.ttf", 15, wght=500)
    d.text((x, by + 1 * SS), "/ govbuy", font=f_mono, fill=INK3, anchor="lm")
    tracked(d, (W * SS - M, by + 1 * SS), "ROUTE × REALITY × STATUTE", font("JetBrainsMono.ttf", 13, wght=500), INK3, tracking=2, anchor="rm")

    # eyebrow
    tracked(d, (M, 150 * SS), "AN MCP SERVER · UK PUBLIC PROCUREMENT", font("JetBrainsMono.ttf", 14, wght=500), PINK_DEEP, tracking=3)

    # headline
    f_h = font("Fraunces.ttf", 82, wght=900, opsz=144)
    f_hi = font("Fraunces-Italic.ttf", 82, wght=700, opsz=144)
    d.text((M, 180 * SS), "The public-", font=f_h, fill=INK, anchor="la")
    # second line: "procurement " (roman) + "co-pilot." (italic pink)
    y2 = 268 * SS
    x2 = M
    d.text((x2, y2), "procurement ", font=f_h, fill=INK, anchor="la")
    x2 += d.textlength("procurement ", font=f_h)
    d.text((x2, y2), "co-pilot.", font=f_hi, fill=PINK, anchor="la")

    # lede
    f_lede = font("Fraunces-Italic.ttf", 21, wght=400, opsz=40)
    d.text((M, 372 * SS), "How to buy, where to sell, how public money flows — source-anchored, in one place.", font=f_lede, fill=INK2, anchor="la")

    # rule above stats
    d.line([M, 418 * SS, W * SS - M, 418 * SS], fill=PAPER3, width=2 * SS)

    # stats (4 across)
    cells = [
        (stats["frameworks"], "FRAMEWORKS & MARKETS"),
        (stats["listings"], "CATALOGUE LISTINGS"),
        (stats["fused_awards"], "REAL AWARDS FUSED IN"),
        (stats["awarded"], "OF AWARDED VALUE"),
    ]
    colw = (W * SS - 2 * M) / 4
    f_num = font("Fraunces.ttf", 46, wght=800, opsz=144)
    f_cap = font("JetBrainsMono.ttf", 12, wght=500)
    sy = 446 * SS
    for i, (num, cap) in enumerate(cells):
        cx = M + i * colw
        d.rectangle([cx, sy + 4 * SS, cx + 3 * SS, sy + 56 * SS], fill=PINK)
        d.text((cx + 16 * SS, sy + 2 * SS), str(num), font=f_num, fill=INK, anchor="la")
        tracked(d, (cx + 17 * SS, sy + 62 * SS), cap, f_cap, INK3, tracking=1.5)

    # footer band
    fy = 560 * SS
    d.line([M, fy - 16 * SS, W * SS - M, fy - 16 * SS], fill=PAPER3, width=2 * SS)
    d.text((M, fy), "govbuy.run.cns.me", font=font("JetBrainsMono.ttf", 17, wght=600), fill=PINK_DEEP, anchor="lm")
    tracked(d, (W * SS - M, fy), "FREE · UNAUTHENTICATED · BUILT BY CNS.ME", font("JetBrainsMono.ttf", 13, wght=500), INK3, tracking=1.5, anchor="rm")

    img = img.resize((W, H), Image.LANCZOS)
    img.save(out, "PNG")
    # a slightly smaller JPEG twin for platforms that prefer it
    img.save(out.with_suffix(".jpg"), "JPEG", quality=92)
    print(f"wrote {out} and {out.with_suffix('.jpg')}")


if __name__ == "__main__":
    main()
