#!/usr/bin/env python3
"""
Local test script for the PDF parser.
Run directly on the host (no Docker needed) to verify extraction quality
before deploying.

Usage:
    # Install deps first (in a venv):
    #   pip install pdfplumber PyMuPDF pytesseract Pillow
    #   (also: apt/brew install tesseract tesseract-lang-tha tesseract-lang-jpn)

    python test_parser.py path/to/quotation.pdf [path/to/another.pdf ...]
    python test_parser.py --dir /path/to/pdf/folder

Output: summary table + full JSON for each file.
"""

import argparse
import json
import sys
from pathlib import Path

# Force UTF-8 output on Windows so Thai/Japanese chars don't crash
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Import the parser module directly
sys.path.insert(0, str(Path(__file__).parent))
from main import process_pdf  # noqa: E402


def test_file(path: Path) -> dict:
    print(f"\n{'='*70}")
    print(f"FILE: {path.name}")
    print("="*70)

    with open(path, "rb") as f:
        pdf_bytes = f.read()

    result = process_pdf(pdf_bytes)

    # ── Summary table ──────────────────────────────────────────────────────
    print(f"  Supplier     : {result['supplierName']!r}  [{result['confidence']['supplierName']}]")
    print(f"  Tax ID       : {result['supplierTaxId']!r}  [{result['confidence']['supplierTaxId']}]")
    print(f"  Quotation No : {result['quotationNumber']!r}  [{result['confidence']['quotationNumber']}]")
    print(f"  Date         : {result['receivedDate']!r}  [{result['confidence']['receivedDate']}]")
    print(f"  Valid Until  : {result['validUntil']!r}  [{result['confidence']['validUntil']}]")
    print(f"  Currency     : {result['currency']}")
    print(f"  Total        : {result['totalAmount']:,.2f}  [{result['confidence']['totalAmount']}]")
    print(f"  OCR used     : {result['requiresOcr']}")
    print(f"  Lines found  : {len(result['lines'])}  [{result['confidence']['lines']}]")

    if result["lines"]:
        print("\n  LINE ITEMS:")
        print(f"  {'#':>3}  {'Item Code':<20}  {'Description':<40}  {'Qty':>6}  {'Unit':<6}  {'Unit Price':>12}")
        print("  " + "-"*95)
        for ln in result["lines"]:
            print(
                f"  {ln['lineNo']:>3}  {ln['itemCode']:<20}  {ln['description'][:40]:<40}  "
                f"{ln['qty']:>6.2f}  {ln['unit']:<6}  {ln['unitPrice']:>12,.2f}"
            )

    # ── Raw text preview ───────────────────────────────────────────────────
    raw_preview = result["rawText"][:600].replace("\n", "\\n ")
    print(f"\n  RAW TEXT (first 600 chars):\n  {raw_preview}")

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Test the PDF parser locally")
    parser.add_argument("files", nargs="*", help="PDF file paths")
    parser.add_argument("--dir", help="Directory containing PDF files")
    parser.add_argument("--json", action="store_true", help="Also print full JSON output")
    args = parser.parse_args()

    paths: list[Path] = []
    if args.dir:
        paths.extend(sorted(Path(args.dir).glob("*.pdf")))
    for f in args.files:
        paths.append(Path(f))

    if not paths:
        print("No PDF files specified. Use:  python test_parser.py file.pdf")
        sys.exit(1)

    results = []
    for path in paths:
        if not path.exists():
            print(f"ERROR: {path} does not exist")
            continue
        result = test_file(path)
        results.append({"file": path.name, **result})

    # ── Aggregate summary ──────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"SUMMARY — {len(results)} file(s) tested")
    print("="*70)
    for r in results:
        conf_scores = list(r["confidence"].values())
        high = conf_scores.count("high")
        total_fields = len(conf_scores)
        print(
            f"  {r['file']:<45}  "
            f"lines={len(r['lines']):>3}  "
            f"ocr={'Y' if r['requiresOcr'] else 'N'}  "
            f"confidence={high}/{total_fields} high"
        )

    if args.json:
        print("\nFULL JSON:")
        print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
