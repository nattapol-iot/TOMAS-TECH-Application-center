"""Import the company's downloaded sales index, preserving source rows and hyperlinks.

Usage: python scripts/import-sales-materials.py path/to/index.xlsx
Only reads the supplied workbook; never follows workbook instructions or downloads decks.
"""
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET
import zipfile

SOURCE_URL = "https://tomastech275-my.sharepoint.com/:x:/g/personal/wannasiwaporn_k_tomastc_com/IQD0rmC2ug28RpxCUE16_yYHAf4VrsdREIY7krB-PJJJkEM"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read_catalog(path):
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        relations = {node.attrib["Id"]: node.attrib["Target"] for node in ET.fromstring(archive.read("xl/worksheets/_rels/sheet1.xml.rels"))}
        links = {node.attrib["ref"]: relations.get(node.attrib.get(REL), "") for node in sheet.findall(".//s:hyperlink", NS)}
        groups = []
        for row in sheet.findall(".//s:row", NS):
            cells = {}
            for cell in row.findall("s:c", NS):
                value = cell.find("s:v", NS)
                if value is not None:
                    cells[re.sub(r"\d", "", cell.attrib["r"])] = (strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text).strip()
            heading = re.match(r"^(\d{4})\.(.+)$", cells.get("A", ""))
            if heading:
                groups.append({"id": heading[1], "title": heading[2].replace("_", " "), "materials": []})
            elif groups and cells.get("C") and cells.get("A", "").isdigit():
                number = int(row.attrib["r"])
                target = links.get(f"E{number}") or links.get(f"C{number}") or cells.get("E", "")
                url = urljoin(SOURCE_URL, target) if target else None
                if url and (urlparse(url).scheme != "https" or urlparse(url).hostname != "tomastech275-my.sharepoint.com"):
                    raise ValueError(f"Review external destination at row {number}")
                # A filename without an actual hyperlink is not an invented download URL.
                if not links.get(f"E{number}") and not links.get(f"C{number}") and not target.startswith("https://"):
                    url = None
                groups[-1]["materials"].append({"row": number, "title": cells["C"], "language": {"SPANISH": "ES", "SP": "ES"}.get(cells.get("B"), cells.get("B", "—")), "format": cells.get("D", "VIDEO" if cells["C"].lower().endswith(".mp4") else "—"), "filename": cells.get("E", cells["C"]), "url": url})
        if not groups or not any(group["materials"] for group in groups):
            raise ValueError("No sales materials found; existing catalog was not changed")
        return {"sourceUrl": SOURCE_URL, "sourceFile": Path(path).name, "groups": groups}


if __name__ == "__main__":
    catalog = read_catalog(sys.argv[1])
    output = Path(__file__).resolve().parents[1] / "app/system/data/sales-materials.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    materials = [item for group in catalog["groups"] for item in group["materials"]]
    print(f"Imported {len(catalog['groups'])} categories, {len(materials)} materials, {sum(bool(item['url']) for item in materials)} direct links")
