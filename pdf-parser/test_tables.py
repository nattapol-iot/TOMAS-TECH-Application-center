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

# A stacked table: one line item printed down three rows of one cell.
#
# MiSUMi heads its product column with three sub-labels and puts three values under
# them, so the part number and the brand live inside the cell rather than in columns
# of their own. This is how pdfplumber hands that table over.
MISUMI_TABLE = [
    ["No",
     "Customer Item Reference\nProduct Code\nProduct Name(Brand Name)",
     "Quantity\nExp.\nWeight",
     "Unit Price(THB)\nDiscount Rate\nItem Remarks",
     "Amount(THB)",
     "Leadtime(working days) Incl. Sat/Hols\nEst.Ship Date(Estim.Arrival)\n*Revised Date"],
    ["1\n003119",
     "PJ260160 Meiji Homepro\nE-PF-80-R\nECONOMY FAN ACCESSORY(MISUMI)",
     "8 PCS\n\n200g",
     "55.05",
     "440.40",
     "1day(s)\n10/09/2026(11/09)"],
]

print("\na stacked table is read through its own sub-labels")
stacked_cols = main._detect_columns(MISUMI_TABLE[0])
check("description column", stacked_cols["desc"], 1)
check("quantity column", stacked_cols["qty"], 2)
check("amount column", stacked_cols["amount"], 4)
# "item" and "code" also appear in "Item Remarks" and "Discount Rate"; a column already
# holding the price is not the part number.
check("the price column is not claimed as the item code",
      stacked_cols["code"] in (None, 1), True)

misumi = main.parse_plumber_table(MISUMI_TABLE, "THB")
check("one line item from three stacked rows", len(misumi), 1)
if misumi:
    # The Product Code, not the Customer Item Reference sitting above it.
    check("item code", misumi[0]["itemCode"], "E-PF-80-R")
    # The header says "Product Name(Brand Name)", so the bracket holds the brand.
    check("brand", misumi[0]["brand"], "MISUMI")
    check("description", misumi[0]["description"], "ECONOMY FAN ACCESSORY")
    check("quantity", misumi[0]["qty"], 8.0)
    check("unit taken from '8 PCS'", misumi[0]["unit"], "PCS")
    check("unit price", misumi[0]["unitPrice"], 55.05)

print("\na cell whose lines do not line up with its header is left alone")
check("mismatched line counts", main.split_stacked_cell("Product Code\nProduct Name", "E-PF-80-R"), ("", "", ""))
check("a single-label header is not stacked", main.split_stacked_cell("Description", "Widget"), ("", "", ""))
# Without a "brand" sub-label a trailing bracket is a specification, not a maker.
check("no brand label, no brand",
      main.split_stacked_cell("Product Code\nProduct Name", "E-PF-80-R\nFAN (220V)"),
      ("E-PF-80-R", "FAN (220V)", ""))

# A two-column header, flattened the way a text extractor hands it over: the left
# column's label ends up beside the right column's next label.
MISUMI_HEADER = (
    "Customer PO Reference: Payment:Sales on Credit/Cut25-1M-Pay31\n"
    "*The black marked line is waiting for MISUMI confirmation\n"
    "Quotation Number: FA112F9DCD Rev: 0 Estimated Total Weight: 200g\n"
    "Quotation Date: 09/09/2026 Valid until: 09/10/2026\n"
)

print("\nheader fields on a two-column quotation")
# "Customer PO Reference:" sits above "Quotation Number:", and what follows it across
# the gutter is the next field's label.
check("quotation number", main.extract_quotation_number(MISUMI_HEADER), "FA112F9DCD")
check("a label word is not a document number",
      main.extract_quotation_number("Reference: Payment: Sales on Credit"), "")
# "Estimated Total Weight: 200g" matches a total pattern but is not money.
check("a weight is not the quotation total", main.extract_total(MISUMI_HEADER), 0.0)
# Each pattern takes its first match, so "Item Total" answers before the grand total
# below it. That is long-standing behaviour and not what this guard is about; what
# matters here is that a real total is still found at all.
check("an item total still is",
      main.extract_total("Item Total 440.40\nTax 30.83\nTotal 471.23"), 440.40)
check("a weight beside a real total does not win",
      main.extract_total("Estimated Total Weight: 200g\nItem Total 440.40"), 440.40)

print("\na part number keeps to its own line")
CODE_TABLE = [
    ["No", "Description", "Part No.", "Qty", "Unit Price", "Amount"],
    ["1", "Economy fan accessory", "E-PF-80-R\n10/09/2026(11/09)", "8", "55.05", "440.40"],
]
coded = main.parse_plumber_table(CODE_TABLE, "THB")
check("item code is not glued to the next line", coded and coded[0]["itemCode"], "E-PF-80-R")

print()
if failures:
    print(f"{len(failures)} failure(s)")
    sys.exit(1)
print("all table checks passed")
