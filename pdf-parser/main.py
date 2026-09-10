"""
PDF Parser Service for TOMAS TECH Supplier Quotations
======================================================
Tier 1  pymupdf4llm  → Markdown → column-aware table parser
         (knows WHICH column is description / qty / price / amount from the header)
Tier 2  pdfplumber   → raw table cells → heuristic cell matcher
         (fallback when Markdown tables are empty)
Tier 3  text regex   → last-resort line-pattern matching
Tier 4  PyMuPDF + Tesseract OCR → for scanned / image-only PDFs
"""

from __future__ import annotations

import io
import logging
import re
from typing import Optional

import pymupdf4llm
import pymupdf as fitz
import pdfplumber
import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("pdf-parser")

app = FastAPI(title="TOMAS PDF Parser", version="2.0.0")

# ── Constants ──────────────────────────────────────────────────────────────

OCR_LANG = "tha+eng+jpn"
OCR_DPI = 300
# Count only real content chars (strip Markdown markup) before triggering OCR
TEXT_THRESHOLD = 80

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

SKIP_PAT = re.compile(r"sub\s*total|grand\s*total|ภาษี|vat|discount", re.I)

# ── Date helpers ───────────────────────────────────────────────────────────

def be_to_ce(y: int) -> int:
    return y - 543 if y > 2500 else y


def parse_date(raw: str) -> str:
    raw = raw.strip()
    m = re.fullmatch(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", raw)
    if m:
        d, mo = m.group(1).zfill(2), m.group(2).zfill(2)
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{mo}-{d}"
    m = re.fullmatch(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", raw)
    if m:
        return f"{be_to_ce(int(m.group(1)))}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
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
    m = re.search(
        r"(?:quotation\s*(?:no\.?|number:?)|invoice\s*no\.?|"
        r"ใบเสนอราคา(?:เลขที่)?|เลขที่ใบเสนอราคา|"
        r"QT(?:NO)?|BT\s*NO|SQ\s*NO)[:\s#\/]*([A-Z0-9][A-Z0-9\-\/]{3,})",
        text, re.I,
    )
    if m:
        return m.group(1).strip()
    m = re.search(
        r"\b(QT[\-\d]{4,}|QT\d{4}[-\d]+|SQ[\d\-]{4,}|BT\d{2}[-\d]{5,}|"
        r"OTP\d{6,}|TMTS\d{2}-\d+|FA\d+[A-Z]+|QCA\d+|Q\d{6,}|"
        r"INV\d+|WIV\d+|[A-Z]{2,}\d{4,}[-\w]*)",
        text,
    )
    if m:
        candidate = m.group(1)
        if not re.fullmatch(r"0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}", candidate):
            return candidate
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

# ── Numeric helpers ────────────────────────────────────────────────────────

def is_numeric(s: Optional[str]) -> bool:
    return bool(s and re.fullmatch(r"[\d,]+\.?\d*\s*[฿¥€$]?", s.strip()))


def clean_num(s: str) -> float:
    return float(re.sub(r"[,฿¥€$\s]", "", s))

# ── Tier 1: Markdown table parser (column-aware) ───────────────────────────

def _find_col(headers: list[str], keywords: list[str]) -> Optional[int]:
    """Return first header index whose text contains any keyword (case-insensitive)."""
    for i, h in enumerate(headers):
        h_norm = re.sub(r"\s+", " ", h.lower())
        for kw in keywords:
            if kw.lower() in h_norm:
                return i
    return None


def parse_markdown_table(md: str, currency: str) -> list[dict]:
    """
    Parse line items from Markdown tables produced by pymupdf4llm.
    Uses column headers to identify fields — no position guessing.
    """
    items: list[dict] = []
    seen_desc: set[str] = set()
    line_no = 1

    lines = md.split("\n")
    i = 0
    while i < len(lines):
        # Find a Markdown table row (starts and ends with |)
        if not (lines[i].strip().startswith("|") and lines[i].strip().endswith("|")):
            i += 1
            continue

        # Collect all contiguous table rows
        table_lines: list[str] = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            table_lines.append(lines[i].strip())
            i += 1

        # Need: header | separator | ≥1 data row
        if len(table_lines) < 3:
            continue
        if not re.match(r"^\|[-: |]+\|$", table_lines[1]):
            continue

        header = [c.strip() for c in table_lines[0].split("|")[1:-1]]
        n_cols = len(header)

        # Identify columns by keyword
        desc_col   = _find_col(header, ["description", "detail", "product", "item", "รายการ", "ชื่อ", "name", "สินค้า"])
        qty_col    = _find_col(header, ["qty", "quantity", "จำนวน", "pcs", "pieces"])
        price_col  = _find_col(header, ["unit price", "unit\nprice", "price/unit", "unitprice",
                                        "ราคา/หน่วย", "ราคาต่อหน่วย", "price", "ราคา"])
        amount_col = _find_col(header, ["amount", "total", "รวม", "ยอด", "line total"])
        code_col   = _find_col(header, ["code", "part no", "part number", "model no", "รหัส", "no.", "item no", "model"])
        unit_col   = _find_col(header, ["unit", "หน่วย", "uom"])

        # Skip tables with no usable columns
        if desc_col is None and price_col is None and amount_col is None:
            continue

        for row_text in table_lines[2:]:
            cells = [c.strip() for c in row_text.split("|")[1:-1]]
            while len(cells) < n_cols:
                cells.append("")
            cells = cells[:n_cols]

            # Description
            if desc_col is not None and desc_col < len(cells):
                desc = cells[desc_col]
            else:
                desc = max(
                    (c for c in cells if c and not is_numeric(c) and len(c) > 2),
                    key=len, default="",
                )
            desc = re.sub(r"\s+", " ", desc).strip()

            if not desc or len(desc) < 3:
                continue
            if SKIP_PAT.search(desc):
                continue
            # Skip column-header repeats
            if re.match(r"^(?:no\.?|#|ลำดับ|item|description|รายการ|qty|จำนวน|price|ราคา)$", desc, re.I):
                continue
            # Skip address lines
            if re.search(r"ซอย|ถนน|แขวง|เขต|\bSoi\b|\bRoad\b", desc):
                continue

            # Unit price
            unit_price = 0.0
            if price_col is not None and price_col < len(cells):
                raw = cells[price_col]
                if is_numeric(raw):
                    try:
                        unit_price = clean_num(raw)
                    except ValueError:
                        pass

            # Amount / line total
            amount = 0.0
            if amount_col is not None and amount_col < len(cells):
                raw = cells[amount_col]
                if is_numeric(raw):
                    try:
                        amount = clean_num(raw)
                    except ValueError:
                        pass

            # Fallback: last-two-numerics in row
            if unit_price == 0 and amount == 0:
                nums = []
                for c in cells:
                    if is_numeric(c):
                        try:
                            v = clean_num(c)
                            if v > 0:
                                nums.append(v)
                        except ValueError:
                            pass
                if len(nums) >= 2:
                    unit_price, amount = nums[-2], nums[-1]
                elif len(nums) == 1:
                    unit_price = nums[0]

            if unit_price <= 0 and amount <= 0:
                continue

            effective_price = unit_price if unit_price > 0 else amount

            # Quantity
            qty = 1.0
            if qty_col is not None and qty_col < len(cells):
                m = re.match(r"([\d,]+\.?\d*)", cells[qty_col].replace(" ", ""))
                if m:
                    try:
                        qty = clean_num(m.group(1))
                    except ValueError:
                        pass
            elif unit_price > 0 and amount > 0 and amount != unit_price:
                q = round(amount / unit_price, 4)
                if 0 < q <= 100_000:
                    qty = q

            # Item code
            item_code = ""
            if code_col is not None and code_col < len(cells):
                c = cells[code_col]
                if c and not is_numeric(c) and re.search(r"[A-Z0-9]", c, re.I):
                    item_code = re.sub(r"\s+", "", c)[:40]

            # Unit
            unit = "EA"
            if unit_col is not None and unit_col < len(cells):
                u = cells[unit_col]
                if u.lower().rstrip("s") in UNIT_TOKENS:
                    unit = u.upper()

            if desc not in seen_desc:
                seen_desc.add(desc)
                items.append({
                    "lineNo": line_no,
                    "itemCode": item_code,
                    "description": desc,
                    "brand": "",
                    "model": item_code,
                    "qty": qty,
                    "unit": unit,
                    "unitPrice": effective_price,
                    "currency": currency,
                    "remark": "",
                })
                line_no += 1

    return items

# ── Tier 2: pdfplumber table cell heuristic ────────────────────────────────

def row_to_line(row: list[Optional[str]], currency: str, line_no: int) -> Optional[dict]:
    cells = [re.sub(r"\s+", " ", str(c)).strip() if c else "" for c in row]
    nums = [(i, clean_num(c)) for i, c in enumerate(cells) if is_numeric(c) and clean_num(c) > 0]
    if len(nums) < 2:
        return None

    _, unit_price = nums[-2]
    _, line_total = nums[-1]
    if unit_price <= 0:
        return None

    qty = round(line_total / unit_price, 4) if unit_price else 1.0
    if qty <= 0 or qty > 100_000:
        qty = 1.0

    desc_cells = [c for c in cells if c and not is_numeric(c) and len(c) > 2]
    description = max(desc_cells, key=len) if desc_cells else ""
    if not description:
        return None
    if len(description) < 50 and re.fullmatch(
        r"^(?:description|item\s*(?:no|code)?|qty|quantity|amount|unit\s*price|ลำดับ|รายการ|จำนวน)$",
        description.strip(), re.I,
    ):
        return None
    if re.search(r"ซอย|ถนน|แขวง|เขต|\bSoi\b|\bRoad\b", description):
        return None

    item_code = ""
    for c in cells:
        if c and re.fullmatch(r"[A-Z0-9][A-Z0-9\-\/\.]{2,39}", c) and re.search(r"[A-Z]", c) and c != description:
            item_code = c
            break

    unit = "EA"
    for c in cells:
        tok = c.lower().rstrip("s")
        if tok in UNIT_TOKENS:
            unit = c.upper()
            break
        m_qu = re.match(r"^\d[\d,]*\.?\d*\s+(\S+)", c)
        if m_qu and m_qu.group(1).lower().rstrip("s") in UNIT_TOKENS:
            unit = m_qu.group(1).upper()
            break

    return {
        "lineNo": line_no, "itemCode": item_code,
        "description": description, "brand": "", "model": item_code,
        "qty": qty, "unit": unit, "unitPrice": unit_price,
        "currency": currency, "remark": "",
    }

# ── Tier 3: text regex fallback ────────────────────────────────────────────

HEADER_PAT = re.compile(
    r"item|description|qty|unit\s*price|amount|total|vat|subtotal|ลำดับ|รายการ|จำนวน",
    re.I,
)


def lines_to_items(text_lines: list[str], currency: str) -> list[dict]:
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

        # MISUMI-style: no  CODE  qty  unit  price  amount
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

        # Generic: number  desc  price  amount
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

        # Single-price format: number  desc  price  (Thai quotations)
        m = re.match(r"^\s*(\d{1,4})\s+(.{5,80}?)\s+([\d,]+\.?\d{2})\s*$", raw)
        if m:
            price = clean_num(m.group(3))
            desc = m.group(2).strip()
            is_address = re.search(r"ซอย|ถนน|แขวง|เขต|\bSoi\b|\bRoad\b", desc)
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
    md_text = ""
    table_rows: list[list] = []
    all_text = ""
    requires_ocr = False

    # ── Tier 1: pymupdf4llm → Markdown ────────────────────────────────────
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        md_text = pymupdf4llm.to_markdown(doc, show_progress=False)
        doc.close()
        all_text = md_text
        log.info("pymupdf4llm: %d chars of Markdown", len(md_text))
    except Exception as exc:
        log.warning("pymupdf4llm failed: %s", exc)

    # ── Tier 2: pdfplumber → table rows + plain text backup ───────────────
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                if not all_text:
                    all_text += (page.extract_text(x_tolerance=3, y_tolerance=3) or "") + "\n"
                for table in page.extract_tables():
                    table_rows.extend(row for row in table if row)
    except Exception as exc:
        log.warning("pdfplumber failed: %s", exc)

    # ── Tier 3/4: OCR when real content is sparse ─────────────────────────
    content_chars = len(re.sub(r"[#|*`\-=_>\s]", "", all_text))
    if content_chars < TEXT_THRESHOLD:
        requires_ocr = True
        log.info("Content sparse (%d chars) — running OCR", content_chars)
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page in doc:
                mat = fitz.Matrix(OCR_DPI / 72, OCR_DPI / 72)
                pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                all_text += pytesseract.image_to_string(img, lang=OCR_LANG) + "\n"
            doc.close()
        except Exception as exc:
            log.warning("OCR failed: %s", exc)

    # Strip Markdown markup for field-extraction regexes
    plain_text = re.sub(r"(?m)^#{1,6}\s+", "", all_text)
    plain_text = re.sub(r"[*`]", "", plain_text)
    text_lines = [ln for ln in plain_text.split("\n") if ln.strip()]
    currency = detect_currency(plain_text)

    # ── Header fields ──────────────────────────────────────────────────────
    supplier_name     = extract_supplier_name(text_lines)
    supplier_tax_id   = extract_tax_id(plain_text)
    quotation_number  = extract_quotation_number(plain_text)
    received_date     = find_date(plain_text, ["วันที่", "date", "Quotation Date", "Date:", "issued", "ออกเมื่อ"])
    valid_until       = find_date(plain_text, ["valid until", "valid to", "Valid Until", "expiration",
                                               "expire", "หมดอายุ", "expiry", "ใช้ได้ถึง"])
    total_amount      = extract_total(plain_text)

    # ── Line items: try each tier until we get results ─────────────────────
    items: list[dict] = []

    # Tier 1 — Markdown column-aware
    if md_text:
        items = parse_markdown_table(md_text, currency)
        if items:
            log.info("Tier 1 (Markdown): %d line items", len(items))

    # Tier 2 — pdfplumber cell heuristic
    if not items and table_rows:
        seen: set[str] = set()
        ln = 1
        for row in table_rows:
            item = row_to_line(row, currency, ln)
            if item and item["description"] not in seen:
                seen.add(item["description"])
                items.append(item)
                ln += 1
        if items:
            log.info("Tier 2 (pdfplumber): %d line items", len(items))

    # Tier 3 — text regex
    if not items:
        items = lines_to_items(text_lines, currency)
        if items:
            log.info("Tier 3 (text regex): %d line items", len(items))

    # ── Confidence ────────────────────────────────────────────────────────
    def conf(val: str, strong: bool, weak: bool = False) -> str:
        return "high" if strong else ("low" if weak else "none")

    confidence = {
        "supplierName":   conf(supplier_name,    len(supplier_name) > 5,      bool(supplier_name)),
        "supplierTaxId":  conf(supplier_tax_id,  len(supplier_tax_id) == 13,  bool(supplier_tax_id)),
        "quotationNumber":conf(quotation_number, len(quotation_number) >= 5,  bool(quotation_number)),
        "receivedDate":   "high" if received_date else "none",
        "validUntil":     "high" if valid_until  else "none",
        "totalAmount":    "high" if total_amount > 0 else "none",
        "lines":          "high" if items else ("low" if not requires_ocr else "none"),
    }

    return {
        "supplierName":    supplier_name,
        "supplierTaxId":   supplier_tax_id,
        "quotationNumber": quotation_number,
        "receivedDate":    received_date,
        "validUntil":      valid_until,
        "currency":        currency,
        "totalAmount":     total_amount,
        "lines":           items,
        "rawText":         plain_text[:8000],
        "requiresOcr":     requires_ocr,
        "confidence":      confidence,
    }

# ── FastAPI endpoints ──────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "pdf-parser", "version": "2.0.0"}


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
        log.info("Done: supplier=%r lines=%d ocr=%s",
                 result["supplierName"], len(result["lines"]), result["requiresOcr"])
        return JSONResponse(content=result)
    except Exception as exc:
        log.exception("Parse failed for %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc
