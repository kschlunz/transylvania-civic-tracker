#!/usr/bin/env python3
"""
Parse Transylvania County budget PDF into structured JSON.

Usage:
    pip install pdfplumber
    python scripts/parse-budget.py "src/data/FY26 Recommended Budget EXPENSE Full Report from Financial Software.pdf"

Output:
    src/data/budget-fy26.json
"""

import json
import re
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Install pdfplumber: pip install pdfplumber")
    sys.exit(1)


def clean_number(val):
    """Convert a financial string like '1,234,567.00' or '(1,234)' to float."""
    if not val or val.strip() in ("", "-", "N/A"):
        return 0.0
    val = val.strip()
    negative = val.startswith("(") and val.endswith(")")
    val = val.replace("(", "").replace(")", "").replace(",", "").replace("$", "").replace("%", "")
    try:
        result = float(val)
        return -result if negative else result
    except ValueError:
        return 0.0


# Lines to skip entirely
SKIP_PATTERNS = [
    "Transylvania County",
    "NEXT YEAR BUDGET",
    "PROJECTION:",
    "ACCOUNTS FOR:",
    "PRIOR FY3",
    "Report generated:",
    "User:",
    "Program ID:",
]


def parse_line_item(line):
    """
    Parse a line like:
    '101100 510100 SALARIES 55,782.07 73,940.81 76,393.07 73,098.31 79,142.00 81,436.64 2.9%'
    """
    match = re.match(r"^(\d{6})\s+(\d{6})\s+(\S+)\s+(.+)$", line)
    if not match:
        return None

    code1, code2, account_name, rest = match.group(1), match.group(2), match.group(3), match.group(4).strip()
    account_code = f"{code1} {code2}"

    parts = rest.split()
    numbers = [clean_number(p) for p in parts]

    if len(numbers) < 6:
        return None

    return {
        "accountCode": account_code,
        "accountName": account_name,
        "fy22": numbers[0],
        "fy23": numbers[1],
        "fy24": numbers[2],
        "fy25Actuals": numbers[3],
        "fy25Budget": numbers[4],
        "fy26Projection": numbers[5],
        "percentChange": numbers[6] if len(numbers) > 6 else 0.0,
    }


def parse_total_line(line):
    """
    Parse: 'TOTAL Commissioners 351,957.34 304,203.67 ...'
    Returns (department_name, totals_dict) or None.
    """
    match = re.match(r"^TOTAL\s+(.+?)\s+([\d,.\-]+(?:\s+[\d,.\-]+){5,})", line)
    if not match:
        return None

    dept_name = match.group(1).strip()
    rest = match.group(2).strip()
    parts = rest.split()
    numbers = [clean_number(p) for p in parts]

    if len(numbers) < 6:
        return None

    return (dept_name, {
        "fy22": numbers[0],
        "fy23": numbers[1],
        "fy24": numbers[2],
        "fy25Actuals": numbers[3],
        "fy25Budget": numbers[4],
        "fy26Projection": numbers[5],
        "percentChange": numbers[6] if len(numbers) > 6 else 0.0,
    })


def is_dept_header(line):
    """Detect department header lines like 'Commissioners ACTUALS ACTUALS ...'"""
    return bool(re.match(r"^(.+?)\s+ACTUALS\s+ACTUALS", line))


def get_dept_from_header(line):
    """Extract department name from header."""
    m = re.match(r"^(.+?)\s+ACTUALS\s+ACTUALS", line)
    return m.group(1).strip() if m else None


def parse_budget_pdf(pdf_path):
    """
    Two-pass approach:
    1. Collect all text lines from all pages (stripping headers/footers)
    2. Walk through lines: items accumulate, TOTAL lines close a department
    """
    all_lines = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                if any(line.startswith(p) for p in SKIP_PATTERNS):
                    continue
                if is_dept_header(line):
                    # Keep track of header dept name but don't add as a data line
                    all_lines.append(("HEADER", get_dept_from_header(line)))
                elif line.startswith("TOTAL "):
                    all_lines.append(("TOTAL", line))
                elif re.match(r"^\d{6}\s+\d{6}", line):
                    all_lines.append(("ITEM", line))
                # Skip everything else (page footers, blank, etc.)

    # Now walk the lines and build departments
    departments = []
    pending_items = []
    last_header_dept = None

    for tag, content in all_lines:
        if tag == "HEADER":
            last_header_dept = content
        elif tag == "ITEM":
            item = parse_line_item(content)
            if item:
                pending_items.append(item)
        elif tag == "TOTAL":
            result = parse_total_line(content)
            if result:
                dept_name, totals = result
                if pending_items:
                    # Assign department name to all pending items
                    for item in pending_items:
                        item["department"] = dept_name
                    departments.append({
                        "department": dept_name,
                        "totalsByYear": {
                            "fy22": totals["fy22"],
                            "fy23": totals["fy23"],
                            "fy24": totals["fy24"],
                            "fy25Actuals": totals["fy25Actuals"],
                            "fy25Budget": totals["fy25Budget"],
                            "fy26Projection": totals["fy26Projection"],
                        },
                        "percentChange": totals["percentChange"],
                        "lineItems": pending_items,
                    })
                    pending_items = []
                else:
                    # TOTAL with no items — department had items on previous pages
                    # that were already captured. Create an empty dept entry.
                    departments.append({
                        "department": dept_name,
                        "totalsByYear": {
                            "fy22": totals["fy22"],
                            "fy23": totals["fy23"],
                            "fy24": totals["fy24"],
                            "fy25Actuals": totals["fy25Actuals"],
                            "fy25Budget": totals["fy25Budget"],
                            "fy26Projection": totals["fy26Projection"],
                        },
                        "percentChange": totals["percentChange"],
                        "lineItems": [],
                    })

    # Handle any remaining items without a TOTAL
    if pending_items:
        dept_name = last_header_dept or "Unknown"
        totals_fy26 = sum(i["fy26Projection"] for i in pending_items)
        totals_fy25 = sum(i["fy25Budget"] for i in pending_items)
        pct = round(((totals_fy26 - totals_fy25) / abs(totals_fy25)) * 100, 2) if totals_fy25 != 0 else 0.0
        for item in pending_items:
            item["department"] = dept_name
        departments.append({
            "department": dept_name,
            "totalsByYear": {
                "fy22": round(sum(i["fy22"] for i in pending_items), 2),
                "fy23": round(sum(i["fy23"] for i in pending_items), 2),
                "fy24": round(sum(i["fy24"] for i in pending_items), 2),
                "fy25Actuals": round(sum(i["fy25Actuals"] for i in pending_items), 2),
                "fy25Budget": round(sum(i["fy25Budget"] for i in pending_items), 2),
                "fy26Projection": round(sum(i["fy26Projection"] for i in pending_items), 2),
            },
            "percentChange": pct,
            "lineItems": pending_items,
        })

    return {
        "lastUpdated": "2026-03-30",
        "sourceUrl": "",
        "fiscalYear": "FY2025-2026",
        "departments": departments,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/parse-budget.py <path-to-budget.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)

    print(f"Parsing budget PDF: {pdf_path}")
    budget = parse_budget_pdf(pdf_path)

    total_depts = len(budget["departments"])
    total_items = sum(len(d["lineItems"]) for d in budget["departments"])
    grand_total = sum(d["totalsByYear"]["fy26Projection"] for d in budget["departments"])

    print(f"\nExtracted:")
    print(f"  {total_depts} departments")
    print(f"  {total_items} line items")
    print(f"  FY26 projected total: ${grand_total:,.0f}")
    print()

    for dept in budget["departments"]:
        fy26 = dept["totalsByYear"]["fy26Projection"]
        pct = dept["percentChange"]
        n = len(dept["lineItems"])
        print(f"  {dept['department']:40s} ${fy26:>14,.0f}  ({pct:+.1f}%)  [{n} items]")

    out_path = Path(__file__).parent.parent / "src" / "data" / "budget-fy26.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(budget, f, indent=2)

    print(f"\nWritten to: {out_path}")


if __name__ == "__main__":
    main()
