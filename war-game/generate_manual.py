# War Game — Instruction Manual generator
# Builds a 4-page A5-ish pamphlet PDF styled like a 1990s game manual.

import math
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor

OUT = r"C:\Users\oscil\demandingradio.github.io\war-game\war-game-manual.pdf"

# Pamphlet size — half-letter, 5.5" x 8.5"
PW = 5.5 * inch
PH = 8.5 * inch
ML = 0.5 * inch
MR = 0.5 * inch
MT = 0.55 * inch
MB = 0.55 * inch

# Palette
CREAM      = HexColor("#f3e9c8")
PAPER_DARK = HexColor("#e7d6a2")
INK        = HexColor("#1f1808")
ACCENT     = HexColor("#8d2424")
SUBTLE     = HexColor("#5d4520")

c = canvas.Canvas(OUT, pagesize=(PW, PH))


def paint_paper():
    c.setFillColor(CREAM)
    c.rect(0, 0, PW, PH, fill=1, stroke=0)
    # Faint speckle: scatter a few dots for "old paper" feel
    import random
    random.seed(42)
    c.setFillColor(PAPER_DARK)
    for _ in range(160):
        x = random.uniform(0, PW)
        y = random.uniform(0, PH)
        r = random.uniform(0.1, 0.5)
        c.circle(x, y, r, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setStrokeColor(INK)


def page_borders():
    # Inner thicker rule
    c.setStrokeColor(INK)
    c.setLineWidth(2.0)
    c.rect(0.32 * inch, 0.32 * inch, PW - 0.64 * inch, PH - 0.64 * inch, fill=0)
    # Outer thin rule
    c.setLineWidth(0.5)
    c.rect(0.24 * inch, 0.24 * inch, PW - 0.48 * inch, PH - 0.48 * inch, fill=0)


def draw_hex(cx, cy, size, fill=0, stroke=1, lw=1.0):
    p = c.beginPath()
    for i in range(6):
        ang = math.radians(60 * i - 30)
        x = cx + size * math.cos(ang)
        y = cy + size * math.sin(ang)
        if i == 0:
            p.moveTo(x, y)
        else:
            p.lineTo(x, y)
    p.close()
    c.setLineWidth(lw)
    c.drawPath(p, fill=fill, stroke=stroke)


def crossed_swords(cx, cy, length):
    # Two swords crossed in an X
    c.setStrokeColor(INK)
    c.setLineCap(1)  # round
    # Sword 1: NW to SE
    c.setLineWidth(8)
    c.line(cx - length, cy - length, cx + length, cy + length)
    c.setLineWidth(8)
    c.line(cx - length, cy + length, cx + length, cy - length)
    # Blade highlight (lighter centre line)
    c.setStrokeColor(CREAM)
    c.setLineWidth(2)
    c.line(cx - length, cy - length, cx + length, cy + length)
    c.line(cx - length, cy + length, cx + length, cy - length)
    c.setStrokeColor(INK)
    # Pommels — circles at the four ends
    c.setLineWidth(2)
    c.setFillColor(INK)
    for ex, ey in [
        (cx - length, cy - length),
        (cx + length, cy + length),
        (cx - length, cy + length),
        (cx + length, cy - length),
    ]:
        c.circle(ex, ey, 5, fill=1, stroke=1)
    # Hilt guards near the centre
    c.setLineCap(0)
    c.setLineWidth(4)
    # crossguard 1 (perpendicular to sword 1 at center)
    g = 14
    c.line(cx - g * math.cos(math.radians(45 + 90)),
           cy - g * math.sin(math.radians(45 + 90)),
           cx + g * math.cos(math.radians(45 + 90)),
           cy + g * math.sin(math.radians(45 + 90)))
    c.line(cx - g * math.cos(math.radians(-45 + 90)),
           cy - g * math.sin(math.radians(-45 + 90)),
           cx + g * math.cos(math.radians(-45 + 90)),
           cy + g * math.sin(math.radians(-45 + 90)))
    c.setLineCap(1)


def hrule(y, x0=None, x1=None, weight=1.0, dotted=False):
    if x0 is None: x0 = ML
    if x1 is None: x1 = PW - MR
    c.setStrokeColor(INK)
    c.setLineWidth(weight)
    if dotted:
        c.setDash(2, 3)
    else:
        c.setDash()
    c.line(x0, y, x1, y)
    c.setDash()


def section_header(title, page_num, total=4):
    # Dark band at top
    band_h = 0.42 * inch
    band_y = PH - MT - band_h + 0.05 * inch
    c.setFillColor(INK)
    c.rect(ML, band_y, PW - ML - MR, band_h, fill=1, stroke=0)
    # Title in cream
    c.setFillColor(CREAM)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(ML + 0.18 * inch, band_y + 0.14 * inch, title.upper())
    # Page indicator on right of band
    c.setFont("Helvetica", 8)
    c.drawRightString(PW - MR - 0.18 * inch, band_y + 0.15 * inch,
                      "PAGE %d / %d" % (page_num, total))
    # Restore ink for body
    c.setFillColor(INK)


def page_footer(page_num):
    c.setFont("Helvetica-Oblique", 9)
    c.setFillColor(SUBTLE)
    c.drawCentredString(PW / 2, MB - 0.18 * inch, "—  %d  —" % page_num)
    c.setFillColor(INK)


def wrap_paragraph(text, x, y, width, font="Times-Roman", size=10, leading=13.5):
    """Simple word-wrap. Returns y after drawing."""
    c.setFont(font, size)
    words = text.split()
    line = ""
    cy = y
    for w in words:
        trial = (line + " " + w).strip()
        tw = c.stringWidth(trial, font, size)
        if tw <= width:
            line = trial
        else:
            c.drawString(x, cy, line)
            cy -= leading
            line = w
    if line:
        c.drawString(x, cy, line)
        cy -= leading
    return cy


# ============================================================
# PAGE 1 — COVER
# ============================================================

paint_paper()

# Outer double border
c.setStrokeColor(INK)
c.setLineWidth(3.0)
c.rect(0.28 * inch, 0.28 * inch, PW - 0.56 * inch, PH - 0.56 * inch, fill=0)
c.setLineWidth(0.7)
c.rect(0.42 * inch, 0.42 * inch, PW - 0.84 * inch, PH - 0.84 * inch, fill=0)

# Top decorative band
band_top_y = PH - 0.85 * inch
c.setFillColor(INK)
c.rect(0.5 * inch, band_top_y, PW - 1.0 * inch, 0.35 * inch, fill=1, stroke=0)
c.setFillColor(CREAM)
c.setFont("Helvetica-Bold", 11)
c.drawCentredString(PW / 2, band_top_y + 0.11 * inch, "MONDAY  JEFFREY  ENTERTAINMENT")

# Title
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 56)
c.drawCentredString(PW / 2, PH - 2.05 * inch, "WAR")
c.drawCentredString(PW / 2, PH - 2.95 * inch, "GAME")

# Tiny hex decorations either side of title
draw_hex(PW / 2 - 1.85 * inch, PH - 2.55 * inch, 14, stroke=1, lw=1.5)
draw_hex(PW / 2 + 1.85 * inch, PH - 2.55 * inch, 14, stroke=1, lw=1.5)
draw_hex(PW / 2 - 1.85 * inch, PH - 2.55 * inch, 6, stroke=1, lw=1)
draw_hex(PW / 2 + 1.85 * inch, PH - 2.55 * inch, 6, stroke=1, lw=1)

# Subtitle
c.setFont("Helvetica-Oblique", 14)
c.drawCentredString(PW / 2, PH - 3.4 * inch, "An Infinite Hex Conflict")

# Decorative rules above and below subtitle area
hrule(PH - 3.18 * inch, x0=ML + 0.4 * inch, x1=PW - MR - 0.4 * inch, weight=0.6)
hrule(PH - 3.62 * inch, x0=ML + 0.4 * inch, x1=PW - MR - 0.4 * inch, weight=0.6)

# Crossed swords centerpiece
crossed_swords(PW / 2, PH - 4.85 * inch, 0.7 * inch)

# A hexagon ring around the swords
for i in range(6):
    ang = math.radians(60 * i)
    rx = PW / 2 + 1.35 * inch * math.cos(ang)
    ry = (PH - 4.85 * inch) + 1.35 * inch * math.sin(ang)
    draw_hex(rx, ry, 8, stroke=1, lw=0.6)

# Tagline ribbon
c.setFillColor(ACCENT)
ribbon_y = 2.0 * inch
c.rect(ML + 0.2 * inch, ribbon_y, PW - ML - MR - 0.4 * inch, 0.42 * inch, fill=1, stroke=0)
c.setFillColor(CREAM)
c.setFont("Helvetica-Bold", 16)
c.drawCentredString(PW / 2, ribbon_y + 0.13 * inch, "★  INSTRUCTION MANUAL  ★")

# Player line
c.setFillColor(INK)
c.setFont("Helvetica", 10)
c.drawCentredString(PW / 2, 1.45 * inch, "For Monday Jeffrey  ™  ·  Player 1")

# Faux barcode-y bottom strip
c.setFont("Courier-Bold", 7)
c.drawCentredString(PW / 2, 1.05 * inch, "MJV-0001  ·  v1.1  ·  PRINTED IN AUSTRALIA")
# tiny barcode lines
bx = PW / 2 - 0.7 * inch
by = 0.78 * inch
for i, w in enumerate([1, 2, 1, 3, 1, 1, 2, 1, 1, 3, 1, 2, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 1]):
    c.setFillColor(INK)
    c.rect(bx, by, w * 0.9, 0.18 * inch, fill=1, stroke=0)
    bx += w * 0.9 + 1.0

c.showPage()


# ============================================================
# PAGE 2 — THE WORLD & THE FACTIONS
# ============================================================

paint_paper()
page_borders()
section_header("The World & Factions", 2)
content_top = PH - MT - 0.55 * inch

# Intro paragraph
c.setFillColor(INK)
y = content_top
y = wrap_paragraph(
    "The world is infinite. Drag the map in any direction and new lands "
    "unfold — rolling plains, jagged mountains, still lakes, and the deep "
    "blue boundary of the open sea. Three rival warlords share this realm "
    "with you, each carving an empire out of unclaimed neutral ground. "
    "Only one of you will rule what remains.",
    ML + 0.1 * inch, y, PW - ML - MR - 0.2 * inch,
    font="Times-Roman", size=10.5, leading=14)
y -= 0.08 * inch

# Section title
c.setFont("Helvetica-Bold", 12)
c.drawString(ML + 0.1 * inch, y, "THE FOUR WARLORDS")
y -= 0.14 * inch
hrule(y, weight=0.7)
y -= 0.18 * inch

# Faction profiles
FACTIONS = [
    ("YOU",     HexColor("#4d8fd6"), "The Player",
     "Strategy is yours. You begin with a seven-hex capital "
     "and four units of cavalry on each tile. From this small kingdom you "
     "must do what your enemies cannot — choose."),
    ("CRIMSON", HexColor("#d24a4a"), "The Expansionist",
     "Sprawls in every direction. Acts every 1.8 seconds, up to three "
     "moves at once, and will throw a stack at any target it can plausibly "
     "win. Crimson is everywhere — and thinnest where you need to look."),
    ("VERDANT", HexColor("#4ab85e"), "The Balanced",
     "Methodical and patient. Acts once every 3.5 seconds. Prefers "
     "stable borders and quietly accumulates strength. Outpaces nothing but "
     "outlasts almost everything."),
    ("VIOLET",  HexColor("#a05cc8"), "The Strategist",
     "Tactical, fast, and frightening. Acts every 1.4 seconds — but only "
     "attacks when victory is certain. Stops at fourteen hexes and turtles "
     "behind mountains and shorelines. Do not let her finish her wall."),
]

for name, col, role, body in FACTIONS:
    # Color swatch
    sx, sy = ML + 0.12 * inch, y - 0.04 * inch
    c.setFillColor(col)
    c.rect(sx, sy - 0.12 * inch, 0.32 * inch, 0.24 * inch, fill=1, stroke=0)
    c.setStrokeColor(INK)
    c.setLineWidth(0.7)
    c.rect(sx, sy - 0.12 * inch, 0.32 * inch, 0.24 * inch, fill=0, stroke=1)
    # Name
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(sx + 0.42 * inch, y - 0.02 * inch, name + "  ·  " + role)
    # Body
    y2 = wrap_paragraph(body,
                        sx + 0.42 * inch, y - 0.18 * inch,
                        PW - MR - sx - 0.5 * inch,
                        font="Times-Roman", size=9.5, leading=12)
    y = y2 - 0.06 * inch

# Bottom victory/defeat box
box_h = 0.7 * inch
box_y = MB + 0.05 * inch
c.setFillColor(INK)
c.rect(ML + 0.05 * inch, box_y, PW - ML - MR - 0.1 * inch, box_h, fill=1, stroke=0)
c.setFillColor(CREAM)
c.setFont("Helvetica-Bold", 11)
c.drawCentredString(PW / 2, box_y + box_h - 0.2 * inch, "VICTORY  ·  DEFEAT")
c.setFont("Helvetica-Oblique", 9.5)
c.drawCentredString(PW / 2, box_y + box_h - 0.36 * inch,
                    "Capture the crowned hex at the centre of an enemy")
c.drawCentredString(PW / 2, box_y + box_h - 0.5 * inch,
                    "capital to eliminate them. Lose yours, and you fall.")

c.setFillColor(INK)
page_footer(2)
c.showPage()


# ============================================================
# PAGE 3 — HOW TO PLAY
# ============================================================

paint_paper()
page_borders()
section_header("How To Play", 3)

y = PH - MT - 0.55 * inch

# Controls table
c.setFont("Helvetica-Bold", 12)
c.drawString(ML + 0.1 * inch, y, "CONTROLS")
y -= 0.14 * inch
hrule(y, weight=0.7)
y -= 0.04 * inch

controls = [
    ("Click your hex",       "Select a source"),
    ("Click any other hex",  "Dispatch a march (up to 30 hexes away)"),
    ("Drag the map",         "Pan the view"),
    ("Mouse wheel / pinch",  "Zoom in and out"),
    ("+  /  −",              "Zoom by keystroke"),
    ("B",                    "Toggle road build mode"),
    ("F",                    "Toggle fog of war"),
    ("P  /  Space",          "Pause (30 s, 5 min cooldown)"),
    ("Esc",                  "Clear selection or exit build mode"),
]
c.setFont("Courier-Bold", 9)
left_col_x = ML + 0.18 * inch
right_col_x = ML + 1.85 * inch
for key, action in controls:
    y -= 0.18 * inch
    c.setFont("Courier-Bold", 9.5)
    c.drawString(left_col_x, y, key)
    c.setFont("Times-Roman", 10)
    c.drawString(right_col_x, y, action)

# Marches
y -= 0.32 * inch
c.setFont("Helvetica-Bold", 12)
c.drawString(ML + 0.1 * inch, y, "MARCHES")
y -= 0.14 * inch
hrule(y, weight=0.7)
y -= 0.04 * inch

y = wrap_paragraph(
    "Selecting your hex and then clicking a destination dispatches half "
    "your troops along the shortest path through known passable land. "
    "When the column enters an enemy or neutral hex it gives battle. If "
    "it prevails it leaves a single garrison troop and presses on with "
    "the survivors. If it falls, the defenders gain that ground.",
    ML + 0.18 * inch, y - 0.14 * inch, PW - ML - MR - 0.36 * inch,
    font="Times-Roman", size=10, leading=13.5)

y = wrap_paragraph(
    "Movement is timed. A march steps once every 2.2 seconds across "
    "plains and once every 5.7 seconds through mountain country. Where "
    "you have built roads on both ends of a step the time drops to "
    "around 0.9 seconds. Water always blocks.",
    ML + 0.18 * inch, y - 0.05 * inch, PW - ML - MR - 0.36 * inch,
    font="Times-Roman", size=10, leading=13.5)

# Building
y -= 0.05 * inch
c.setFont("Helvetica-Bold", 12)
c.drawString(ML + 0.1 * inch, y, "BUILDING")
y -= 0.14 * inch
hrule(y, weight=0.7)
y -= 0.04 * inch

builds = [
    ("Road",     "6 gold",  "Cuts march time across your network."),
    ("Farm",     "10 gold", "+50% troop production on this hex."),
    ("Fortress", "15 gold", "+50% defender strength on this hex."),
    ("Tower",    "8 gold",  "+2 hex vision range when fog is enabled."),
]
for label, cost, what in builds:
    y -= 0.17 * inch
    c.setFont("Helvetica-Bold", 10)
    c.drawString(ML + 0.18 * inch, y, label)
    c.setFont("Courier-Bold", 9)
    c.drawString(ML + 0.95 * inch, y, cost)
    c.setFont("Times-Roman", 10)
    c.drawString(ML + 1.55 * inch, y, what)

page_footer(3)
c.showPage()


# ============================================================
# PAGE 4 — STRATEGY & FEATURES
# ============================================================

paint_paper()
page_borders()
section_header("Strategy & Features", 4)

y = PH - MT - 0.55 * inch

def small_section(title, items):
    global y
    # Drop noticeable space before drawing title so descenders clear
    y -= 0.20 * inch
    c.setFont("Helvetica-Bold", 11)
    c.drawString(ML + 0.1 * inch, y, title)
    y -= 0.11 * inch
    hrule(y, weight=0.55)
    y -= 0.10 * inch
    for it in items:
        y -= 0.18 * inch
        c.setFont("Times-Roman", 9.8)
        c.setFillColor(ACCENT)
        c.circle(ML + 0.2 * inch, y + 0.04 * inch, 1.6, fill=1, stroke=0)
        c.setFillColor(INK)
        c.drawString(ML + 0.3 * inch, y, it)

small_section("TERRAIN", [
    "Plains  ·  +1 troop per tick, normal march speed.",
    "Mountains  ·  +1 every 5 ticks, 2.6× slower, +35% defender.",
    "Lakes & Oceans  ·  impassable. Use them as natural walls.",
])

small_section("DEVELOPMENT  (LEVELS 1 – 10)", [
    "A held hex levels up roughly every 30 seconds.",
    "Level 10 produces five times what a Level 1 hex does.",
    "Captured hexes reset to Level 1 and lose any improvement.",
])

small_section("CAPITALS  &  GOLD", [
    "A capital is a seven-hex cluster with a crowned centre.",
    "Capital hexes earn +1 production and defend at +50%.",
    "Roughly one in twenty-eight passable hexes is a gold mine.",
    "Owning a mine earns gold per tick — spend it on improvements.",
])

small_section("UPKEEP & FOG", [
    "Armies above an average of 25 troops per hex begin to drain.",
    "Each 10 troops of excess costs 1 troop per tick.",
    "With Fog of War on, only your vision is yours to plan in.",
    "Towers extend sight; capitals see two hexes in every direction.",
])

# Tips box
tips_top = y - 0.05 * inch
tips_h = 1.55 * inch
tips_y = tips_top - tips_h
c.setFillColor(INK)
c.rect(ML + 0.05 * inch, tips_y, PW - ML - MR - 0.1 * inch, tips_h, fill=1, stroke=0)
c.setFillColor(CREAM)
c.setFont("Helvetica-Bold", 11)
c.drawString(ML + 0.2 * inch, tips_y + tips_h - 0.22 * inch, "★ TIPS FROM AN OLD GENERAL")
c.setFont("Times-Italic", 9.8)
tip_lines = [
    "“Crimson will overextend — pick his frontier hexes off",
    "  one by one. He won't notice the holes until it's too late.”",
    "“Violet is dangerous only if you let her settle. Strike",
    "  before she finishes her fortress.”",
    "“One Level 10 hex out-produces a sprawl of Level 1 land.”",
    "“When in doubt, build a road.”",
]
ty = tips_y + tips_h - 0.42 * inch
for line in tip_lines:
    c.drawString(ML + 0.25 * inch, ty, line)
    ty -= 0.16 * inch

c.setFillColor(INK)
page_footer(4)
c.showPage()


c.save()
print("Wrote", OUT)
