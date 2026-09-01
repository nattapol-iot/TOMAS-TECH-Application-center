import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader

source = Path(sys.argv[1])
output = Path(sys.argv[2])
pdftoppm = Path(sys.argv[3])
output.mkdir(parents=True, exist_ok=True)
records = []
rendered = []

for file_index, pdf_path in enumerate(sorted(source.glob("*.pdf")), start=1):
    reader = PdfReader(str(pdf_path))
    pages = []
    prefix = output / f"{file_index:02d}"
    subprocess.run([str(pdftoppm), "-png", "-r", "120", str(pdf_path), str(prefix)], check=True, capture_output=True)
    page_images = sorted(output.glob(f"{file_index:02d}-*.png"))
    for page_index, page in enumerate(reader.pages, start=1):
        pages.append({"page": page_index, "text": page.extract_text() or ""})
        if page_index <= len(page_images):
            rendered.append({"file": pdf_path.name, "page": page_index, "path": page_images[page_index - 1]})
    records.append({"file": pdf_path.name, "pages": pages})

(output / "extracted.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

thumb_width = 700
thumb_height = 920
label_height = 54
per_sheet = 4
for sheet_index in range(math.ceil(len(rendered) / per_sheet)):
    batch = rendered[sheet_index * per_sheet:(sheet_index + 1) * per_sheet]
    canvas = Image.new("RGB", (thumb_width * 2, (thumb_height + label_height) * 2), "white")
    draw = ImageDraw.Draw(canvas)
    for index, entry in enumerate(batch):
        image = Image.open(entry["path"]).convert("RGB")
        image.thumbnail((thumb_width - 20, thumb_height - 20))
        column = index % 2
        row = index // 2
        x = column * thumb_width + (thumb_width - image.width) // 2
        y = row * (thumb_height + label_height) + label_height
        canvas.paste(image, (x, y))
        draw.text((column * thumb_width + 10, row * (thumb_height + label_height) + 12), f'{entry["file"]} - page {entry["page"]}', fill="black")
    canvas.save(output / f"contact-{sheet_index + 1:02d}.jpg", quality=88)

print(json.dumps({"files": len(records), "pages": len(rendered), "contacts": math.ceil(len(rendered) / per_sheet)}))
