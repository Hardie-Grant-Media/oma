"""Generate invented visual evidence, never a real brand capture."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

out = Path("output/pdf/synthetic-second-helping.pdf")
out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=(900, 700))
c.setTitle("Synthetic Second Helping website fixtures")
style = ParagraphStyle("body", fontName="Helvetica", fontSize=14, leading=22, textColor=HexColor("#333333"))

def para(text, x, top, width, size=14):
    s = ParagraphStyle("p", parent=style, fontSize=size, leading=size*1.5)
    p = Paragraph(text, s)
    _, h = p.wrap(width, 600)
    p.drawOn(c, x, top-h)
    return top-h

pages = [
    ("Home", "2026-08-31", "Good food.<br/>Less waste.", "Turn what you have into dinner. Simple, low-waste recipes for busy city kitchens.", "ONE INGREDIENT / THREE MEALS", "Pumpkin, again.", "One roast pumpkin becomes a tray bake, tomorrow's soup and a warm grain bowl.", "Find a recipe", "Recipes / Use it up / Learn / About", "Filters: ingredient, time, servings, dietary needs."),
    ("Recipe", "2026-08-04 | Reviewed 2026-08-18", "Pumpkin.<br/>Three ways.", "By Maya Chen, recipe developer (fictional). Tested twice in our home kitchen.", "ONE INGREDIENT / THREE MEALS", "Cook once. Help yourself twice.", "Serves 2. Prep 10 min. Cook 25 min. 400g pumpkin, 240g drained chickpeas, 1 tbsp oil. Roast evenly cut pumpkin at 200C until tender; add chickpeas.", "Print recipe", "Recipe / Ingredients / Method / Use it up", "Refrigerate leftovers promptly. Cost estimate is a dated sample, not a savings promise. Freezing untested."),
    ("Use it up", "2026-08-12 | Tested 2026-08-10", "Soft tomatoes?<br/>Tonight's sauce.", "By Maya Chen, recipe developer (fictional). Inspect first; discard mouldy produce.", "USE IT UP", "A second helping starts here.", "400g tomatoes. 20 minutes. Serves 2. Chop, simmer and season. No blender needed. Texture varies with ripeness.", "Save recipe", "Recipe / Ingredients / Method / Use it up", "Alternative: crush with a fork. No save counts, traffic or conversion data are supplied."),
    ("About", "2026-08-20", "Small steps.<br/>Second helpings.", "We help home cooks make another meal from ingredients already in the fridge. Nobody needs a perfect kitchen.", "OUR EDITORIAL PROMISE", "Test. Label. Correct.", "Recipes are cooked twice. Substitutions are marked tested or untested. Our fictional team claims cooking experience, not nutrition qualifications.", "Contact the editors", "About / Team / Corrections / Sponsorship", "Correction 2026-08-19: soup stock changed from 800ml to 600ml. Paid partnerships are labelled; sponsors do not control tests."),
    ("Learn", "2026-08-26", "A calmer<br/>Sunday prep.", "Start small: one tray of vegetables, one pot of grains, two labelled containers.", "SMALL STEPS", "Dinner needn't start over.", "A 30-minute checklist and shopping list for two. Low-energy option: choose one step. Share an untested substitution with the editors.", "View checklist", "Learn / Plan / Checklist / Substitutions", "Give yesterday's ingredients a second helping. No published community contribution or engagement result is shown."),
    ("Archive context", "2026-07-07 | 2026-07-21", "Bread, again.<br/>Then greens.", "Invented prior-month context only. July pages are outside the August scoring period and support limited recurrence context, not August performance.", "ONE INGREDIENT / THREE MEALS", "A repeatable idea.", "July 7: leftover bread becomes crumbs, toast and a savoury pudding. July 21: wilted greens become soup, a grain bowl and a pan filling. Both by Maya Chen, tested twice, with substitutions labelled.", "Browse archive", "Recipes / Use it up / Learn / About", "Only these two July archive entries and five August pages are supplied. No complete publishing history or measured audience effect is established."),
]
for i, (kind, date, heading, intro, label, title, body, action, nav, note) in enumerate(pages, 1):
    c.setFillColor(HexColor("#ffffff")); c.rect(0, 0, 900, 700, fill=1, stroke=0)
    c.setFillColor(HexColor("#111111")); c.rect(0, 671, 900, 29, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica", 10)
    c.drawString(35, 681, f"SYNTHETIC FIXTURE / FICTIONAL BRAND / NOT A LIVE WEBSITE CAPTURE / PAGE {i}")
    c.setFillColor(HexColor("#111111")); c.setFont("Helvetica-Bold", 23)
    c.drawString(35, 626, "Second Helping")
    c.setFont("Helvetica", 11); c.drawRightString(865, 630, "Recipes    Use it up    Learn    About")
    c.setStrokeColor(HexColor("#cccccc")); c.line(35, 607, 865, 607)
    c.setFont("Helvetica", 10); c.drawString(35, 583, f"{kind.upper()} / {date}")
    para(heading, 35, 557, 440, 36)
    para(intro, 35, 422, 425)
    c.setFillColor(HexColor("#eeeeee")); c.rect(520, 363, 345, 183, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#111111")); c.setLineWidth(3)
    c.ellipse(570, 398, 675, 503); c.ellipse(704, 415, 774, 485)
    c.line(681, 450, 697, 450); c.line(690, 457, 697, 450); c.line(690, 443, 697, 450)
    para("SECOND HELPING / REPEAT DEVICE", 545, 387, 300, 10)
    c.setFillColor(HexColor("#111111")); c.rect(35, 299, 220, 41, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 12); c.drawString(50, 314, action)
    c.setFillColor(HexColor("#111111")); c.setFont("Helvetica", 10); c.drawString(35, 270, label)
    para(title, 35, 251, 825, 23)
    bottom = para(body, 35, 210, 825)
    para(note, 35, bottom-12, 825, 11)
    c.setStrokeColor(HexColor("#cccccc")); c.line(35, 66, 865, 66)
    c.setFillColor(HexColor("#555555")); c.setFont("Helvetica", 10)
    c.drawString(35, 46, "Second Helping / Good food. Less waste.")
    c.drawRightString(865, 46, "About / Contact / Accessibility / Privacy")
    c.drawString(35, 27, "Invented pages for pipeline QA. Visuals are deliberate fixture design; effectiveness is unknown.")
    c.showPage()
c.save()
print(out)
