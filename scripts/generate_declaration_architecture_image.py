from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "宣传物料"
PNG_PATH = OUT_DIR / "系统架构与技术路线图.png"
SVG_PATH = OUT_DIR / "系统架构与技术路线图.svg"

W, H = 3200, 3900
S = W / 1600


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
        Path(r"C:\Windows\Fonts\simsun.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), int(size * S))
    return ImageFont.load_default()


F_TITLE = font(46, True)
F_SUB = font(20)
F_SECTION = font(24, True)
F_CARD_TITLE = font(24, True)
F_BODY = font(18)
F_SMALL = font(15)
F_BADGE = font(16, True)

COLORS = {
    "ink": "#172033",
    "muted": "#667085",
    "line": "#C9D3E3",
    "panel": "#F7FAFC",
    "white": "#FFFFFF",
    "blue": "#2563EB",
    "cyan": "#0891B2",
    "green": "#16A34A",
    "amber": "#D97706",
    "rose": "#E11D48",
    "violet": "#7C3AED",
    "slate": "#475569",
}


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def draw_gradient(draw: ImageDraw.ImageDraw) -> None:
    top = hex_to_rgb("#F4F8FF")
    bottom = hex_to_rgb("#FDFEFE")
    for y in range(H):
        t = y / (H - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    box = tuple(int(v * S) for v in box)
    draw.rounded_rectangle(box, radius=int(radius * S), fill=fill, outline=outline, width=int(width * S))


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def center_text(draw: ImageDraw.ImageDraw, text: str, box, fnt, fill, line_gap=8):
    x1, y1, x2, y2 = [int(v * S) for v in box]
    lines = text.split("\n")
    heights = [text_size(draw, line, fnt)[1] for line in lines]
    total_h = sum(heights) + int(line_gap * S) * (len(lines) - 1)
    y = y1 + ((y2 - y1) - total_h) // 2
    for line, h in zip(lines, heights):
        tw, _ = text_size(draw, line, fnt)
        draw.text((x1 + ((x2 - x1) - tw) // 2, y), line, font=fnt, fill=fill)
        y += h + int(line_gap * S)


def wrap_cn(text: str, max_chars: int) -> list[str]:
    out: list[str] = []
    for part in text.split("\n"):
        if len(part) <= max_chars:
            out.append(part)
        else:
            out.extend(wrap(part, max_chars, break_long_words=True, replace_whitespace=False))
    return out


def card(
    draw: ImageDraw.ImageDraw,
    box,
    title: str,
    lines: list[str],
    color: str,
    badge: str | None = None,
    title_font=F_CARD_TITLE,
):
    x1, y1, x2, y2 = box
    rounded(draw, (x1 + 4, y1 + 6, x2 + 4, y2 + 6), 18, "#DCE6F5")
    rounded(draw, box, 18, COLORS["white"], "#D5DEEA", 2)
    rounded(draw, (x1, y1, x2, y1 + 10), 18, color)
    draw.text((int((x1 + 24) * S), int((y1 + 26) * S)), title, font=title_font, fill=COLORS["ink"])
    if badge:
        bw = text_size(draw, badge, F_BADGE)[0] / S + 30
        rounded(draw, (x2 - bw - 20, y1 + 22, x2 - 20, y1 + 54), 14, color)
        center_text(draw, badge, (x2 - bw - 20, y1 + 22, x2 - 20, y1 + 54), F_BADGE, "#FFFFFF", 0)
    yy = y1 + 78
    for line in lines:
        bullet_x = int((x1 + 28) * S)
        bullet_y = int((yy + 9) * S)
        draw.ellipse((bullet_x, bullet_y, bullet_x + int(8 * S), bullet_y + int(8 * S)), fill=color)
        for wrapped in wrap_cn(line, 18):
            draw.text((int((x1 + 46) * S), int(yy * S)), wrapped, font=F_BODY, fill=COLORS["slate"])
            yy += 29
        yy += 5


def arrow(draw: ImageDraw.ImageDraw, start, end, color="#8EA2BC", width=4, bidirectional=False):
    x1, y1 = [int(v * S) for v in start]
    x2, y2 = [int(v * S) for v in end]
    draw.line((x1, y1, x2, y2), fill=color, width=int(width * S))
    draw.polygon(
        [
            (x2, y2),
            (x2 - int(16 * S), y2 - int(9 * S)),
            (x2 - int(16 * S), y2 + int(9 * S)),
        ],
        fill=color,
    )
    if bidirectional:
        draw.polygon(
            [
                (x1, y1),
                (x1 + int(16 * S), y1 - int(9 * S)),
                (x1 + int(16 * S), y1 + int(9 * S)),
            ],
            fill=color,
        )


def vertical_arrow(draw: ImageDraw.ImageDraw, start, end, color="#8EA2BC", width=4):
    x1, y1 = [int(v * S) for v in start]
    x2, y2 = [int(v * S) for v in end]
    draw.line((x1, y1, x2, y2), fill=color, width=int(width * S))
    draw.polygon(
        [
            (x2, y2),
            (x2 - int(9 * S), y2 - int(16 * S)),
            (x2 + int(9 * S), y2 - int(16 * S)),
        ],
        fill=color,
    )


def pill(draw: ImageDraw.ImageDraw, box, text: str, color: str):
    rounded(draw, box, 20, "#FFFFFF", color, 2)
    center_text(draw, text, box, F_BADGE, color, 0)


def generate_png() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (W, H), "#FFFFFF")
    draw = ImageDraw.Draw(img)
    draw_gradient(draw)

    # Header
    rounded(draw, (70, 58, 1530, 190), 30, "#FFFFFF", "#D8E2F0", 2)
    draw.text((int(102 * S), int(78 * S)), "智能三维教学演示系统架构与实现路线", font=F_TITLE, fill=COLORS["ink"])
    draw.text(
        (int(106 * S), int(142 * S)),
        "Web前端一体化架构 | React + TypeScript + Vite | Three.js 三维渲染 | MediaPipe 手势识别 | 语音控制与大模型服务",
        font=F_SUB,
        fill=COLORS["muted"],
    )

    # Architecture layers
    layer_y = 250
    layer_h = 262
    xs = [70, 378, 686, 994, 1302]
    titles = ["用户输入层", "感知控制层", "状态管理层", "渲染交互层", "AI服务层"]
    badges = ["Input", "Perception", "State", "Render", "AI"]
    colors = [COLORS["blue"], COLORS["cyan"], COLORS["green"], COLORS["amber"], COLORS["violet"]]
    line_sets = [
        ["教学需求输入", "摄像头手势信号", "中文语音指令", "GLB/GLTF/FBX模型导入"],
        ["MediaPipe手部关键点", "语音识别与意图解析", "高频控制信号优化", "无接触交互映射"],
        ["React界面状态", "模型姿态与教学场景", "Agent任务流状态", "演示步骤与反馈记录"],
        ["Three.js三维可视化", "旋转、缩放、拖拽", "分层拆解与复位", "标签标注与动态演示"],
        ["大模型能力调用", "教学讲解文本生成", "课堂总结与建议", "多智能体协同调度"],
    ]
    for x, title, badge, color, lines in zip(xs, titles, badges, colors, line_sets):
        card(draw, (x, layer_y, x + 250, layer_y + layer_h), title, lines, color, badge)
    for x in [320, 628, 936, 1244]:
        arrow(draw, (x, layer_y + 132), (x + 55, layer_y + 132))

    # Agent workflow
    rounded(draw, (70, 610, 1530, 990), 24, "#F8FBFF", "#CFDAEA", 2)
    draw.text((int(100 * S), int(642 * S)), "多智能体协同闭环", font=F_SECTION, fill=COLORS["ink"])
    draw.text(
        (int(100 * S), int(684 * S)),
        "通过“需求理解 - 演示执行 - 效果反馈”流程，将课堂指令转化为可视化教学演示与学习建议。",
        font=F_SUB,
        fill=COLORS["muted"],
    )

    agent_boxes = [
        (140, 740, 445, 910, "理解规划Agent", ["分析教学需求", "生成演示方案", "规划讲解顺序"], COLORS["blue"]),
        (545, 740, 850, 910, "演示执行Agent", ["调用模型资源", "控制视角切换", "完成缩放旋转"], COLORS["amber"]),
        (950, 740, 1255, 910, "学情评估Agent", ["生成课堂总结", "输出学习建议", "反馈教学效果"], COLORS["green"]),
    ]
    for x1, y1, x2, y2, title, lines, color in agent_boxes:
        rounded(draw, (x1, y1, x2, y2), 20, "#FFFFFF", "#D5DEEA", 2)
        rounded(draw, (x1, y1, x2, y1 + 12), 20, color)
        draw.text((int((x1 + 26) * S), int((y1 + 28) * S)), title, font=F_CARD_TITLE, fill=COLORS["ink"])
        yy = y1 + 78
        for line in lines:
            draw.text((int((x1 + 36) * S), int(yy * S)), "· " + line, font=F_BODY, fill=COLORS["slate"])
            yy += 34
    arrow(draw, (448, 825), (540, 825), COLORS["line"], 5)
    arrow(draw, (853, 825), (945, 825), COLORS["line"], 5)
    arrow(draw, (1258, 825), (1380, 825), COLORS["line"], 5)
    draw.text((int(1392 * S), int(796 * S)), "反馈迭代", font=F_BODY, fill=COLORS["muted"])
    draw.text((int(1268 * S), int(882 * S)), "形成课堂效果回流", font=F_SMALL, fill=COLORS["muted"])

    # Core modules
    rounded(draw, (70, 1070, 1530, 1390), 24, "#FFFFFF", "#D5DEEA", 2)
    draw.text((int(100 * S), int(1102 * S)), "核心功能模块", font=F_SECTION, fill=COLORS["ink"])
    modules = [
        ("3D模型资源库", "多学科模型展示\nGLB / GLTF / FBX导入", COLORS["blue"]),
        ("三维交互模块", "旋转、缩放、拖拽\n拆解与复位", COLORS["amber"]),
        ("手势识别模块", "摄像头识别关键点\n无接触操控", COLORS["cyan"]),
        ("语音控制模块", "中文课堂指令识别\n触发功能调用", COLORS["rose"]),
        ("AI讲解模块", "自动讲解文本\n课堂总结建议", COLORS["violet"]),
    ]
    mx = [116, 410, 704, 998, 1292]
    for x, (title, body, color) in zip(mx, modules):
        rounded(draw, (x, 1160, x + 230, 1330), 18, "#F8FAFC", "#D5DEEA", 2)
        draw.ellipse(
            (int((x + 24) * S), int(1188 * S), int((x + 62) * S), int(1226 * S)),
            fill=color,
        )
        draw.text((int((x + 76) * S), int(1185 * S)), title, font=F_BADGE, fill=COLORS["ink"])
        center_text(draw, body, (x + 20, 1232, x + 210, 1310), F_SMALL, COLORS["slate"], 8)

    # Technical route
    rounded(draw, (70, 1455, 1530, 1850), 24, "#F8FBFF", "#CFDAEA", 2)
    draw.text((int(100 * S), int(1487 * S)), "技术路线及实现原理", font=F_SECTION, fill=COLORS["ink"])
    techs = [
        ("React状态管理", "统一界面数据、模型状态与演示步骤"),
        ("Three.js渲染", "完成三维模型加载、材质、相机与交互"),
        ("MediaPipe识别", "实时提取手部关键点并映射控制指令"),
        ("语音 + 大模型", "理解自然课堂指令并生成讲解内容"),
        ("浏览器运行", "轻量化部署，普通设备可稳定使用"),
    ]
    tx = 118
    for i, (title, desc) in enumerate(techs, 1):
        rounded(draw, (tx, 1570, tx + 240, 1748), 18, "#FFFFFF", "#D5DEEA", 2)
        draw.ellipse((int((tx + 18) * S), int(1590 * S), int((tx + 58) * S), int(1630 * S)), fill=colors[(i - 1) % len(colors)])
        center_text(draw, str(i), (tx + 18, 1590, tx + 58, 1630), F_BADGE, "#FFFFFF", 0)
        draw.text((int((tx + 72) * S), int(1586 * S)), title, font=F_BADGE, fill=COLORS["ink"])
        for j, line in enumerate(wrap_cn(desc, 13)):
            draw.text((int((tx + 28) * S), int((1645 + j * 27) * S)), line, font=F_SMALL, fill=COLORS["slate"])
        if i < len(techs):
            arrow(draw, (tx + 248, 1660), (tx + 292, 1660), COLORS["line"], 4)
        tx += 290
    draw.text(
        (int(100 * S), int(1800 * S)),
        "适配地球结构、地形地貌等教学场景：分层模型 + 标签标注 + 动态演示，提升课堂可视化与交互体验。",
        font=F_SUB,
        fill=COLORS["muted"],
    )

    # Subtle vertical connectors between sections
    vertical_arrow(draw, (800, 520), (800, 605), "#B8C5D6", 4)
    vertical_arrow(draw, (800, 992), (800, 1065), "#B8C5D6", 4)
    vertical_arrow(draw, (800, 1392), (800, 1450), "#B8C5D6", 4)

    img.save(PNG_PATH, quality=95)


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def svg_text(x, y, text, size=18, weight=400, fill="#172033", anchor="start"):
    return (
        f'<text x="{x}" y="{y}" font-family="Microsoft YaHei, SimHei, Arial" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(text)}</text>'
    )


def generate_svg() -> None:
    # Compact editable companion source. The PNG is the polished final artwork.
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        "<defs>",
        '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F8FF"/><stop offset="1" stop-color="#FDFEFE"/></linearGradient>',
        '<marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill="#8EA2BC"/></marker>',
        "</defs>",
        '<rect width="3200" height="2000" fill="url(#bg)"/>',
        '<rect x="140" y="116" width="2920" height="264" rx="60" fill="#FFFFFF" stroke="#D8E2F0" stroke-width="4"/>',
        svg_text(204, 168, "智能三维教学演示系统架构与实现路线", 92, 700),
        svg_text(212, 284, "Web前端一体化架构 | React + TypeScript + Vite | Three.js 三维渲染 | MediaPipe 手势识别 | 语音控制与大模型服务", 40, 400, "#667085"),
    ]
    layer_names = ["用户输入层", "感知控制层", "状态管理层", "渲染交互层", "AI服务层"]
    layer_desc = [
        "教学需求、手势信号、语音指令、模型导入",
        "关键点识别、意图解析、控制映射",
        "界面数据、模型姿态、任务流状态",
        "三维渲染、交互操作、动态演示",
        "讲解生成、总结建议、多智能体调度",
    ]
    layer_colors = ["#2563EB", "#0891B2", "#16A34A", "#D97706", "#7C3AED"]
    for i, (name, desc, color) in enumerate(zip(layer_names, layer_desc, layer_colors)):
        x = 140 + i * 616
        parts += [
            f'<rect x="{x}" y="500" width="500" height="520" rx="36" fill="#FFFFFF" stroke="#D5DEEA" stroke-width="4"/>',
            f'<rect x="{x}" y="500" width="500" height="22" rx="18" fill="{color}"/>',
            svg_text(x + 48, 566, name, 48, 700),
            svg_text(x + 48, 650, desc, 34, 400, "#475569"),
        ]
        if i < 4:
            parts.append(f'<line x1="{x+500}" y1="764" x2="{x+606}" y2="764" stroke="#8EA2BC" stroke-width="8" marker-end="url(#arrow)"/>')
    parts += [
        '<rect x="140" y="1220" width="2920" height="560" rx="48" fill="#F8FBFF" stroke="#CFDAEA" stroke-width="4"/>',
        svg_text(200, 1304, "多智能体协同闭环", 48, 700),
        svg_text(200, 1388, "需求理解 - 演示执行 - 效果反馈，将课堂指令转化为可视化教学演示与学习建议。", 40, 400, "#667085"),
    ]
    agents = ["理解规划Agent", "演示执行Agent", "学情评估Agent"]
    agent_desc = ["分析教学需求，生成演示方案", "调用模型资源，控制视角切换", "生成课堂总结，输出学习建议"]
    for i, (name, desc) in enumerate(zip(agents, agent_desc)):
        x = 280 + i * 810
        parts += [
            f'<rect x="{x}" y="1480" width="610" height="220" rx="36" fill="#FFFFFF" stroke="#D5DEEA" stroke-width="4"/>',
            svg_text(x + 48, 1554, name, 44, 700),
            svg_text(x + 48, 1638, desc, 34, 400, "#475569"),
        ]
        if i < 2:
            parts.append(f'<line x1="{x+610}" y1="1588" x2="{x+790}" y2="1588" stroke="#8EA2BC" stroke-width="8" marker-end="url(#arrow)"/>')
    parts.append("</svg>")
    SVG_PATH.write_text("\n".join(parts), encoding="utf-8")


if __name__ == "__main__":
    generate_png()
    print(PNG_PATH)
