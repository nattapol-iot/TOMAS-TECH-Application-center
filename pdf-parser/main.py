"""
PDF Parser Service for TOMAS TECH Supplier Quotations
======================================================
Tier 0  Claude LLM       → primary extraction  (requires ANTHROPIC_API_KEY env var)
Tier 1  pymupdf4llm      → Markdown → column-aware table parser
Tier 2  pdfplumber       → raw table cells → heuristic cell matcher
Tier 3  text regex       → last-resort line-pattern matching
Tier 4  PyMuPDF + Tesseract OCR → for scanned / image-only PDFs

Set PDF_PARSER_MODEL env var to override the default LLM model.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
from typing import Optional

import anthropic
import pymupdf4llm
import pymupdf as fitz
import pdfplumber
import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("pdf-parser")

app = FastAPI(title="TOMAS PDF Parser", version="3.0.0")

# ── Constants ──────────────────────────────────────────────────────────────

OCR_LANG = "tha+eng+jpn"
OCR_DPI = 300
TEXT_THRESHOLD = 80   # below this many non-markup chars → trigger OCR

# Max chars sent to LLM (covers ~3-5 pages of a typical quotation)
LLM_TEXT_LIMIT = 14_000

DEFAULT_MODEL = os.environ.get("PDF_PARSER_MODEL", "claude-haiku-4-5-20251001")

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

# ── LLM system prompt (cached across calls via Anthropic prompt caching) ───

LLM_SYSTEM = """\
You are a structured data extractor for supplier quotation and invoice PDF documents,
primarily from Thai companies (but also Japanese and other suppliers).

Your task: read the document text and return a single valid JSON object. No explanation,
no markdown code fences — just the raw JSON.

Extraction rules:
1. Buddhist Era (พ.ศ.) years: subtract 543 to get CE/AD (e.g. 2567 → 2024, 2568 → 2025).
2. All dates must be in YYYY-MM-DD format. Use "" if unknown.
3. lines[]: include ONLY actual product or service line items.
   Exclude rows that are: subtotal, VAT/tax, discount, shipping fee, header rows,
   blank rows, notes/remarks rows, or address lines.
4. unitPrice: price per single unit. If only the line total is given, divide by qty.
5. qty: default to 1.0 if not explicitly stated.
6. currency: detect from document (¥ / JPY, $ / USD, € / EUR, ฿ / Baht / THB → "THB").
   Default: "THB".
7. supplierTaxId: Thai 13-digit tax identification number. Remove dashes/spaces.
   Return "" if not found.
8. totalAmount: the grand total / net total after all discounts. Exclude VAT unless
   the document only shows a VAT-inclusive total.
9. For string fields: "" if unknown. For number fields: 0 if unknown.
10. itemCode: product part number / model number / SKU if present in the row.
    Also copy it to the model field. brand: manufacturer brand name if identifiable.
11. If a description spans multiple lines, concatenate them (one space between).
12. unit: normalise to uppercase short form (EA, PCS, SET, LOT, M, KG, etc.).

Return exactly this JSON shape (no extra fields, no omissions):
{
  "supplierName": "",
  "supplierTaxId": "",
  "quotationNumber": "",
  "receivedDate": "",
  "validUntil": "",
  "currency": "THB",
  "totalAmount": 0.0,
  "lines": [
    {
      "lineNo": 1,
      "itemCode": "",
      "description": "",
      "brand": "",
      "model": "",
      "qty": 1.0,
      "unit": "EA",
      "unitPrice": 0.0,
      "remark": ""
    }
  ]
}\
"""

# ── Anthropic client (lazy init — skipped when no API key) ────────────────

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> Optional[anthropic.Anthropic]:
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if key:
            _client = anthropic.Anthropic(api_key=key)
    return _client


def extract_with_llm(text: str) -> Optional[dict]:
    """Call Claude to extract all fields at once.  Returns None on any failure."""
    client = _get_client()
    if not client:
        return None
    if len(text.strip()) < 50:
        return None

    # Trim to token budget — keep beginning (header) + ending (totals)
    if len(text) > LLM_TEXT_LIMIT:
        half = LLM_TEXT_LIMIT // 2
        text = text[:half] + "\n…[truncated]…\n" + text[-half:]

    try:
        msg = client.messages.create(
            model=DEFAULT_MODEL,
            max_tokens=2048,
            system=[{
                "type": "text",
                "text": LLM_SYSTEM,
                "cache_control": {"type": "ephemeral"},  # prompt caching
            }],
            messages=[{"role": "user", "content": text}],
            timeout=30.0,
        )
        raw = msg.content[0].text.strip()
        # Strip accidental markdown fences
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        if not isinstance(parsed.get("lines"), list):
            parsed["lines"] = []
        log.info("LLM (%s): %d line items, supplier=%r",
                 DEFAULT_MODEL, len(parsed["lines"]), parsed.get("supplierName", ""))
        return parsed
    except Exception as exc:
        log.warning("LLM extraction failed: %s", exc)
        return None

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
    for i, h in enumerate(headers):
        h_norm = re.sub(r"\s+", " ", h.lower())
        for kw in keywords:
            if kw.lower() in h_norm:
                return i
    return None


def parse_markdown_table(md: str, currency: str) -> list[dict]:
    items: list[dict] = []
    seen_desc: set[str] = set()
    line_no = 1

    lines = md.split("\n")
    i = 0
    while i < len(lines):
        if not (lines[i].strip().startswith("|") and lines[i].strip().endswith("|")):
            i += 1
            continue

        table_lines: list[str] = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            table_lines.append(lines[i].strip())
            i += 1

        if len(table_lines) < 3:
            continue
        if not re.match(r"^\|[-: |]+\|$", table_lines[1]):
            continue

        header = [c.strip() for c in table_lines[0].split("|")[1:-1]]
        n_cols = len(header)

        desc_col   = _find_col(header, ["description", "detail", "product", "item", "รายการ", "ชื่อ", "name", "สินค้า"])
        qty_col    = _find_col(header, ["qty", "quantity", "จำนวน", "pcs", "pieces"])
        price_col  = _find_col(header, ["unit price", "unit\nprice", "price/unit", "unitprice",
                                        "ราคา/หน่วย", "ราคาต่อหน่วย", "price", "ราคา"])
        amount_col = _find_col(header, ["amount", "total", "รวม", "ยอด", "line total"])
        code_col   = _find_col(header, ["code", "part no", "part number", "model no", "รหัส", "no.", "item no", "model"])
        unit_col   = _find_col(header, ["unit", "หน่วย", "uom"])

        if desc_col is None and price_col is None and amount_col is None:
            continue

        for row_text in table_lines[2:]:
            cells = [c.strip() for c in row_text.split("|")[1:-1]]
            while len(cells) < n_cols:
                cells.append("")
            cells = cells[:n_cols]

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
            if re.match(r"^(?:no\.?|#|ลำดับ|item|description|รายการ|qty|จำนวน|price|ราคา)$", desc, re.I):
                continue
            if re.search(r"ซอย|ถนน|แขวง|เขต|\bSoi\b|\bRoad\b", desc):
                continue

            unit_price = 0.0
            if price_col is not None and price_col < len(cells):
                raw = cells[price_col]
                if is_numeric(raw):
                    try:
                        unit_price = clean_num(raw)
                    except ValueError:
                        pass

            amount = 0.0
            if amount_col is not None and amount_col < len(cells):
                raw = cells[amount_col]
                if is_numeric(raw):
                    try:
                        amount = clean_num(raw)
                    except ValueError:
                        pass

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

            item_code = ""
            if code_col is not None and code_col < len(cells):
                c = cells[code_col]
                if c and not is_numeric(c) and re.search(r"[A-Z0-9]", c, re.I):
                    item_code = re.sub(r"\s+", "", c)[:40]

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

def _normalise_llm_lines(lines: list[dict], currency: str) -> list[dict]:
    """Ensure LLM line items have the currency field and correct types."""
    out = []
    for i, ln in enumerate(lines, 1):
        if not isinstance(ln, dict):
            continue
        desc = str(ln.get("description", "")).strip()
        if not desc:
            continue
        out.append({
            "lineNo":      int(ln.get("lineNo", i)),
            "itemCode":    str(ln.get("itemCode", "") or ""),
            "description": desc,
            "brand":       str(ln.get("brand", "") or ""),
            "model":       str(ln.get("model", "") or ""),
            "qty":         float(ln.get("qty", 1) or 1),
            "unit":        str(ln.get("unit", "EA") or "EA").upper(),
            "unitPrice":   float(ln.get("unitPrice", 0) or 0),
            "currency":    currency,
            "remark":      str(ln.get("remark", "") or ""),
        })
    return out


def process_pdf(pdf_bytes: bytes) -> dict:
    md_text = ""
    table_rows: list[list] = []
    all_text = ""
    requires_ocr = False

    # ── Extract text ─────────────────────────────────────────────────────────
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        md_text = pymupdf4llm.to_markdown(doc, show_progress=False)
        doc.close()
        all_text = md_text
        log.info("pymupdf4llm: %d chars", len(md_text))
    except Exception as exc:
        log.warning("pymupdf4llm failed: %s", exc)

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                if not all_text:
                    all_text += (page.extract_text(x_tolerance=3, y_tolerance=3) or "") + "\n"
                for table in page.extract_tables():
                    table_rows.extend(row for row in table if row)
    except Exception as exc:
        log.warning("pdfplumber failed: %s", exc)

    # OCR for scanned / image-only PDFs
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

    # Strip Markdown markup for header-field regexes
    plain_text = re.sub(r"(?m)^#{1,6}\s+", "", all_text)
    plain_text = re.sub(r"[*`]", "", plain_text)
    text_lines = [ln for ln in plain_text.split("\n") if ln.strip()]
    currency = detect_currency(plain_text)

    # ── Tier 0: Claude LLM — primary extraction ──────────────────────────────
    llm_result = extract_with_llm(md_text or plain_text)
    extraction_method = "regex"

    if llm_result:
        extraction_method = "llm"
        supplier_name    = str(llm_result.get("supplierName", "") or "")
        supplier_tax_id  = str(llm_result.get("supplierTaxId", "") or "")
        quotation_number = str(llm_result.get("quotationNumber", "") or "")
        received_date    = str(llm_result.get("receivedDate", "") or "")
        valid_until      = str(llm_result.get("validUntil", "") or "")
        llm_currency     = str(llm_result.get("currency", "") or "")
        if llm_currency in ("THB", "JPY", "USD", "EUR"):
            currency = llm_currency
        total_amount     = float(llm_result.get("totalAmount", 0) or 0)
        items            = _normalise_llm_lines(llm_result.get("lines", []), currency)

        # Fallback to regex tiers only for fields the LLM left empty
        if not supplier_name:
            supplier_name = extract_supplier_name(text_lines)
        if not supplier_tax_id:
            supplier_tax_id = extract_tax_id(plain_text)
        if not quotation_number:
            quotation_number = extract_quotation_number(plain_text)
        if not received_date:
            received_date = find_date(plain_text, ["วันที่", "date", "Quotation Date", "Date:", "issued", "ออกเมื่อ"])
        if not valid_until:
            valid_until = find_date(plain_text, ["valid until", "valid to", "Valid Until",
                                                  "expiration", "expire", "หมดอายุ", "expiry", "ใช้ได้ถึง"])
        if total_amount <= 0:
            total_amount = extract_total(plain_text)

        # If LLM returned no line items, fall through to regex tiers below
        if not items:
            log.info("LLM returned 0 lines — falling back to regex tiers")
            extraction_method = "regex"
    else:
        # ── Regex path (no API key / LLM call failed) ────────────────────────
        supplier_name    = extract_supplier_name(text_lines)
        supplier_tax_id  = extract_tax_id(plain_text)
        quotation_number = extract_quotation_number(plain_text)
        received_date    = find_date(plain_text, ["วันที่", "date", "Quotation Date", "Date:", "issued", "ออกเมื่อ"])
        valid_until      = find_date(plain_text, ["valid until", "valid to", "Valid Until",
                                                   "expiration", "expire", "หมดอายุ", "expiry", "ใช้ได้ถึง"])
        total_amount     = extract_total(plain_text)
        items            = []

    # ── Line-item fallback tiers (run when LLM gave 0 items) ─────────────────
    if not items and md_text:
        items = parse_markdown_table(md_text, currency)
        if items:
            log.info("Tier 1 (Markdown): %d line items", len(items))

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

    if not items:
        items = lines_to_items(text_lines, currency)
        if items:
            log.info("Tier 3 (text regex): %d line items", len(items))

    if requires_ocr:
        extraction_method = "ocr"

    # ── Confidence scores ─────────────────────────────────────────────────────
    is_llm = extraction_method == "llm"

    def conf(val: str | float, strong: bool, weak: bool = False) -> str:
        if is_llm:
            return "high" if val else "none"
        return "high" if strong else ("low" if weak else "none")

    confidence = {
        "supplierName":    conf(supplier_name,    len(supplier_name) > 5,       bool(supplier_name)),
        "supplierTaxId":   conf(supplier_tax_id,  len(supplier_tax_id) == 13,   bool(supplier_tax_id)),
        "quotationNumber": conf(quotation_number, len(quotation_number) >= 5,   bool(quotation_number)),
        "receivedDate":    "high" if received_date else "none",
        "validUntil":      "high" if valid_until  else "none",
        "totalAmount":     "high" if total_amount > 0 else "none",
        "lines":           "high" if items else ("low" if not requires_ocr else "none"),
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
        "extractionMethod": extraction_method,
        "confidence":      confidence,
    }

# ── FastAPI endpoints ──────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    llm_enabled = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    return {
        "status":     "ok",
        "service":    "pdf-parser",
        "version":    "3.0.0",
        "llm":        DEFAULT_MODEL if llm_enabled else "disabled",
    }


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
        log.info("Done: supplier=%r lines=%d method=%s ocr=%s",
                 result["supplierName"], len(result["lines"]),
                 result["extractionMethod"], result["requiresOcr"])
        return JSONResponse(content=result)
    except Exception as exc:
        log.exception("Parse failed for %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc
