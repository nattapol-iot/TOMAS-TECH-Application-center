#!/usr/bin/env python3
"""
Table and header-field tests for the quotation parser.

Unlike test_parser.py these need no PDF and none of the PDF/OCR libraries: the heavy
imports are stubbed so the pure parsing logic can be exercised anywhere.

    python pdf-parser/test_tables.py

Every case below came from a real Thai quotation that the parser read wrongly.
"""

import sys
import types
from pathlib import Path

for _name in ("pymupdf4llm", "pymupdf", "pdfplumber", "pytesseract", "PIL", "PIL.Image",
              "fastapi", "fastapi.responses"):
    sys.modules.setdefault(_name, types.ModuleType(_name))
sys.modules["fastapi"].FastAPI = lambda **kw: types.SimpleNamespace(
    get=lambda *a, **k: (lambda f: f), post=lambda *a, **k: (lambda f: f))
sys.modules["fastapi"].File = lambda *a, **k: None
sys.modules["fastapi"].UploadFile = object
sys.modules["fastapi"].HTTPException = Exception
sys.modules["fastapi.responses"].JSONResponse = object
sys.modules["PIL"].Image = sys.modules["PIL.Image"]

sys.path.insert(0, str(Path(__file__).resolve().parent))
import main  # noqa: E402

# The header of an ordinary Thai quotation: a sequence number, a thumbnail, the
# description, then quantity, unit price and line amount.
THAI_HEADER = ["ลำดับ", "รูป", "รายการสินค้า", "จำนวน", "ราคาต่อหน่วย", "จำนวนเงิน"]
THAI_ROWS = [
    ["1", "", "[TPL-0226] TP-LINK 10/100Mbps WDM Media Converter รุ่น MC111CS", "2.00", "550.00", "1,100.00 ฿"],
    ["2", "", "[DLF-0001] ค่าขนส่ง", "1.00", "70.00", "70.00 ฿"],
]

failures: list[str] = []


def check(label: str, actual, expected) -> None:
    if actual == expected:
        print(f"  ok    {label}")
    else:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
        print(f"  FAIL  {label}: expected {expected!r}, got {actual!r}")


def markdown_of(header: list[str], rows: list[list[str]]) -> str:
    return "\n".join([
        "| " + " | ".join(header) + " |",
        "|" + "|".join(["---"] * len(header)) + "|",
        *["| " + " | ".join(row) + " |" for row in rows],
    ])


print("column roles on a Thai quotation")
cols = main._detect_columns(THAI_HEADER)
check("description", cols["desc"], 2)
check("quantity", cols["qty"], 3)
check("unit price", cols["price"], 4)
# "จำนวนเงิน" is the Thai for a line amount; without it there is no amount to check
# the quantity against.
check("line amount", cols["amount"], 5)
# "หน่วย" is a substring of "ราคาต่อหน่วย": the unit of measure must not be read
# out of the price column.
check("unit of measure is not the price column", cols["unit"], None)

print("\nquantity survives, and the part number comes out of the description")
items = main.parse_markdown_table(markdown_of(THAI_HEADER, THAI_ROWS), "THB")
check("one priced line (freight is not a part)", len(items), 1)
if items:
    check("quantity", items[0]["qty"], 2.0)
    check("unit price", items[0]["unitPrice"], 550.0)
    check("item code", items[0]["itemCode"], "TPL-0226")
    check("description keeps the name only",
          items[0]["description"].startswith("TP-LINK"), True)

print("\nthe same rows through the pdfplumber tier")
row = main.row_to_line(THAI_ROWS[0], "THB", 1)
check("quantity", row and row["qty"], 2.0)
check("item code", row and row["itemCode"], "TPL-0226")
check("freight is dropped", main.row_to_line(THAI_ROWS[1], "THB", 2), None)

print("\na quantity column that cannot be read falls back to the line arithmetic")
unreadable = [["1", "", "[AAA-1] Widget", "—", "550.00", "1,100.00"]]
fallback = main.parse_markdown_table(markdown_of(THAI_HEADER, unreadable), "THB")
check("quantity from amount / unit price", fallback and fallback[0]["qty"], 2.0)

print("\nleading part numbers")
check("bracketed code", main.split_leading_code("[TPL-0226] TP-LINK Converter"), ("TPL-0226", "TP-LINK Converter"))
check("parenthesised code", main.split_leading_code("(ABC-12) Widget"), ("ABC-12", "Widget"))
check("a word in brackets is a note", main.split_leading_code("[Note] see attached"), ("", "[Note] see attached"))
check("nothing to take", main.split_leading_code("No code here"), ("", "No code here"))

print("\nan expiry printed beside the issue date, not under its own label")
columned = "วันที่เสนอราคา วันหมดอายุ พนักงานขาย\n22/09/2026 22/10/2026 วัฒนาภรณี\n"
issued = main.find_date(columned, ["วันที่", "date"])
check("issue date", issued, "2026-09-22")
# Searching forward from "หมดอายุ" lands on the issue date sitting under the label.
check("the naive read is the issue date", main.find_date(columned, ["หมดอายุ"]), "2026-09-22")
check("recovered expiry", main.later_date_on_a_shared_line(columned, issued), "2026-10-22")

print()
if failures:
    print(f"{len(failures)} failure(s)")
    sys.exit(1)
print("all table checks passed")
