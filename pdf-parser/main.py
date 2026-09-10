"""
PDF Parser Service for TOMAS TECH Supplier Quotations
======================================================
Accepts a PDF file, extracts structured quotation data using:
  - pdfplumber  : table cell extraction from digital PDFs  (primary)
  - PyMuPDF     : page rendering to image when text is sparse
  - Tesseract   : OCR with tha+eng+jpn when rendered image is needed

Returns JSON matching the ParsedQuotation TypeScript interface so the
Node backend can forward it directly to the frontend with no mapping.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Optional

import pymupdf as fitz  # PyMuPDF (pymupdf >= 1.24 exposes the pymupdf namespace)
import pdfplumber
import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("pdf-parser")

app = FastAPI(title="TOMAS PDF Parser", version="1.0.0")

# ── Constants ──────────────────────────────────────────────────────────────

OCR_LANG = "tha+eng+jpn"
OCR_DPI = 300  # higher = better quality, slower
TEXT_THRESHOLD = 120  # characters below this → fall back to OCR

UNIT_TOKENS = {
    "ea", "pcs", "pc", "set", "lot", "m", "cm", "mm", "kg", "g", "l", "ml",
    "roll", "sheet", "pair", "box", "bag", "reel", "meter", "ft", "inch",
    "ชิ้น", "อัน", "ชุด", "กล่อง", "ม้วน", "แผ่น", "คู่",
}

MONTH_TH: dict[str, int] = {
    "มกราคม": 1, "กุมภาพันธ์": 2, "มีนาคม": 3, "เมษายน": 4,
    "พฤษภาคม": 5, "มิถุนายน": 6, "กรกฎาคม": 7, "สิงหาคม": 8,
    "กันยายน": 9, "ตุลาคม": 10, "พฤศจิกายน": 11, "ธันวาคม": 12,
    "ม.ค": 1, "ก.พ": 2, "มี.ค": 3, "เม.ย": 4, "พ.ค": 5, "มิ.ย": 6,
    "ก.ค": 7, "ส.ค": 8, "ก.ย": 9, "ต.ค": 10, "พ.ย": 11, "ธ.ค": 12,
}

MONTH_EN: dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}

# ── Date helpers ───────────────────────────────────────────────────────────

def be_to_ce(y: int) -> int:
    return y - 543 if y > 2500 else y


def parse_date(raw: str) -> str:
    """Return ISO yyyy-mm-dd or '' if unparseable."""
    raw = raw.strip()

    # DD/MM/YYYY or DD-MM-YYYY
    m = re.fullmatch(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", raw)
    if m:
        d, mo = m.group(1).zfill(2), m.group(2).zfill(2)
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{mo}-{d}"

    # YYYY-MM-DD (ISO)
    m = re.fullmatch(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", raw)
    if m:
        return f"{be_to_ce(int(m.group(1)))}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

    # D Month YYYY  (Thai or English month name)
    m = re.fullmatch(r"(\d{1,2})\s+([^\d\s]{2,20})\s+(\d{2,4})", raw)
    if m:
        d = m.group(1).zfill(2)
        key = m.group(2).lower().replace(".", "")
        mo = MONTH_TH.get(m.group(2)) or MONTH_TH.get(key) or MONTH_EN.get(key) or 1
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{str(mo).zfill(2)}-{d}"

    return ""


def find_date(text: str, keywords: list[str]) -> str:
    for kw in keywords:
        pat = re.escape(kw) + r"[:\s]*(\d{1,2}[\s/\-][^\d\n\r]{2,15}[\s/\-]\d{2,4})"
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            d = parse_date(m.group(1).strip())
            if d:
                return d
    m = re.search(r"\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\b", text)
    return parse_date(m.group(1)) if m else ""

# ── Field extraction helpers ───────────────────────────────────────────────

def detect_currency(text: str) -> str:
    if re.search(r"\bJPY\b|\bYEN\b|¥", text, re.I):
        return "JPY"
    if re.search(r"\bUSD\b|\bUS\$|\$\d", text, re.I):
        return "USD"
    if re.search(r"\bEUR\b|€", text, re.I):
        return "EUR"
    return "THB"


def extract_tax_id(text: str) -> str:
    m = re.search(r"\b(\d{13})\b", text) or re.search(
        r"(\d{1}-\d{4}-\d{5}-\d{1,2}-\d{1})", text
    )
    return m.group(1).replace("-", "") if m else ""


def extract_quotation_number(text: str) -> str:
    # Labeled — explicit quotation / invoice number fields (highest priority)
    m = re.search(
        r"(?:quotation\s*(?:no\.?|number:?)|invoice\s*no\.?|"
        r"ใบเสนอราคา(?:เลขที่)?|เลขที่ใบเสนอราคา|"
        r"QT(?:NO)?|BT\s*NO|SQ\s*NO)[:\s#\/]*([A-Z0-9][A-Z0-9\-\/]{3,})",
        text, re.I,
    )
    if m:
        return m.group(1).strip()
    # Known document-number prefixes (NOT phone-number patterns like 02-xxx)
    m = re.search(
        r"\b(QT[\-\d]{4,}|QT\d{4}[-\d]+|SQ[\d\-]{4,}|BT\d{2}[-\d]{5,}|"
        r"OTP\d{6,}|TMTS\d{2}-\d+|FA\d+[A-Z]+|QCA\d+|Q\d{6,}|"
        r"INV\d+|WIV\d+|[A-Z]{2,}\d{4,}[-\w]*)",
        text,
    )
    if m:
        # Exclude phone-number patterns (Thai: 0x-xxx-xxxx or 08x-xxx-xxxx)
        candidate = m.group(1)
        if not re.fullmatch(r"0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}", candidate):
            return candidate
    # Generic "No." label — but exclude phone numbers
    for pat in [
        r"(?:No\.|NO\.)\s*:\s*([A-Z0-9][A-Z0-9\-\/]{4,19})",
        r"เลขที่[:\s]*([A-Z0-9\-\/]{5,20})",
    ]:
        m = re.search(pat, text, re.I)
        if m:
            candidate = m.group(1).strip()
            if not re.fullmatch(r"0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}", candidate):
                return candidate
    return ""


def extract_supplier_name(lines: list[str]) -> str:
    for line in lines[:25]:
        t = line.strip()
        if len(t) < 5:
            continue
        if re.search(r"co\.,?\s*ltd|จำกัด|company|corporation|inc\.|gmbh|co\.th|บริษัท", t, re.I):
            return t
    for line in lines[:12]:
        t = line.strip()
        if len(t) >= 5 and t == t.upper() and re.search(r"[A-Z]", t):
            return t
    return ""


def extract_total(text: str) -> float:
    patterns = [
        r"(?:grand\s*total|total\s*net|net\s*total|ยอดรวมทั้งหมด|ยอดสุทธิ|รวมทั้งสิ้น)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:total\s*amount|total)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:รวม)[^\d\n]*([\d,]+\.?\d*)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            raw = m.group(1).replace(",", "").strip()
            try:
                v = float(raw) if raw else 0.0
            except ValueError:
                continue
            if v > 0:
                return v
    return 0.0

# ── Table cell → line item ─────────────────────────────────────────────────

def is_numeric(s: Optional[str]) -> bool:
    """True if the cell looks like a number, optionally with currency symbol suffix."""
    return bool(s and re.fullmatch(r"[\d,]+\.?\d*\s*[฿¥€$]?", s.strip()))


def clean_num(s: str) -> float:
    """Parse a number cell, stripping commas and trailing currency symbols."""
    return float(re.sub(r"[,฿¥€$\s]", "", s))


def row_to_line(row: list[Optional[str]], currency: str, line_no: int) -> Optional[dict]:
    """
    Convert a pdfplumber table row to a ParsedLine dict.
    Strategy: find the last two positive numeric cells → unit_price, line_total.
    Everything else: largest non-numeric cell = description, code-looking cell = itemCode.
    Handles cells with embedded currency symbols (e.g. "66,600.00 ฿") and
    qty+unit merged cells (e.g. "9 ชิ้น" → qty=9, unit=ชิ้น).
    """
    # Normalise: strip newlines within cells (e.g. "LEAD\nTIME" → skip)
    cells = [re.sub(r"\s+", " ", str(c)).strip() if c else "" for c in row]

    nums = [(i, clean_num(c)) for i, c in enumerate(cells) if is_numeric(c) and clean_num(c) > 0]
    if len(nums) < 2:
        return None

    _, unit_price = nums[-2]
    _, line_total = nums[-1]

    if unit_price <= 0:
        return None

    qty = round(line_total / unit_price, 4) if unit_price else 1.0
    # Sanity check: qty should be a reasonable number
    if qty <= 0 or qty > 100_000:
        qty = 1.0

    # Description: longest non-numeric, non-trivial cell
    desc_cells = [c for c in cells if c and not is_numeric(c) and len(c) > 2]
    description = max(desc_cells, key=len) if desc_cells else ""
    if not description:
        return None

    # Skip header rows — only when description is short (actual headers rarely span > 50 chars)
    # Don't check ราคา/price as they appear in product notes too
    if len(description) < 50 and re.search(
        r"^(?:description|item\s*(?:no|code)?|qty|quantity|amount|unit\s*price|"
        r"ลำดับ|รายการ|จำนวน)$",
        description.strip(), re.I,
    ):
        return None

    # Item code: looks like a product code (must contain at least one letter)
    item_code = ""
    for c in cells:
        if (c and re.fullmatch(r"[A-Z0-9][A-Z0-9\-\/\.]{2,39}", c)
                and re.search(r"[A-Z]", c) and c != description):
            item_code = c
            break

    # Unit — may appear as standalone cell or merged with qty ("9 ชิ้น")
    unit = "EA"
    for c in cells:
        tok = c.lower().rstrip("s")
        if tok in UNIT_TOKENS:
            unit = c.upper()
            break
        # Merged "qty unit" cell: leading digits + space + unit token
        m_qu = re.match(r"^\d[\d,]*\.?\d*\s+(\S+)", c)
        if m_qu and m_qu.group(1).lower().rstrip("s") in UNIT_TOKENS:
            unit = m_qu.group(1).upper()
            break

    return {
        "lineNo": line_no,
        "itemCode": item_code,
        "description": description,
        "brand": "",
        "model": item_code,
        "qty": qty,
        "unit": unit,
        "unitPrice": unit_price,
        "currency": currency,
        "remark": "",
    }

# ── Text-fallback line parser ──────────────────────────────────────────────

HEADER_PAT = re.compile(
    r"item|description|qty|unit\s*price|amount|total|vat|subtotal|ลำดับ|รายการ|จำนวน|ราคา",
    re.I,
)
SKIP_PAT = re.compile(r"sub\s*total|grand\s*total|ภาษี|vat|discount", re.I)


def lines_to_items(text_lines: list[str], currency: str) -> list[dict]:
    """Last-resort text-regex line item parser (same logic as the TS version, improved)."""
    results: list[dict] = []
    line_no = 1
    i = 0
    while i < len(text_lines):
        raw = text_lines[i]
        i += 1
        if HEADER_PAT.search(raw) and not re.match(r"^\s*\d", raw):
            continue
        if SKIP_PAT.search(raw):
            continue

        # MISUMI-style: no  CODE  qty  unit  price  amount  (desc on next line)
        m = re.match(
            r"^\s*(\d+)\s{2,}([A-Z0-9\-]{5,40})\s{2,}(\d[\d,]*)\s{1,6}(\w{1,10})"
            r"\s{2,}([\d,]+\.?\d*)\s{2,}([\d,]+\.?\d*)\s*$", raw
        )
        if m:
            qty = clean_num(m.group(3))
            unit_price = clean_num(m.group(5))
            desc = text_lines[i].strip() if i < len(text_lines) else m.group(2)
            i += 1
            results.append({
                "lineNo": line_no, "itemCode": m.group(2),
                "description": desc or m.group(2), "brand": "", "model": m.group(2),
                "qty": qty, "unit": m.group(4), "unitPrice": unit_price,
                "currency": currency, "remark": "",
            })
            line_no += 1
            continue

        # Generic: digit  desc  price  amount (last 2 numbers on line)
        m = re.match(r"^\s*(\d{1,4})\s+(.{3,70}?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$", raw)
        if m:
            price = clean_num(m.group(3))
            amount = clean_num(m.group(4))
            qty = round(amount / price, 4) if price > 0 and amount >= price else 1.0
            desc = m.group(2).strip()
            if len(desc) >= 3 and (price > 0 or amount > 0):
                results.append({
                    "lineNo": line_no, "itemCode": "", "description": desc,
                    "brand": "", "model": "", "qty": qty, "unit": "EA",
                    "unitPrice": price, "currency": currency, "remark": "",
                })
                line_no += 1
                continue

        # Single-price format: digit  desc  price  (Thai quotations, no qty column)
        m = re.match(r"^\s*(\d{1,4})\s+(.{5,80}?)\s+([\d,]+\.?\d{2})\s*$", raw)
        if m:
            price = clean_num(m.group(3))
            desc = m.group(2).strip()
            # Skip address lines (contain Thai/English road/district words)
            is_address = re.search(r"ซอย|ถนน|แขวง|เขต|จังหวัด|\bSoi\b|\bRoad\b", desc)
            if len(desc) >= 5 and price > 0 and not SKIP_PAT.search(desc) and not is_address:
                results.append({
                    "lineNo": line_no, "itemCode": "", "description": desc,
                    "brand": "", "model": "", "qty": 1.0, "unit": "EA",
                    "unitPrice": price, "currency": currency, "remark": "",
                })
                line_no += 1
    return results

# ── Main PDF processing ────────────────────────────────────────────────────

def process_pdf(pdf_bytes: bytes) -> dict:
    all_text = ""
    table_rows: list[list] = []
    requires_ocr = False

    # ── Step 1: pdfplumber — text + table extraction ─────────────────────
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                all_text += page_text + "\n"

                # Extract every table on the page
                for table in page.extract_tables():
                    table_rows.extend(row for row in table if row)
    except Exception as exc:
        log.warning("pdfplumber failed: %s", exc)

    # ── Step 2: OCR fallback when text content is too sparse ─────────────
    if len(all_text.strip()) < TEXT_THRESHOLD:
        requires_ocr = True
        log.info("Text sparse (%d chars) — running OCR", len(all_text.strip()))
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page in doc:
                mat = fitz.Matrix(OCR_DPI / 72, OCR_DPI / 72)
                pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                ocr_text = pytesseract.image_to_string(img, lang=OCR_LANG)
                all_text += ocr_text + "\n"
            doc.close()
        except Exception as exc:
            log.warning("OCR failed: %s", exc)

    text_lines = [ln for ln in all_text.split("\n") if ln.strip()]
    currency = detect_currency(all_text)

    # ── Step 3: header fields ─────────────────────────────────────────────
    supplier_name = extract_supplier_name(text_lines)
    supplier_tax_id = extract_tax_id(all_text)
    quotation_number = extract_quotation_number(all_text)
    received_date = find_date(
        all_text, ["วันที่", "date", "Quotation Date", "Date:", "issued", "ออกเมื่อ"]
    )
    valid_until = find_date(
        all_text, ["valid until", "valid to", "Valid Until", "expiration", "expire",
                   "หมดอายุ", "expiry", "ใช้ได้ถึง", "หมดอายุ"]
    )
    total_amount = extract_total(all_text)

    # ── Step 4: line items ────────────────────────────────────────────────
    items: list[dict] = []
    seen_desc: set[str] = set()
    ln = 1

    # Primary: pdfplumber table cells
    for row in table_rows:
        item = row_to_line(row, currency, ln)
        if item and item["description"] not in seen_desc:
            seen_desc.add(item["description"])
            items.append(item)
            ln += 1

    # Fallback: regex on raw text
    if not items:
        items = lines_to_items(text_lines, currency)

    # ── Confidence ────────────────────────────────────────────────────────
    def conf(val: str, strong: bool, weak: bool = False) -> str:
        return "high" if strong else ("low" if weak else "none")

    confidence = {
        "supplierName": conf(supplier_name, len(supplier_name) > 5, bool(supplier_name)),
        "supplierTaxId": conf(supplier_tax_id, len(supplier_tax_id) == 13, bool(supplier_tax_id)),
        "quotationNumber": conf(quotation_number, len(quotation_number) >= 5, bool(quotation_number)),
        "receivedDate": "high" if received_date else "none",
        "validUntil": "high" if valid_until else "none",
        "totalAmount": "high" if total_amount > 0 else "none",
        "lines": "high" if items else ("low" if not requires_ocr else "none"),
    }

    return {
        "supplierName": supplier_name,
        "supplierTaxId": supplier_tax_id,
        "quotationNumber": quotation_number,
        "receivedDate": received_date,
        "validUntil": valid_until,
        "currency": currency,
        "totalAmount": total_amount,
        "lines": items,
        "rawText": all_text[:8000],  # truncate for response size
        "requiresOcr": requires_ocr,
        "confidence": confidence,
    }

# ── FastAPI endpoints ──────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "pdf-parser"}


@app.post("/parse")
async def parse_endpoint(file: UploadFile = File(...)) -> JSONResponse:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF (.pdf)")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    log.info("Parsing %s (%d bytes)", file.filename, len(content))
    try:
        result = process_pdf(content)
        log.info(
            "Done: supplier=%r, lines=%d, ocr=%s",
            result["supplierName"], len(result["lines"]), result["requiresOcr"],
        )
        return JSONResponse(content=result)
    except Exception as exc:
        log.exception("Parse failed for %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc
