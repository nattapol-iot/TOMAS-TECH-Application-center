"""
PDF Parser Service for TOMAS TECH Supplier Quotations
======================================================
Tier 1  pymupdf4llm  → Markdown → column-aware table parser
Tier 2  pdfplumber   → raw table cells → heuristic cell matcher
Tier 3  text regex   → last-resort line-pattern matching
Tier 4  PyMuPDF + Tesseract OCR → for scanned / image-only PDFs

v2.2.0 — pdfplumber plain text primary for field extraction,
         supplier name exclusion set, Month DD YYYY date format,
         THB-first currency detection, more total/quotation-no patterns.
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

app = FastAPI(title="TOMAS PDF Parser", version="2.2.0")

# ── Constants ──────────────────────────────────────────────────────────────

OCR_LANG = "tha+eng+jpn"
OCR_DPI = 300
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
    "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
    "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
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

SKIP_PAT = re.compile(r"sub\s*total|grand\s*total|ภาษี|vat|discount|shipping|ค่าขนส่ง", re.I)

# ── Date helpers ───────────────────────────────────────────────────────────

def be_to_ce(y: int) -> int:
    return y - 543 if y > 2500 else y


def parse_date(raw: str) -> str:
    raw = raw.strip()
    # DD/MM/YYYY or DD-MM-YYYY
    m = re.fullmatch(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", raw)
    if m:
        d, mo = m.group(1).zfill(2), m.group(2).zfill(2)
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{mo}-{d}"
    # YYYY/MM/DD
    m = re.fullmatch(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", raw)
    if m:
        return f"{be_to_ce(int(m.group(1)))}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    # DD MonthName YYYY  (Thai or English, space-separated)
    m = re.fullmatch(r"(\d{1,2})\s+([^\d\s]{2,20})\s+(\d{2,4})", raw)
    if m:
        d = m.group(1).zfill(2)
        raw_mo = m.group(2)
        key = raw_mo.lower().rstrip(".")
        mo = (MONTH_TH.get(raw_mo) or MONTH_TH.get(raw_mo.rstrip("."))
              or MONTH_EN.get(key) or MONTH_EN.get(key[:3]) or 1)
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{str(mo).zfill(2)}-{d}"
    # DD-MonthName-YYYY  (dash-separated, e.g. "09-Jul-2026" from Keyence-style docs)
    m = re.fullmatch(r"(\d{1,2})-([A-Za-z]{3,15})-(\d{2,4})", raw)
    if m:
        d = m.group(1).zfill(2)
        key = m.group(2).lower()
        mo = MONTH_EN.get(key) or MONTH_EN.get(key[:3]) or 1
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{str(mo).zfill(2)}-{d}"
    # Month DD, YYYY  (e.g. "September 11, 2026")
    m = re.fullmatch(r"([A-Za-z]{3,15})\s+(\d{1,2}),?\s+(\d{2,4})", raw)
    if m:
        key = m.group(1).lower()
        mo = MONTH_EN.get(key) or MONTH_EN.get(key[:3]) or 1
        d = m.group(2).zfill(2)
        yr = int(m.group(3)) if len(m.group(3)) == 4 else int(f"20{m.group(3)}")
        return f"{be_to_ce(yr)}-{str(mo).zfill(2)}-{d}"
    return ""


def find_date(text: str, keywords: list[str]) -> str:
    for kw in keywords:
        # keyword followed by "Month DD, YYYY" (e.g. "Date: September 11, 2026")
        pat3 = re.escape(kw) + r"[:\s]*([A-Za-z]{3,15}\s+\d{1,2},?\s+\d{2,4})"
        m = re.search(pat3, text, re.IGNORECASE)
        if m:
            d = parse_date(m.group(1).strip())
            if d:
                return d
        # keyword followed by Thai/English date with month name
        pat = re.escape(kw) + r"[:\s]*(\d{1,2}[\s/\-][^\d\n\r]{2,15}[\s/\-]\d{2,4})"
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            d = parse_date(m.group(1).strip())
            if d:
                return d
        # keyword followed by numeric date
        pat2 = re.escape(kw) + r"[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})"
        m = re.search(pat2, text, re.IGNORECASE)
        if m:
            d = parse_date(m.group(1).strip())
            if d:
                return d
    # fallback 1: bare DD-Mon-YYYY (e.g. "09-Jul-2026" without preceding keyword)
    m = re.search(r"\b(\d{1,2}-[A-Za-z]{3,15}-\d{4})\b", text)
    if m:
        d = parse_date(m.group(1))
        if d:
            return d
    # fallback 2: bare numeric date
    m = re.search(r"\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\b", text)
    return parse_date(m.group(1)) if m else ""

def later_date_on_a_shared_line(text: str, after: str) -> str:
    """
    The expiry when a header is laid out in columns.

        วันที่เสนอราคา   วันหมดอายุ   พนักงานขาย
        22/09/2026      22/10/2026   ...

    Extracted as text, the labels land on one line and their values on the next, so
    searching forward from "หมดอายุ" finds the issue date sitting directly under it.
    A line carrying two dates settles it: the later one is the expiry.
    """
    for line in text.split("\n"):
        found = [d for d in (parse_date(raw) for raw in
                             re.findall(r"\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}", line)) if d]
        later = sorted(d for d in found if d > after)
        if len(found) >= 2 and later:
            return later[0]
    return ""


# ── Field extraction helpers ───────────────────────────────────────────────

def detect_currency(text: str) -> str:
    # Check THB first — explicit marker beats default
    if re.search(r"\bTHB\b|฿|\bBaht\b|\bบาท\b", text, re.I):
        return "THB"
    if re.search(r"\bJPY\b|\bYEN\b|¥", text, re.I):
        return "JPY"
    if re.search(r"\bUSD\b|\bUS\$|\$\d", text, re.I):
        return "USD"
    if re.search(r"\bEUR\b|€", text, re.I):
        return "EUR"
    return "THB"


def extract_tax_id(text: str, top_lines: Optional[list[str]] = None) -> str:
    # Search in supplier letterhead (top lines) first to avoid picking up the buyer's tax ID.
    # Build a combined search text: supplier section first, then full text as fallback.
    search_text = "\n".join((top_lines or [])[:30]) + "\n" + text if top_lines else text
    # Thai 13-digit tax ID — may be formatted with dashes
    m = re.search(r"(?:เลขประจำตัวผู้เสียภาษี|tax\s*id|taxpayer)[:\s]*(\d[\d\-]{12,16})", search_text, re.I)
    if m:
        return re.sub(r"\D", "", m.group(1))[:13]
    m = re.search(r"\b(\d{13})\b", search_text)
    if m:
        return m.group(1)
    m = re.search(r"(\d{1}-\d{4}-\d{5}-\d{1,2}-\d{1})", search_text)
    if m:
        return m.group(1).replace("-", "")
    return ""


def extract_quotation_number(text: str) -> str:
    # Labeled patterns first (most reliable)
    labeled = re.search(
        r"(?:quotation\s*(?:no\.?|number:?|no:)|invoice\s*(?:no\.?|number:?)|"
        r"ใบเสนอราคา(?:เลขที่|ที่)?|เลขที่ใบเสนอราคา|เลขที่เอกสาร|เลขที่ใบ|เลขที่\s*:|"
        r"QT\s*(?:NO\.?|:)|BT\s*NO\.?|SQ\s*NO\.?|"
        r"doc(?:ument)?\s*(?:no\.?|number)|"
        r"REF\s*(?:NO\.?|:)|REFERENCE\s*(?:NO\.?|:)|"
        r"PO\s*(?:NO\.?|:)|order\s*(?:no\.?|number:?)|"
        r"document\s*no\.?)"
        r"[:\s#\/]*([A-Z0-9][A-Z0-9\-\/\.]{3,29})",
        text, re.I,
    )
    if labeled:
        return labeled.group(1).strip()
    # Known document-number patterns
    known = re.search(
        r"\b(QT[\-\d]{4,}|QT\d{4}[-\d]+|SQ[\d\-]{4,}|BT\d{2}[-\d]{5,}|"
        r"OTP\d{6,}|TMTS\d{2}-\d+|FA\d+[A-Z]+|QCA\d+|Q\d{6,}|"
        r"INV[\-\d]{4,}|WIV\d+|[A-Z]{2,4}\d{4,}[-\w]*)",
        text,
    )
    if known:
        c = known.group(1)
        if not re.fullmatch(r"0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}", c):  # not a phone number
            return c
    # Generic "No. : XXXX" pattern
    for pat in [
        r"(?:No\.|NO\.)\s*[:\-]\s*([A-Z0-9][A-Z0-9\-\/\.]{4,24})",
        r"เลขที่[:\s]*([A-Z0-9\-\/]{5,24})",
    ]:
        m = re.search(pat, text, re.I)
        if m:
            c = m.group(1).strip()
            if not re.fullmatch(r"0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}", c):
                return c
    # Pure numeric doc reference: 6-10 digit number immediately followed by a date
    # e.g. "11244565 09-Jul-2026 1 / 1"  (Keyence/MISUMI style)
    m = re.search(r"\b(\d{6,10})\s+\d{1,2}[-/][A-Za-z\d]{2,3}[-/]\d{4}\b", text)
    if m:
        c = m.group(1)
        if len(c) != 13:          # not a tax ID
            return c
    return ""


def extract_supplier_name(lines: list[str], metadata: Optional[dict] = None) -> str:
    # Buyer-section markers — the supplier name only appears ABOVE these lines.
    # Everything from "To:", "Bill To:", "เรียน:", etc. onward is the buyer section
    # where our own company name (TOMAS TECH) will appear and must be ignored.
    BUYER_SECTION_PAT = re.compile(
        r"^(?:to\s*:|bill\s*to\s*:|ship\s*to\s*:|attention\s*:|attn\s*:|เรียน\s*:|ถึง\s*:|ที่\s*:|"
        r"quotation\s+to\s*:|customer\s*:|sold\s*to\s*:)",
        re.I,
    )

    def is_garbled(t: str) -> bool:
        # Thai consonant immediately adjacent to an ASCII letter (OCR artefact)
        if re.search(r"[ก-ฮ][A-Za-z]|[A-Za-z][ก-ฮ]", t):
            return True
        # Short string of bare Thai consonants with no vowels/tone marks
        # (real Thai words always carry vowel characters U+0E30-U+0E4E)
        if len(t) <= 12 and not re.search(r"[ะ-๎]", t):
            pure_consonants = re.sub(r"[^ก-ฮ]", "", t)
            if len(pure_consonants) >= 3:
                return True
        return False

    def eng_ratio(s: str) -> float:
        alpha = [c for c in s if c.isalpha()]
        if not alpha:
            return 0.0
        return sum(1 for c in alpha if c.isascii()) / len(alpha)

    def clean_name(t: str) -> str:
        # Strip Thai company-type prefix words
        t = re.sub(r"^(?:บริษัท|หจก\.|ห้างหุ้นส่วน(?:จำกัด)?)\s*", "", t).strip()
        # Strip everything from address indicators onward
        t = re.sub(r"\s+(?:ที่อยู่|ที่อยู|no\.\s*\d|no\s+\d|\d{1,3}\s*[,/]|soi\b|road\b|rd\.\b|floor\b|fl[,\s]|tower\b)", " ", t, flags=re.I)
        t = re.sub(r"\s{2,}", " ", t).strip()
        t = t.rstrip(".,; ").strip()
        # Remove corrupted/non-printable characters
        t = re.sub(r"[^\x20-\x7E฀-๿()/.,'&\-]", "", t).strip()
        return t

    # Words that identify the document type, not the supplier — excluded from Pass 2
    DOCUMENT_TYPE_WORDS = {
        "QUOTATION", "TAX INVOICE", "INVOICE", "PURCHASE ORDER", "DELIVERY NOTE",
        "RECEIPT", "PROFORMA", "CREDIT NOTE", "DEBIT NOTE", "PACKING LIST",
        "STATEMENT", "PROPOSAL", "OFFER", "ESTIMATE", "ORDER CONFIRMATION",
    }
    _doc_type_nospace = {w.replace(" ", "") for w in DOCUMENT_TYPE_WORDS}

    # Cut off search window at the buyer section — supplier letterhead is always above it
    search_lines: list[str] = []
    for line in lines[:60]:
        if BUYER_SECTION_PAT.match(line.strip()):
            break
        search_lines.append(line)

    # Metadata check — PDF author/creator fields often contain the supplier company name
    if metadata:
        for key in ("author", "creator"):
            val = (metadata.get(key) or "").strip()
            if 5 <= len(val) <= 100 and not is_garbled(val) and eng_ratio(val) >= 0.5:
                if re.search(r"\bco\.,?\s*ltd\.?|\binc\.|\bcorp\.|\blimited\b", val, re.I):
                    return clean_name(val)

    # Pass 1: line with explicit English company suffix (CO.,LTD. / INC. / CORP. etc.)
    for line in search_lines:
        t = line.strip()
        if len(t) < 5 or len(t) > 250:
            continue
        if is_garbled(t):
            continue
        if re.search(r"\bco\.,?\s*ltd\.?|\binc\.|\bcorp\.|\blimited\b|\bpte\.\s*ltd", t, re.I):
            name = clean_name(t)
            # Must be at least half English characters — reject Thai-only names
            if len(name) >= 5 and eng_ratio(name) >= 0.5:
                return name

    # Pass 2: short all-caps English line (letterhead / logo text)
    # Skip lines that are document-type words (e.g. "QUOTATION", "INVOICE")
    for line in search_lines[:20]:
        t = line.strip()
        if 5 <= len(t) <= 70 and t == t.upper() and re.search(r"[A-Z]{3}", t):
            if not re.search(r"\d{5,}|@|http|[฀-๿]", t):
                if t.upper() in DOCUMENT_TYPE_WORDS:
                    continue
                if t.upper().replace(" ", "") in _doc_type_nospace:
                    continue
                return t

    return ""


def extract_total(text: str) -> float:
    patterns = [
        r"(?:grand\s*total|total\s*net|net\s*total|ยอดรวมทั้งหมด|ยอดสุทธิ|รวมทั้งสิ้น)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:net\s*amount|net\s*total|total\s*net)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:รวมเงิน|ราคารวม|มูลค่ารวม|ยอดชำระ|ยอดสุทธิ)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:total\s*amount|amount\s*due)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:total)[^\d\n]*([\d,]+\.?\d*)",
        r"(?:รวม)[^\d\n]*([\d,]+\.?\d*)",
    ]
    best = 0.0
    for pat in patterns:
        for m in re.finditer(pat, text, re.I):
            raw = m.group(1).replace(",", "").strip()
            try:
                v = float(raw)
                if v > best:
                    best = v
                    break   # take first match per pattern, largest wins across patterns
            except ValueError:
                continue
    return best

# ── Numeric helpers ────────────────────────────────────────────────────────

def is_numeric(s: Optional[str]) -> bool:
    if not s:
        return False
    return bool(re.fullmatch(r"[\d,]+\.?\d*\s*[฿¥€$]?", s.strip()))


# A great many quotations print the part number in front of the description instead
# of giving it a column: "[TPL-0226] TP-LINK Media Converter". Pulling it out gives
# the line a real item code — which is what the Price Library and the Item type-ahead
# search on — and leaves the description reading as a name.
LEADING_CODE_PAT = re.compile(r"^[\[(]\s*([A-Za-z0-9][A-Za-z0-9\-_/.]{2,39})\s*[\])]\s*(.+)$", re.S)


def split_leading_code(description: str) -> tuple[str, str]:
    """Return (item_code, description-without-the-code), or ("", description)."""
    m = LEADING_CODE_PAT.match(description.strip())
    if not m:
        return "", description
    code, rest = m.group(1), m.group(2).strip()
    # A bracket holding a word is a note, not a part number; a part number has a digit.
    if not rest or not re.search(r"\d", code):
        return "", description
    return code, rest


def clean_num(s: str) -> float:
    cleaned = re.sub(r"[,฿¥€$\s]", "", s)
    return float(cleaned) if cleaned else 0.0

# ── Tier 1: pymupdf4llm Markdown table parser (column-aware) ──────────────

def _find_col(headers: list[str], keywords: list[str],
              exclude: Optional[set[int]] = None) -> Optional[int]:
    """Return the first column whose header contains any keyword, checked in keyword-priority
    order so that more-specific keywords (earlier in the list) win over generic ones.
    Columns in `exclude` are skipped (used for conflict resolution)."""
    for kw in keywords:
        kw_l = kw.lower()
        for i, h in enumerate(headers):
            if exclude and i in exclude:
                continue
            h_norm = re.sub(r"\s+", " ", h.lower().strip())
            if kw_l in h_norm:
                return i
    return None


def _detect_columns(header: list[str]) -> dict:
    """
    Detect column roles from header cells with conflict resolution.

    Priority rules:
    - Most-specific keywords first (e.g. "item description" beats "item")
    - desc/code conflict: if both map to same col, try to find alternative for code
    - unit vs unit-price: exact "unit" match only, never substring of "unit price"
    - Covers EN / TH / JP / CN / common abbreviation variants
    """
    # ── Description ─────────────────────────────────────────────
    DESC_KW = [
        "item description", "product description", "goods description",
        "description", "descriptions",
        "detail", "details",
        "product name", "product",
        "material description", "material",
        "รายการสินค้า", "ชื่อสินค้า", "รายละเอียดสินค้า",
        "รายการ", "รายละเอียด", "ชื่อ", "สินค้า",
        "goods", "commodity",
        "品名", "商品名", "規格", "品目",
        "名称",
    ]
    # ── Item code / part number ──────────────────────────────────
    CODE_KW = [
        "part number", "part no.", "part no",
        "item number", "item no.", "item no",
        "item code", "product code", "goods code",
        "model number", "model no.", "model no",
        "code", "part", "item",
        "รหัสสินค้า", "รหัส", "รุ่น",
        "model", "sku", "ref", "cat no", "catalog no",
        "品番", "型番", "品名コード",
    ]
    # ── Quantity ────────────────────────────────────────────────
    QTY_KW = [
        "quantity", "จำนวน",
        "qty", "pcs", "pieces", "count", "数量", "個数",
    ]
    # ── Unit price ──────────────────────────────────────────────
    PRICE_KW = [
        "unit price", "price per unit", "price/unit", "price / unit",
        "unitprice", "unit\nprice", "rate",
        "ราคาต่อหน่วย", "ราคา/หน่วย",
        "単価", "单价",
        "price", "ราคา",
    ]
    # ── Line total / amount ──────────────────────────────────────
    AMOUNT_KW = [
        "line total", "line amount", "extended price", "ext price", "ext. price",
        "total price", "total amount",
        # "จำนวนเงิน" is what a Thai quotation calls the line amount. Without it the
        # amount column is never found, and with no amount there is nothing to check
        # the quantity against.
        "จำนวนเงิน", "มูลค่า", "เป็นเงิน",
        "amount", "total",
        "ยอดรวม", "รวมเงิน", "รวม", "ยอด",
        "金額", "合計", "小計",
        "ext",
    ]
    # ── Unit of measure ─────────────────────────────────────────
    UOM_KW = ["uom", "u/m", "หน่วย", "単位", "单位"]

    desc_col   = _find_col(header, DESC_KW)
    qty_col    = _find_col(header, QTY_KW)
    price_col  = _find_col(header, PRICE_KW)
    amount_col = _find_col(header, AMOUNT_KW)
    code_col   = _find_col(header, CODE_KW)

    # "จำนวน" is a prefix of "จำนวนเงิน": on a table that names only the amount, the
    # quantity search would claim the amount column. The amount keyword is the more
    # specific of the two, so the quantity gives way and looks again elsewhere.
    if qty_col is not None and qty_col == amount_col:
        qty_col = _find_col(header, QTY_KW, exclude={amount_col})

    # Exact-match "unit" / "uom" only — prevent "Unit Price" being picked as UOM
    unit_col: Optional[int] = None
    for i, h in enumerate(header):
        hn = h.strip().lower()
        if hn in ("unit", "uom", "u/m", "u.m.", "หน่วย"):
            unit_col = i
            break
    if unit_col is None:
        # "หน่วย" also sits inside "ราคาต่อหน่วย", so the loose search would return the
        # price column and every line would take its unit of measure from a number.
        taken = {i for i in (price_col, amount_col, qty_col, desc_col) if i is not None}
        unit_col = _find_col(header, UOM_KW, exclude=taken)
        if unit_col is not None and re.search(r"ราคา|price|amount|จำนวนเงิน|単価|金額", header[unit_col], re.I):
            unit_col = None

    # ── Conflict resolution ──────────────────────────────────────
    # If desc and code point at the same column, the match was ambiguous.
    # Re-run code search excluding desc_col; if nothing found, leave code=None.
    if code_col is not None and code_col == desc_col:
        code_col = _find_col(header, CODE_KW, exclude={desc_col})

    # price_col must not equal amount_col (e.g. single "Total" column table).
    # In that case prefer amount_col and leave price_col=None.
    if price_col is not None and price_col == amount_col:
        price_col = _find_col(header, PRICE_KW, exclude={amount_col})

    return {
        "desc": desc_col, "qty": qty_col, "price": price_col,
        "amount": amount_col, "code": code_col, "unit": unit_col,
    }


def parse_markdown_table(md: str, currency: str) -> list[dict]:
    items: list[dict] = []
    seen_desc: set[str] = set()
    line_no = 1

    # Remember column positions from the last valid table — used for continuation
    # tables on page 2+ that lack headers (common in multi-page PDFs).
    last_col_map: Optional[dict] = None
    last_n_cols: int = 0

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

        if len(table_lines) < 2:
            continue

        has_separator = len(table_lines) >= 2 and re.match(r"^\|[-: |]+\|$", table_lines[1])

        if has_separator:
            # Normal table with header row
            header = [c.strip() for c in table_lines[0].split("|")[1:-1]]
            n_cols = len(header)
            data_rows = table_lines[2:]

            col_map = _detect_columns(header)
            desc_col   = col_map["desc"]
            qty_col    = col_map["qty"]
            price_col  = col_map["price"]
            amount_col = col_map["amount"]
            code_col   = col_map["code"]
            unit_col   = col_map["unit"]

            if desc_col is None and price_col is None and amount_col is None:
                continue

            # Save column map for continuation tables (page 2+)
            last_col_map = col_map
            last_n_cols = n_cols
        else:
            # No separator → headerless continuation table from a later page
            # Try to reuse column positions from the previous table if column count matches
            n_cols = len(table_lines[0].split("|")) - 2
            if last_col_map is None or n_cols != last_n_cols:
                continue
            desc_col   = last_col_map["desc"]
            qty_col    = last_col_map["qty"]
            price_col  = last_col_map["price"]
            amount_col = last_col_map["amount"]
            code_col   = last_col_map["code"]
            unit_col   = last_col_map["unit"]
            data_rows  = table_lines

        for row_text in data_rows:
            cells = [c.strip() for c in row_text.split("|")[1:-1]]
            while len(cells) < n_cols:
                cells.append("")
            cells = cells[:n_cols]

            # Description
            if desc_col is not None and desc_col < len(cells):
                desc = cells[desc_col]
            elif code_col is not None and code_col < len(cells):
                # Supplier has no separate description column — use the code column as desc
                desc = cells[code_col]
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
            if re.match(r"^(?:no\.?|#|ลำดับ|item|description|รายการ|qty|จำนวน|price|ราคา|amount|unit)$", desc, re.I):
                continue
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

            # Fallback: pick last two positive numbers in the row
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

            # Quantity: the column when it reads as a number, otherwise the arithmetic
            # the line already states. A column that is present but unreadable used to
            # skip the arithmetic entirely and leave every line quietly at one, which
            # is the difference between a 550 baht line and an 1,100 baht one.
            qty = 0.0
            if qty_col is not None and qty_col < len(cells):
                m = re.match(r"([\d,]+\.?\d*)", cells[qty_col].replace(" ", ""))
                if m:
                    try:
                        qty = clean_num(m.group(1))
                    except ValueError:
                        qty = 0.0
            if qty <= 0 and unit_price > 0 and amount > 0:
                q = round(amount / unit_price, 4)
                if 0 < q <= 100_000:
                    qty = q
            if qty <= 0:
                qty = 1.0

            # Item code
            item_code = ""
            if code_col is not None and code_col < len(cells):
                c = cells[code_col]
                if c and not is_numeric(c) and re.search(r"[A-Z0-9]", c, re.I):
                    item_code = re.sub(r"\s+", "", c)[:40]
            if not item_code:
                item_code, desc = split_leading_code(desc)
            # No separate description column → code is also the description
            if desc_col is None and item_code:
                desc = item_code

            # Unit
            unit = "EA"
            if unit_col is not None and unit_col < len(cells):
                u = cells[unit_col].strip()
                if u.lower().rstrip("s") in UNIT_TOKENS:
                    unit = u.upper()

            if desc not in seen_desc:
                seen_desc.add(desc)
                items.append({
                    "lineNo":      line_no,
                    "itemCode":    item_code,
                    "description": desc,
                    "brand":       "",
                    "model":       item_code,
                    "qty":         qty,
                    "unit":        unit,
                    "unitPrice":   effective_price,
                    "currency":    currency,
                    "remark":      "",
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
    if not description or len(description) < 3:
        return None
    if SKIP_PAT.search(description):
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
    if not item_code:
        item_code, description = split_leading_code(description)

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

        # MISUMI-style:  no  CODE  qty  unit  price  amount
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

        # Generic:  no  description  unit_price  amount
        m = re.match(r"^\s*(\d{1,4})\s+(.{3,70}?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$", raw)
        if m:
            price = clean_num(m.group(3))
            amount = clean_num(m.group(4))
            qty = round(amount / price, 4) if price > 0 and amount >= price else 1.0
            desc = m.group(2).strip()
            if len(desc) >= 3 and (price > 0 or amount > 0) and not SKIP_PAT.search(desc):
                results.append({
                    "lineNo": line_no, "itemCode": "", "description": desc,
                    "brand": "", "model": "", "qty": qty, "unit": "EA",
                    "unitPrice": price, "currency": currency, "remark": "",
                })
                line_no += 1
                continue

        # Single-price Thai:  no  description  price
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

def extract_supplier_from_layout(pdf_bytes: bytes) -> str:
    """
    Coordinate-based supplier name extraction using pymupdf text blocks.

    Strategy: on page 1, collect text blocks in the top 35% of the page.
    The supplier name is typically the largest-font or topmost prominent
    English text before any 'To:' / buyer section appears.

    Returns the best candidate or "" if nothing found.
    """
    SELF_PAT = re.compile(r"tomas\s*tech|tomastc|โทมัสเทค", re.I)
    BUYER_KW  = re.compile(
        r"^(?:to\s*:|bill\s*to|ship\s*to|attention:|attn:|เรียน|ถึง:|customer:)",
        re.I,
    )
    DOC_TYPE = {
        "QUOTATION","INVOICE","TAX INVOICE","PURCHASE ORDER","RECEIPT",
        "PROFORMA","DELIVERY NOTE","PACKING LIST","STATEMENT","PROPOSAL",
        "OFFER","ESTIMATE","ORDER CONFIRMATION","CREDIT NOTE","DEBIT NOTE",
    }

    def _eng_ratio(s: str) -> float:
        alpha = [c for c in s if c.isalpha()]
        return sum(1 for c in alpha if c.isascii()) / len(alpha) if alpha else 0.0

    def _is_garbled(t: str) -> bool:
        if re.search(r"[ก-ฮ][A-Za-z]|[A-Za-z][ก-ฮ]", t):
            return True
        if len(t) <= 12 and not re.search(r"[ะ-๎]", t):
            if len(re.sub(r"[^ก-ฮ]", "", t)) >= 3:
                return True
        return False

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        page_h = page.rect.height
        cutoff_y = page_h * 0.40   # look only in top 40% of first page

        # Collect (y0, font_size, text) for blocks in the header area
        candidates: list[tuple[float, float, str]] = []
        for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]:
            if block.get("type") != 0:   # 0 = text block
                continue
            block_y0 = block["bbox"][1]
            if block_y0 > cutoff_y:
                break
            for line in block.get("lines", []):
                line_text = " ".join(
                    span["text"] for span in line.get("spans", [])
                ).strip()
                if not line_text or len(line_text) < 3:
                    continue
                if BUYER_KW.match(line_text):
                    # Reached the buyer section — stop collecting
                    doc.close()
                    candidates.sort()   # sort by y position
                    return _pick_best(candidates, SELF_PAT, DOC_TYPE, _eng_ratio, _is_garbled)
                avg_size = (
                    sum(s["size"] for s in line.get("spans", []) if s.get("size"))
                    / max(len(line.get("spans", [])), 1)
                )
                candidates.append((block_y0, avg_size, line_text))

        doc.close()

        # Sort by y position (top → bottom) and pick the best candidate
        candidates.sort(key=lambda x: x[0])
        return _pick_best(candidates, SELF_PAT, DOC_TYPE, _eng_ratio, _is_garbled)

    except Exception as exc:
        log.warning("Layout-based supplier extraction failed: %s", exc)
        return ""


def _pick_best(candidates, SELF_PAT, DOC_TYPE, _eng_ratio, _is_garbled) -> str:
    """Pick the best supplier name from (y0, font_size, text) candidates."""
    COMPANY_KW = re.compile(
        r"\bco\.,?\s*ltd\.?|\binc\.|\bcorp\.|\blimited\b|\bpte\.\s*ltd|"
        r"จำกัด|บริษัท|หจก\.",
        re.I,
    )

    def _clean(t: str) -> str:
        t = re.sub(r"^(?:บริษัท|หจก\.|ห้างหุ้นส่วน(?:จำกัด)?)\s*", "", t).strip()
        t = re.sub(
            r"\s+(?:ที่อยู่|no\.\s*\d|no\s+\d|\d{1,3}\s*[,/]|soi\b|road\b|rd\.\b|floor\b|fl[,\s]|tower\b)",
            "", t, flags=re.I,
        )
        t = re.sub(r"\s{2,}", " ", t).strip().rstrip(".,; ")
        return t

    # Pass A: line with explicit English company suffix, good eng_ratio
    for _, _size, text in candidates:
        if SELF_PAT.search(text) or _is_garbled(text):
            continue
        if COMPANY_KW.search(text):
            name = _clean(text)
            if len(name) >= 5 and _eng_ratio(name) >= 0.5:
                return name

    # Pass B: short all-caps line that looks like a brand / company (not a doc-type word)
    for _, _size, text in candidates[:15]:
        t = text.strip()
        if SELF_PAT.search(t) or _is_garbled(t):
            continue
        if 5 <= len(t) <= 70 and t == t.upper() and re.search(r"[A-Z]{3}", t):
            if not re.search(r"\d{5,}|@|http|[฀-๿]", t):
                if t.upper() not in DOC_TYPE and t.upper().replace(" ", "") not in {
                    w.replace(" ", "") for w in DOC_TYPE
                }:
                    return t

    return ""


def process_pdf(pdf_bytes: bytes) -> dict:
    md_text = ""
    table_rows: list[list] = []
    all_text = ""
    plumber_text = ""
    pdf_meta: dict = {}
    requires_ocr = False

    # ── Tier 1: pymupdf4llm → Markdown ────────────────────────────────────
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pdf_meta = doc.metadata or {}
        md_text = pymupdf4llm.to_markdown(doc, show_progress=False)
        doc.close()
        all_text = md_text
        log.info("pymupdf4llm: %d chars", len(md_text))
    except Exception as exc:
        log.warning("pymupdf4llm failed: %s", exc)

    # ── Tier 2: pdfplumber → table rows + plain text backup ───────────────
    plumber_text = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                plumber_text += page_text + "\n"
                if not all_text:
                    all_text += page_text + "\n"
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

    # Use pdfplumber plain text for field extraction (cleaner than markdown — no | or # noise).
    # Fall back to stripped markdown text if pdfplumber returned nothing.
    extraction_text = plumber_text.strip() if plumber_text.strip() else plain_text
    text_lines = [ln for ln in extraction_text.split("\n") if ln.strip()]
    currency = detect_currency(extraction_text)

    # ── Header fields ──────────────────────────────────────────────────────
    # Pass 0: coordinate-based layout extraction (most reliable for digital PDFs)
    supplier_name = extract_supplier_from_layout(pdf_bytes)
    log.info("Layout supplier: %r", supplier_name)
    # Pass 1+: regex/metadata fallback when layout extraction returns nothing
    if not supplier_name:
        supplier_name = extract_supplier_name(text_lines, metadata=pdf_meta)
        log.info("Regex supplier: %r", supplier_name)
    supplier_tax_id   = extract_tax_id(extraction_text, top_lines=text_lines)
    quotation_number  = extract_quotation_number(extraction_text)
    received_date     = find_date(extraction_text, [
        "วันที่", "date", "Quotation Date", "Issue Date", "Date:", "issued", "ออกเมื่อ",
    ])
    valid_until       = find_date(extraction_text, [
        "valid until", "valid to", "Valid Until",
        "Expire Date", "expiry date", "expiration date", "expiration", "expire",
        "หมดอายุ", "expiry", "ใช้ได้ถึง", "validity",
    ])
    # Issued and expiring on the same day means a column header was read straight down
    # instead of across. Recover the expiry from a line that carries both dates, and
    # claim nothing rather than an expiry that is already past on the day of issue.
    if valid_until and received_date and valid_until <= received_date:
        valid_until = later_date_on_a_shared_line(extraction_text, received_date)
    total_amount      = extract_total(extraction_text)

    # ── Line items: try each tier until results appear ─────────────────────
    items: list[dict] = []

    if md_text:
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

    # ── Confidence ────────────────────────────────────────────────────────
    confidence = {
        "supplierName":    "high" if len(supplier_name) > 5 else ("low" if supplier_name else "none"),
        "supplierTaxId":   "high" if len(supplier_tax_id) == 13 else ("low" if supplier_tax_id else "none"),
        "quotationNumber": "high" if len(quotation_number) >= 5 else ("low" if quotation_number else "none"),
        "receivedDate":    "high" if received_date else "none",
        "validUntil":      "high" if valid_until else "none",
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
        "rawText":         extraction_text[:8000],
        "requiresOcr":     requires_ocr,
        "confidence":      confidence,
    }

# ── FastAPI endpoints ──────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "pdf-parser", "version": "2.2.0"}


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
